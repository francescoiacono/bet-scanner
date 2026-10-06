import { describe, expect, it } from "vitest";
import { fitDixonColes, FitConvergenceError } from "../dixon-coles/fit";
import { syntheticHistory } from "../dixon-coles/test-fixtures";
import { runPairedBacktest } from "./run-paired-backtest";
import { bootstrapModelComparison, compareHistoryDepth, compareOutcomes, pairedModelAdvantage, summarizeModels } from "./summaries";
import type { ComparisonRecord } from "./types";

const matches = syntheticHistory(4);

describe("causal paired Dixon–Coles evaluation", () => {
  it("evaluates exactly the baseline IDs and fits once per eligible date using ALL strictly earlier matches", () => {
    const calls: readonly typeof matches[number][][] = [];
    const mutableCalls = calls as typeof matches[number][][];
    const result = runPairedBacktest(matches, (history) => { mutableCalls.push([...history]); return fitDixonColes(history); });
    expect(result.records.map((record) => record.id)).toEqual(result.baseline.predictions.map((record) => record.id));
    expect(result.fits).toHaveLength(new Set(result.records.map((record) => record.kickoffAt)).size);
    expect(result.fits).toHaveLength(3);
    expect(calls[0]).toHaveLength(12); // The entire first day consists of warm-up skips.
    result.fits.forEach((audit, index) => {
      expect(calls[index].every((match) => match.kickoffAt < audit.kickoffAt)).toBe(true);
      expect(calls[index].map((match) => match.id)).toEqual(matches.filter((match) => match.kickoffAt < audit.kickoffAt).map((match) => match.id));
      expect(audit.fit.trainingMatchCount).toBe(calls[index].length);
      expect(audit.latestTrainingKickoffAt < audit.kickoffAt).toBe(true);
    });
  });

  it("isolates the target's score, all same-date scores, and future results from fitted predictions", () => {
    const original = runPairedBacktest(matches);
    const target = original.records[0];
    const changed = runPairedBacktest(matches.map((match) => match.id === target.id ? { ...match, homeGoals: match.homeGoals + 2 } : match));
    const select = (result: typeof original) => result.records.filter((record) => record.kickoffAt <= target.kickoffAt)
      .map((record) => ({ id: record.id, poisson: record.prediction, dc: record.dixonColesPrediction }));
    expect(select(changed)).toEqual(select(original));
    expect(changed.fits.filter((audit) => audit.kickoffAt <= target.kickoffAt)).toEqual(original.fits.filter((audit) => audit.kickoffAt <= target.kickoffAt));
    const future = matches.at(-1)!;
    const later = runPairedBacktest(matches.map((match) => match.id === future.id ? { ...match, awayGoals: match.awayGoals + 2 } : match));
    expect(later.fits).toEqual(original.fits);
    expect(later.records.filter((record) => record.kickoffAt < future.kickoffAt)).toEqual(original.records.filter((record) => record.kickoffAt < future.kickoffAt));
  });

  it("responds to earlier scoring evidence while remaining invariant to reversed/frozen inputs", () => {
    const original = runPairedBacktest(matches);
    const earlier = runPairedBacktest(matches.map((match, index) => index === 0 ? { ...match, homeGoals: match.homeGoals + 2 } : match));
    expect(earlier.fits[0].fit).not.toEqual(original.fits[0].fit);
    const frozen = Object.freeze([...matches].reverse().map((match) => Object.freeze({ ...match })));
    expect(runPairedBacktest(frozen)).toEqual(original);
    expect(frozen[0].id).toBe(matches.at(-1)!.id);
    expect(summarizeModels(runPairedBacktest(frozen).records, matches.length, original.baseline.skippedMatches.length))
      .toEqual(summarizeModels(original.records, matches.length, original.baseline.skippedMatches.length));
  });

  it("aborts on a failed fit, does not skip eligible fixtures, and returns unavailable metrics for empty evaluation", () => {
    expect(() => runPairedBacktest(matches, () => { throw new FitConvergenceError("forced failure"); })).toThrow("forced failure");
    expect(() => runPairedBacktest(matches.map((match) => ({ ...match, kickoffAt: match.kickoffAt.replace("12:00", "15:00") })))).toThrow(/noon/);
    const empty = runPairedBacktest(matches.slice(0, 12));
    expect(empty.fits).toEqual([]); expect(empty.records).toEqual([]);
    expect(summarizeModels([], 12, 12).dixonColesBrier).toBeNull();
  });

  it("uses the correct advantage sign and reproduces scores from outcome components and fixed history buckets", () => {
    expect(pairedModelAdvantage(0.7, 0.6)).toBeCloseTo(0.1);
    expect(pairedModelAdvantage(0.6, 0.7)).toBeCloseTo(-0.1);
    expect(() => pairedModelAdvantage(NaN, 0.6)).toThrow(RangeError);
    const result = runPairedBacktest(matches), summary = summarizeModels(result.records, matches.length, result.baseline.skippedMatches.length);
    const outcomes = compareOutcomes(result.records), buckets = compareHistoryDepth(result.records);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.poissonV1Component!, 0)).toBeCloseTo(summary.poissonV1Brier!, 12);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.dixonColesComponent!, 0)).toBeCloseTo(summary.dixonColesBrier!, 12);
    expect(buckets.map((bucket) => bucket.label)).toEqual(["2–3", "4–6", "7–10", "11–15", "16+"]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.matches, 0)).toBe(result.records.length);
  });

  it("reuses deterministic paired date-cluster bootstrap and explicitly prevents dataset mixing", () => {
    const result = runPairedBacktest(matches);
    const records: ComparisonRecord[] = result.records.map((record) => ({ ...record, dataset: "DEVELOPMENT", seasonId: "synthetic" }));
    const first = bootstrapModelComparison(records);
    expect(bootstrapModelComparison([...records].reverse())).toEqual(first);
    expect(first.dateClusters).toBe(result.fits.length);
    expect(first.seed).toBe(202606); expect(first.samples).toBe(5000);
    expect(() => bootstrapModelComparison([...records, { ...records[0], id: "external", dataset: "EXTERNAL_VALIDATION" }])).toThrow(/never mix/);
    expect(bootstrapModelComparison([]).interval).toEqual({ observedMean: null, lowerBound: null, upperBound: null });
  });
});
