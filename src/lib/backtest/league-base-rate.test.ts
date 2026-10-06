import { describe, expect, it } from "vitest";
import { mockPlayedMatches } from "../../data/mock-played-matches";
import { calculateLeagueBaseRate } from "./league-base-rate";
import { calculateBrierScore, calculateBrierSkill } from "./metrics";
import { runBacktest } from "./run-backtest";

describe("causal league-base-rate benchmark", () => {
  it("uses unsmoothed HOME/DRAW/AWAY frequencies that sum to one", () => {
    const history = [
      { ...mockPlayedMatches[0], id: "h1", homeGoals: 2, awayGoals: 0 },
      { ...mockPlayedMatches[0], id: "h2", homeGoals: 1, awayGoals: 0 },
      { ...mockPlayedMatches[0], id: "d", homeGoals: 0, awayGoals: 0 },
      { ...mockPlayedMatches[0], id: "a", homeGoals: 0, awayGoals: 1 },
    ];
    const probabilities = calculateLeagueBaseRate(history);
    expect(probabilities).toEqual({ homeProbability: 0.5, drawProbability: 0.25, awayProbability: 0.25 });
    expect(Object.values(probabilities).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(calculateLeagueBaseRate(history.slice(0, 2)).drawProbability).toBe(0);
    expect(() => calculateLeagueBaseRate([])).toThrow(/prior completed/);
  });

  it("scores a known base-rate Brier example and skill with the existing convention", () => {
    const benchmark = { homeProbability: 0.5, drawProbability: 0.25, awayProbability: 0.25 };
    expect(calculateBrierScore(benchmark, "HOME")).toBeCloseTo(0.375, 12);
    expect(calculateBrierSkill(0.3, 0.375)).toBeCloseTo(0.2, 12);
  });

  it("keeps benchmark records and summary comparisons on exactly the model's evaluated matches", () => {
    const result = runBacktest(mockPlayedMatches);
    const mean = result.predictions.reduce((sum, record) => sum + record.leagueBaseRateBrierScore, 0) / result.predictions.length;
    expect(result.summary.leagueBaseRateBrier).toBeCloseTo(mean, 12);
    expect(result.summary.brierSkillVsLeagueBaseRate).toBeCloseTo(1 - result.summary.meanBrierScore! / mean, 12);
    for (const record of result.predictions) {
      expect(record.leagueBaseRateBrierScore).toBeCloseTo(calculateBrierScore(record.leagueBaseRateProbabilities, record.actualOutcome), 12);
    }
    const perfectBenchmark = runBacktest(mockPlayedMatches.map((match) => ({ ...match, homeGoals: 2, awayGoals: 1 })));
    expect(perfectBenchmark.summary.leagueBaseRateBrier).toBe(0);
    expect(perfectBenchmark.summary.brierSkillVsLeagueBaseRate).toBeNull();
  });
});
