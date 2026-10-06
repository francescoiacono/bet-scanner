import { beforeAll, describe, expect, it } from "vitest";
import { eplSeasons } from "../../data/epl-seasons";
import { summarizeBacktest } from "../backtest/metrics";
import { runMultiSeasonBacktest } from "../backtest/run-multi-season-backtest";
import type { MultiSeasonBacktestResult } from "../backtest/types";
import { calculateHistoryDepth, historyDepthBucketIndex, summarizeHistoryDepth } from "./history-depth";
import { diagnoseOutcomes } from "./outcome-calibration";
import { diagnoseWeakestSeason, leaveOneSeasonOut } from "./robustness";

describe("fixed history slices and pooled season robustness", () => {
  let result: MultiSeasonBacktestResult;
  beforeAll(() => { result = runMultiSeasonBacktest(eplSeasons); });

  it("uses the minimum of all four venue counts and rejects invalid counts/depths", () => {
    expect(calculateHistoryDepth({ homeTeamHomeMatches: 8, homeTeamAwayMatches: 4, awayTeamHomeMatches: 6, awayTeamAwayMatches: 5 })).toBe(4);
    expect(() => calculateHistoryDepth({ homeTeamHomeMatches: -1, homeTeamAwayMatches: 4, awayTeamHomeMatches: 6, awayTeamAwayMatches: 5 })).toThrow(RangeError);
    for (const depth of [1, -1, 2.5, NaN]) expect(() => historyDepthBucketIndex(depth)).toThrow(RangeError);
  });

  it("assigns every exact predefined bucket boundary", () => {
    for (const [depth, bucket] of [[2, 0], [3, 0], [4, 1], [6, 1], [7, 2], [10, 2], [11, 3], [15, 3], [16, 4], [100, 4]]) {
      expect(historyDepthBucketIndex(depth)).toBe(bucket);
    }
  });

  it("partitions all eligible real predictions exactly once, retains causal counts, and reproduces pooled scores", () => {
    const buckets = summarizeHistoryDepth(result.predictions);
    expect(buckets.map((bucket) => bucket.label)).toEqual(["2–3", "4–6", "7–10", "11–15", "16+"]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.evaluatedMatches, 0)).toBe(result.summary.evaluatedMatches);
    for (const record of result.predictions) {
      expect(record.historyDepth).toBe(calculateHistoryDepth(record.venueHistory));
      expect(record.historyDepth).toBeGreaterThanOrEqual(2);
      const season = eplSeasons.find((season) => season.id === record.seasonId)!;
      const prior = season.matches.filter((match) => match.kickoffAt < record.kickoffAt);
      expect(record.venueHistory).toEqual({
        homeTeamHomeMatches: prior.filter((match) => match.homeTeam === record.homeTeam).length,
        homeTeamAwayMatches: prior.filter((match) => match.awayTeam === record.homeTeam).length,
        awayTeamHomeMatches: prior.filter((match) => match.homeTeam === record.awayTeam).length,
        awayTeamAwayMatches: prior.filter((match) => match.awayTeam === record.awayTeam).length,
      });
      expect(historyDepthBucketIndex(record.historyDepth)).toBeGreaterThanOrEqual(0);
    }
    expect(buckets.reduce((sum, bucket) => sum + bucket.modelBrier! * bucket.evaluatedMatches, 0) / result.predictions.length)
      .toBeCloseTo(result.summary.meanBrierScore!, 12);
    expect(summarizeHistoryDepth([]).every((bucket) => bucket.evaluatedMatches === 0 && bucket.modelBrier === null)).toBe(true);
    expect(() => summarizeHistoryDepth([{ ...result.predictions[0], historyDepth: 999 }])).toThrow(RangeError);
  });

  it("produces five exclusions and recomputes metrics directly from exactly the remaining individual records", () => {
    const rows = leaveOneSeasonOut(result);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.includedSeasons).not.toContain(row.excludedSeason);
      expect(row.includedSeasons).toHaveLength(4);
      const remaining = result.predictions.filter((record) => record.seasonId !== row.excludedSeason);
      expect(row.summary.evaluatedMatches).toBe(remaining.length);
      expect(row.summary.totalHistoricalMatches).toBe(1520);
      expect(row.summary).toEqual(summarizeBacktest(remaining, 1520,
        result.skippedMatches.filter((record) => record.seasonId !== row.excludedSeason).length));
      const mean = remaining.reduce((sum, record) => sum + record.brierScore, 0) / remaining.length;
      expect(row.summary.meanBrierScore).toBeCloseTo(mean, 12);
    }
  });

  it("is deterministic under reversed/frozen inputs and selects the weakest season dynamically", () => {
    const reordered = Object.freeze({ ...result,
      predictions: Object.freeze([...result.predictions].reverse().map((record) => Object.freeze({ ...record }))),
      seasonSummaries: Object.freeze([...result.seasonSummaries].reverse()),
    });
    expect(leaveOneSeasonOut(reordered)).toEqual(leaveOneSeasonOut(result));
    expect(diagnoseWeakestSeason(reordered)).toEqual(diagnoseWeakestSeason(result));
    const weakest = diagnoseWeakestSeason(result)!;
    expect(weakest.seasonId).toBe("2025-26");
    // Change evaluated scores only: selection follows the metric, not a hardcoded season.
    const changed = { ...result, predictions: result.predictions.map((record) => record.seasonId === "2021-22"
      ? { ...record, brierScore: 2 } : record) };
    expect(diagnoseWeakestSeason(changed)!.seasonId).toBe("2021-22");
    const tied = { ...result, predictions: result.predictions.map((record) => ({ ...record, brierScore: record.leagueBaseRateBrierScore })) };
    expect(diagnoseWeakestSeason(tied)!.seasonId).toBe("2021-22");
    expect(diagnoseWeakestSeason({ ...result, predictions: [] })).toBeNull();
  });

  it("preserves V0.4 pooled metrics and decomposes each forecast's actual Brier score", () => {
    expect(result.summary.evaluatedMatches).toBe(1688);
    expect(result.summary.meanBrierScore).toBe(0.634404090022038);
    expect(result.summary.leagueBaseRateBrier).toBe(0.6495926545501354);
    expect(result.summary.topPickCalibrationECE).toBe(0.10136333169978744);
    const outcomes = diagnoseOutcomes(result.predictions);
    for (const [field, mean] of [
      ["modelBrierComponent", result.summary.meanBrierScore],
      ["leagueBaseRateBrierComponent", result.summary.leagueBaseRateBrier],
      ["leaguePoissonBrierComponent", result.summary.leaguePoissonBrier],
    ] as const) expect(outcomes.reduce((sum, row) => sum + row[field]!, 0)).toBeCloseTo(mean!, 12);
  });
});
