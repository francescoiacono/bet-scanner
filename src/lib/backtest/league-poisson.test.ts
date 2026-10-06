import { describe, expect, it } from "vitest";
import { mockPlayedMatches } from "../../data/mock-played-matches";
import { calculateMatchProbabilities } from "../football/poisson";
import { calculateHistoricalLeagueAverages } from "./history";
import { predictLeaguePoisson } from "./league-poisson";
import { runBacktest } from "./run-backtest";
import { calculateBrierScore } from "./metrics";

describe("causal league-average Poisson benchmark", () => {
  it("uses league means as expected goals, reuses the existing engine, normalizes, and is deterministic", () => {
    const averages = Object.freeze({ homeGoalsPerMatch: 1.8, awayGoalsPerMatch: 1.2 });
    const prediction = predictLeaguePoisson(averages);
    expect(prediction.expectedHomeGoals).toBe(1.8);
    expect(prediction.expectedAwayGoals).toBe(1.2);
    expect(prediction).toEqual({ expectedHomeGoals: 1.8, expectedAwayGoals: 1.2, ...calculateMatchProbabilities(1.8, 1.2) });
    expect(prediction.homeProbability + prediction.drawProbability + prediction.awayProbability).toBeCloseTo(1, 12);
    expect(predictLeaguePoisson(averages)).toEqual(prediction);
  });

  it("uses strictly prior league scoring data and scores exactly the eligible model sample", () => {
    const result = runBacktest(mockPlayedMatches);
    for (const record of result.predictions) {
      const prior = mockPlayedMatches.filter((match) => match.kickoffAt < record.kickoffAt);
      expect(record.leaguePoissonPrediction).toEqual(predictLeaguePoisson(calculateHistoricalLeagueAverages(prior)));
      expect(record.leaguePoissonBrierScore).toBeCloseTo(calculateBrierScore(record.leaguePoissonPrediction, record.actualOutcome), 12);
    }
    const mean = result.predictions.reduce((sum, record) => sum + record.leaguePoissonBrierScore, 0) / result.predictions.length;
    expect(result.summary.leaguePoissonBrier).toBeCloseTo(mean, 12);
    expect(result.summary.brierSkillVsLeaguePoisson).toBeCloseTo(1 - result.summary.meanBrierScore! / mean, 12);
  });

  it("does not use team identities or team-specific scoring profiles", () => {
    const original = runBacktest(mockPlayedMatches);
    const renamed = runBacktest(mockPlayedMatches.map((match) => ({ ...match, homeTeam: `renamed ${match.homeTeam}`, awayTeam: `renamed ${match.awayTeam}` })));
    expect(renamed.predictions.map((record) => record.leaguePoissonPrediction)).toEqual(original.predictions.map((record) => record.leaguePoissonPrediction));
    const first = original.predictions[0];
    const prior = mockPlayedMatches.filter((match) => match.kickoffAt < first.kickoffAt);
    // Transfer goals between earlier matches: league sums stay fixed but team profiles change.
    const changed = mockPlayedMatches.map((match) => match.id === prior[0].id
      ? { ...match, homeGoals: match.homeGoals + prior[1].homeGoals }
      : match.id === prior[1].id ? { ...match, homeGoals: 0 } : match);
    const next = runBacktest(changed).predictions[0];
    expect(next.prediction).not.toEqual(first.prediction);
    expect(next.leaguePoissonPrediction).toEqual(first.leaguePoissonPrediction);
  });

  it("responds to genuinely earlier league scoring changes", () => {
    const original = runBacktest(mockPlayedMatches);
    const earlier = mockPlayedMatches[0];
    const changed = runBacktest(mockPlayedMatches.map((match) => match.id === earlier.id ? { ...match, homeGoals: match.homeGoals + 5 } : match));
    expect(changed.predictions[0].leaguePoissonPrediction).not.toEqual(original.predictions[0].leaguePoissonPrediction);
  });

  it("isolates same-date forecasts and prevents future outcomes from affecting earlier probabilities", () => {
    const original = runBacktest(mockPlayedMatches);
    const target = original.predictions[0];
    const changed = runBacktest(mockPlayedMatches.map((match) => match.id === target.id ? { ...match, homeGoals: match.homeGoals + 5 } : match));
    const select = (records: typeof original.predictions) => records.filter((record) => record.kickoffAt <= target.kickoffAt)
      .map((record) => ({ id: record.id, benchmark: record.leaguePoissonPrediction }));
    expect(select(changed.predictions)).toEqual(select(original.predictions));
    const future = mockPlayedMatches.at(-1)!;
    const futureChanged = runBacktest(mockPlayedMatches.map((match) => match.id === future.id ? { ...match, awayGoals: match.awayGoals + 5 } : match));
    expect(futureChanged.predictions.filter((record) => record.kickoffAt < future.kickoffAt))
      .toEqual(original.predictions.filter((record) => record.kickoffAt < future.kickoffAt));
  });

  it("rejects invalid league means and returns null summary metrics without evaluations", () => {
    for (const value of [0, -1, NaN, Infinity]) expect(() => predictLeaguePoisson({ homeGoalsPerMatch: value, awayGoalsPerMatch: 1 })).toThrow(RangeError);
    const empty = runBacktest([]).summary;
    expect(empty.leaguePoissonBrier).toBeNull();
    expect(empty.brierSkillVsLeaguePoisson).toBeNull();
  });
});
