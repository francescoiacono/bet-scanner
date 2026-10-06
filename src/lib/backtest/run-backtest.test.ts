import { describe, expect, it } from "vitest";
import { mockPlayedMatches } from "../../data/mock-played-matches";
import { predictMatch } from "../football/predict-match";
import { calculateHistoricalLeagueAverages, deriveTeamProfiles, hasEnoughHistory, kickoffTimestamp } from "./history";
import { runBacktest } from "./run-backtest";

describe("time-causal walk-forward evaluation", () => {
  it("skips the first four rounds and evaluates the last four under the default warm-up", () => {
    const result = runBacktest(mockPlayedMatches);
    expect(result.modelVersion).toBe("poisson-v1");
    expect(result.minimumVenueMatches).toBe(2);
    expect(result.summary.totalHistoricalMatches).toBe(48);
    expect(result.predictions).toHaveLength(24);
    expect(result.skippedMatches).toHaveLength(24);
    expect(result.skippedMatches.every((match) => match.reason === "INSUFFICIENT_HISTORY")).toBe(true);
    expect(result.predictions[0].id).toBe("played-5-1");
    expect(result.summary.uniformBenchmarkBrier).toBeCloseTo(2 / 3, 12);
    expect(result.summary.calibrationBuckets.reduce((count, bucket) => count + bucket.count, 0)).toBe(24);
  });

  it("uses precisely the strict earlier-kickoff subset for every prediction", () => {
    for (const record of runBacktest(mockPlayedMatches).predictions) {
      const prior = mockPlayedMatches.filter((match) => kickoffTimestamp(match.kickoffAt) < kickoffTimestamp(record.kickoffAt));
      const profiles = new Map(deriveTeamProfiles(prior).map((profile) => [profile.team, profile]));
      const home = profiles.get(record.homeTeam)!;
      const away = profiles.get(record.awayTeam)!;
      expect(hasEnoughHistory(home)).toBe(true);
      expect(hasEnoughHistory(away)).toBe(true);
      expect(record.trainingMatchCount).toBe(prior.length);
      expect(kickoffTimestamp(record.latestTrainingKickoffAt)).toBeLessThan(kickoffTimestamp(record.kickoffAt));
      expect(record.leagueAverages).toEqual(calculateHistoricalLeagueAverages(prior));
      expect(record.prediction).toEqual(predictMatch(
        { id: record.id, homeTeam: record.homeTeam, awayTeam: record.awayTeam },
        home, away, calculateHistoricalLeagueAverages(prior),
      ));
    }
  });

  it("same-timestamp results cannot affect one another or their own predictions", () => {
    const original = runBacktest(mockPlayedMatches);
    const changed = runBacktest(mockPlayedMatches.map((match, index) => index === 24 ? { ...match, homeGoals: 0, awayGoals: 7 } : match));
    const timestamp = mockPlayedMatches[24].kickoffAt;
    const before = original.predictions.filter((record) => record.kickoffAt === timestamp);
    const after = changed.predictions.filter((record) => record.kickoffAt === timestamp);
    expect(before).toHaveLength(6);
    expect(after.map((record) => record.prediction)).toEqual(before.map((record) => record.prediction));
    expect(after.map((record) => record.trainingMatchCount)).toEqual([24, 24, 24, 24, 24, 24]);
    expect(after[0].actualOutcome).not.toBe(before[0].actualOutcome);
  });

  it("groups equivalent timestamp strings by their actual instant, including offsets", () => {
    const aliases = mockPlayedMatches.map((match, index) => index === 25 ? { ...match, kickoffAt: "2025-02-01T16:00:00+01:00" } : match);
    const original = runBacktest(aliases);
    const changed = runBacktest(aliases.map((match, index) => index === 25 ? { ...match, homeGoals: 8 } : match));
    expect(kickoffTimestamp(aliases[24].kickoffAt)).toBe(kickoffTimestamp(aliases[25].kickoffAt));
    expect(changed.predictions.slice(0, 6).map((record) => record.prediction)).toEqual(original.predictions.slice(0, 6).map((record) => record.prediction));
    expect(original.predictions.slice(0, 6).every((record) => record.trainingMatchCount === 24)).toBe(true);
  });

  it("changing a future result leaves every earlier prediction record unchanged", () => {
    const future = mockPlayedMatches[42];
    const original = runBacktest(mockPlayedMatches);
    const changed = runBacktest(mockPlayedMatches.map((match) => match.id === future.id ? { ...match, homeGoals: 7, awayGoals: 0 } : match));
    expect(changed.predictions.filter((record) => kickoffTimestamp(record.kickoffAt) < kickoffTimestamp(future.kickoffAt)))
      .toEqual(original.predictions.filter((record) => kickoffTimestamp(record.kickoffAt) < kickoffTimestamp(future.kickoffAt)));
  });

  it("changing genuinely earlier historical information can change a later prediction", () => {
    const original = runBacktest(mockPlayedMatches);
    const changed = runBacktest(mockPlayedMatches.map((match, index) => index === 0 ? { ...match, homeGoals: 6 } : match));
    expect(changed.predictions[0].prediction.homeProbability).not.toBe(original.predictions[0].prediction.homeProbability);
  });

  it("produces identical results regardless of input ordering, including within kickoff batches", () => {
    expect(runBacktest([...mockPlayedMatches].reverse())).toEqual(runBacktest(mockPlayedMatches));
  });

  it("does not mutate input arrays, records, or configuration", () => {
    const input = Object.freeze(mockPlayedMatches.map((match) => Object.freeze({ ...match })));
    const config = Object.freeze({ minimumVenueMatches: 2 });
    runBacktest(input, config);
    expect(input).toEqual(mockPlayedMatches);
    expect(config).toEqual({ minimumVenueMatches: 2 });
  });

  it("honours configurable venue minimums and requires readiness for both teams", () => {
    expect(runBacktest(mockPlayedMatches, { minimumVenueMatches: 1 }).predictions).toHaveLength(36);
    expect(runBacktest(mockPlayedMatches, { minimumVenueMatches: 3 }).predictions).toHaveLength(12);
    const newTeam = { ...mockPlayedMatches[42], id: "new-team", kickoffAt: "2025-03-01T15:00:00Z", homeTeam: "New Team" };
    const result = runBacktest([...mockPlayedMatches, newTeam]);
    expect(result.skippedMatches.at(-1)?.id).toBe("new-team");
    expect(result.skippedMatches.at(-1)?.reason).toBe("INSUFFICIENT_HISTORY");

    // An existing profile with only one appearance per venue is still unready,
    // whether that team is the target fixture's home or away side.
    const partialHistory = [
      ...mockPlayedMatches,
      { ...mockPlayedMatches[0], id: "new-home", kickoffAt: "2025-03-01T15:00:00Z", homeTeam: "New Team" },
      { ...mockPlayedMatches[0], id: "new-away", kickoffAt: "2025-03-08T15:00:00Z", awayTeam: "New Team" },
    ];
    for (const side of ["homeTeam", "awayTeam"] as const) {
      const target = { ...mockPlayedMatches[0], id: "target", kickoffAt: "2025-03-15T15:00:00Z", [side]: "New Team" };
      const partial = runBacktest([...partialHistory, target]);
      expect(partial.skippedMatches.at(-1)?.id).toBe("target");
      expect(partial.predictions.some((record) => record.id === "target")).toBe(false);
    }
  });

  it("rejects duplicate IDs even across different timestamps", () => {
    expect(() => runBacktest([...mockPlayedMatches, { ...mockPlayedMatches[0], kickoffAt: "2025-03-01T15:00:00Z" }])).toThrow(/Duplicate played-match/);
  });

  it("rejects malformed timestamps, impossible dates, and missing timezones", () => {
    for (const kickoffAt of ["not-a-date", "2025-02-30T15:00:00Z", "2025-01-04T15:00:00", "2025-01-04T24:00:00Z"]) {
      expect(() => runBacktest([{ ...mockPlayedMatches[0], kickoffAt }])).toThrow(RangeError);
    }
  });

  it("rejects invalid scores even if their matches would be skipped during warm-up", () => {
    for (const field of ["homeGoals", "awayGoals"] as const) {
      for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => runBacktest([{ ...mockPlayedMatches[0], [field]: value }])).toThrow(RangeError);
      }
    }
  });

  it("rejects self-matches, blank identities, and invalid warm-up settings", () => {
    const first = mockPlayedMatches[0];
    expect(() => runBacktest([{ ...first, awayTeam: first.homeTeam }])).toThrow(RangeError);
    expect(() => runBacktest([{ ...first, id: " " }])).toThrow(RangeError);
    for (const minimumVenueMatches of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => runBacktest([], { minimumVenueMatches })).toThrow(RangeError);
    }
  });

  it("returns explicit unavailable metrics when there are no evaluated matches", () => {
    for (const result of [runBacktest([]), runBacktest(mockPlayedMatches, { minimumVenueMatches: 5 })]) {
      expect(result.predictions).toEqual([]);
      expect(result.summary.evaluatedMatches).toBe(0);
      expect(result.summary.meanBrierScore).toBeNull();
      expect(result.summary.uniformBenchmarkBrier).toBeNull();
      expect(result.summary.leagueBaseRateBrier).toBeNull();
      expect(result.summary.brierSkillVsLeagueBaseRate).toBeNull();
      expect(result.summary.brierSkillScore).toBeNull();
      expect(result.summary.topPickAccuracy).toBeNull();
      expect(result.summary.topPickCalibrationECE).toBeNull();
      expect(result.summary.topPickCorrectCount).toBe(0);
      expect(result.summary.calibrationBuckets.every((bucket) => bucket.count === 0 && bucket.meanConfidence === null && bucket.observedAccuracy === null)).toBe(true);
    }
  });
});
