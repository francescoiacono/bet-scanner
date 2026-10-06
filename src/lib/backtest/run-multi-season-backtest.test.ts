import { beforeAll, describe, expect, it } from "vitest";
import { eplSeasons } from "../../data/epl-seasons";
import { predictMatch } from "../football/predict-match";
import { calculateHistoricalLeagueAverages, deriveTeamProfiles, hasEnoughHistory } from "./history";
import { calculateLeagueBaseRate } from "./league-base-rate";
import { runMultiSeasonBacktest } from "./run-multi-season-backtest";
import type { HistoricalSeason, MultiSeasonBacktestResult, PlayedMatch, SeasonPrediction } from "./types";

function changedSeason(season: HistoricalSeason, id: string, patch: Partial<PlayedMatch>): HistoricalSeason {
  return { ...season, matches: season.matches.map((match) => match.id === id ? { ...match, ...patch } : match) };
}

describe("season-isolated real EPL evaluation", () => {
  let result: MultiSeasonBacktestResult;
  beforeAll(() => { result = runMultiSeasonBacktest(eplSeasons); });

  it("resets warm-up and uses only the current season's earlier dates for every model and benchmark record", () => {
    expect(result.summary.totalHistoricalMatches).toBe(1900);
    expect(result.summary.evaluatedMatches + result.summary.skippedMatches).toBe(1900);
    for (const season of eplSeasons) {
      const evaluated = result.predictions.filter((record) => record.seasonId === season.id);
      const skipped = result.skippedMatches.filter((record) => record.seasonId === season.id);
      expect(evaluated.length).toBeGreaterThan(0);
      expect(skipped.length).toBeGreaterThan(0);
      expect(skipped[0].trainingMatchCount).toBe(0);
      expect(skipped.every((record) => record.reason === "INSUFFICIENT_HISTORY")).toBe(true);
      // Reconstruct each expected prior-date snapshot once, independently of
      // the backtest. Every evaluated record is still checked against it.
      const snapshots = new Map<string, { prior: readonly PlayedMatch[]; benchmark: ReturnType<typeof calculateLeagueBaseRate> }>();
      for (const record of evaluated) {
        let snapshot = snapshots.get(record.kickoffAt);
        if (!snapshot) {
          const prior = season.matches.filter((match) => match.kickoffAt < record.kickoffAt);
          snapshot = { prior, benchmark: calculateLeagueBaseRate(prior) };
          snapshots.set(record.kickoffAt, snapshot);
        }
        const { prior, benchmark } = snapshot;
        expect(record.trainingMatchCount).toBe(prior.length);
        expect(Date.parse(record.latestTrainingKickoffAt)).toBeLessThan(Date.parse(record.kickoffAt));
        expect(record.leagueBaseRateProbabilities).toEqual(benchmark);
      }
      const first = evaluated[0];
      const prior = season.matches.filter((match) => match.kickoffAt < first.kickoffAt);
      const teams = new Map(deriveTeamProfiles(prior).map((profile) => [profile.team, profile]));
      expect(hasEnoughHistory(teams.get(first.homeTeam))).toBe(true);
      expect(hasEnoughHistory(teams.get(first.awayTeam))).toBe(true);
      expect(first.leagueAverages).toEqual(calculateHistoricalLeagueAverages(prior));
      expect(first.prediction).toEqual(predictMatch(first, teams.get(first.homeTeam)!, teams.get(first.awayTeam)!, calculateHistoricalLeagueAverages(prior)));
    }
  });

  it("a previous season's result cannot change any later season's prediction or base-rate frequencies", () => {
    const first = eplSeasons[0];
    const changed = changedSeason(first, first.matches[0].id, { homeGoals: 7, awayGoals: 0 });
    const next = runMultiSeasonBacktest([changed, eplSeasons[1]]);
    expect(next.predictions.filter((record) => record.seasonId === eplSeasons[1].id))
      .toEqual(result.predictions.filter((record) => record.seasonId === eplSeasons[1].id));
  });

  it("earlier results within a season can change later model probabilities", () => {
    const season = eplSeasons[0];
    const first = result.predictions.find((record) => record.seasonId === season.id)!;
    const priorHome = season.matches.find((match) => match.kickoffAt < first.kickoffAt && match.homeTeam === first.homeTeam)!;
    const changed = runMultiSeasonBacktest([changedSeason(season, priorHome.id, { homeGoals: priorHome.homeGoals + 5 })]);
    expect(changed.predictions[0].prediction.homeProbability).not.toBe(first.prediction.homeProbability);
  });

  it("future result changes preserve every earlier evaluated record", () => {
    const season = eplSeasons[0];
    const future = season.matches.at(-1)!;
    const changed = runMultiSeasonBacktest([changedSeason(season, future.id, { homeGoals: 7, awayGoals: 0 })]);
    expect(changed.predictions.filter((record) => record.kickoffAt < future.kickoffAt))
      .toEqual(result.predictions.filter((record) => record.seasonId === season.id && record.kickoffAt < future.kickoffAt));
  });

  it("isolates all matches on a date, regardless of their original kickoff times", () => {
    const season = eplSeasons[0];
    const evaluated = result.predictions.filter((record) => record.seasonId === season.id);
    const target = evaluated.find((record) => evaluated.filter((other) => other.kickoffAt === record.kickoffAt).length >= 2)!;
    const changed = runMultiSeasonBacktest([changedSeason(season, target.id, { homeGoals: 7, awayGoals: 0 })]);
    const select = (records: readonly SeasonPrediction[]) => records.filter((record) => record.kickoffAt === target.kickoffAt).map((record) => ({
      id: record.id, prediction: record.prediction, benchmark: record.leagueBaseRateProbabilities, trainingMatchCount: record.trainingMatchCount,
    }));
    expect(select(changed.predictions)).toEqual(select(evaluated));
  });

  it("is independent of season/match input ordering and leaves frozen arrays and records intact", () => {
    const input = Object.freeze([...eplSeasons].reverse().map((season) => Object.freeze({
      ...season, matches: Object.freeze([...season.matches].reverse().map((match) => Object.freeze({ ...match }))),
    })));
    const config = Object.freeze({ minimumVenueMatches: 2 });
    expect(runMultiSeasonBacktest(input, config)).toEqual(result);
    expect(input.map((season) => season.id)).toEqual([...eplSeasons].reverse().map((season) => season.id));
  });

  it("computes overall metrics directly from matches rather than unweighted season means", () => {
    const summaries = result.seasonSummaries.map((season) => season.summary);
    expect(new Set(summaries.map((summary) => summary.evaluatedMatches)).size).toBeGreaterThan(1);
    const total = result.predictions.length;
    for (const field of ["meanBrierScore", "leagueBaseRateBrier", "uniformBenchmarkBrier", "topPickAccuracy"] as const) {
      const weighted = summaries.reduce((sum, summary) => sum + summary[field]! * summary.evaluatedMatches, 0) / total;
      expect(result.summary[field]).toBeCloseTo(weighted, 12);
    }
    const naive = summaries.reduce((sum, summary) => sum + summary.meanBrierScore!, 0) / summaries.length;
    expect(Math.abs(result.summary.meanBrierScore! - naive)).toBeGreaterThan(1e-8);
    expect(result.summary.brierSkillVsLeagueBaseRate).toBeCloseTo(1 - result.summary.meanBrierScore! / result.summary.leagueBaseRateBrier!, 12);
    const bins = result.summary.calibrationBuckets;
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(total);
    const ece = bins.reduce((sum, bin) => sum + (bin.count ? bin.count / total * Math.abs(bin.meanConfidence! - bin.observedAccuracy!) : 0), 0);
    expect(result.summary.topPickCalibrationECE).toBeCloseTo(ece, 12);
  });

  it("rejects partial or duplicate seasons and returns unavailable metrics when every match warms up", () => {
    expect(() => runMultiSeasonBacktest([{ ...eplSeasons[0], matches: eplSeasons[0].matches.slice(1) }])).toThrow(/380/);
    expect(() => runMultiSeasonBacktest([eplSeasons[0], eplSeasons[0]])).toThrow(/Duplicate historical season/);
    const empty = runMultiSeasonBacktest([eplSeasons[0]], { minimumVenueMatches: 20 });
    expect(empty.summary.evaluatedMatches).toBe(0);
    expect(empty.summary.skippedMatches).toBe(380);
    expect(empty.summary.meanBrierScore).toBeNull();
    expect(empty.summary.leagueBaseRateBrier).toBeNull();
    expect(empty.summary.brierSkillVsLeagueBaseRate).toBeNull();
    expect(empty.summary.topPickCalibrationECE).toBeNull();
    expect(runMultiSeasonBacktest([]).summary.uniformBenchmarkBrier).toBeNull();
  });
});
