import { describe, expect, it } from "vitest";
import { buildDateClusters, resampleSeasonClusters } from "../diagnostics/bootstrap";
import { backtestCorners } from "./backtest";
import { CORNER_NB_VERSION, CORNER_POISSON_VERSION } from "./config";
import { CornerConvergenceError, fitCornerModel } from "./fit";
import { bootstrapCornerAdvantage, preferredCornerModel, summarizeCornerDepth, summarizeCornerLines, summarizeCornerRecords } from "./summary";
import { syntheticCornerHistory } from "./test-fixtures";
import type { CornerRecord } from "./types";

const matches = syntheticCornerHistory(4);
describe("causal paired corner walk-forward and diagnostics", () => {
  it("fits both families once per eligible date from ALL strictly earlier history, with paired IDs", () => {
    const calls: { model: string; ids: string[] }[] = [];
    const result = backtestCorners(matches, "synthetic", "DEVELOPMENT", (history, model) => {
      calls.push({ model, ids: history.map((m) => m.id) }); return fitCornerModel(history, model);
    });
    expect(result.skippedIds).toHaveLength(12); expect(result.records).toHaveLength(36); expect(result.fits).toHaveLength(3);
    result.fits.forEach((audit, i) => {
      const prior = matches.filter((m) => m.kickoffAt < audit.kickoffAt).sort((a, b) => a.kickoffAt < b.kickoffAt ? -1 : a.kickoffAt > b.kickoffAt ? 1 : a.id < b.id ? -1 : 1);
      expect(calls[2 * i]).toEqual({ model: CORNER_POISSON_VERSION, ids: prior.map((m) => m.id) });
      expect(calls[2 * i + 1]).toEqual({ model: CORNER_NB_VERSION, ids: prior.map((m) => m.id) });
      expect(audit.latestTrainingKickoffAt < audit.kickoffAt).toBe(true);
    });
    for (const row of result.records) {
      expect([row.poisson, row.negativeBinomial, row.leaguePoisson, row.empirical].every((p) => p.fixtureId === row.id)).toBe(true);
      const prior = matches.filter((m) => m.kickoffAt < row.kickoffAt);
      expect(row.trainingMatchCount).toBe(prior.length);
      expect(row.leaguePoisson.expectedTotalCorners).toBeCloseTo(prior.reduce((sum, m) => sum + m.homeCorners + m.awayCorners, 0) / prior.length, 13);
      expect(row.empirical.overProbabilities[2]).toBe(prior.filter((m) => m.homeCorners + m.awayCorners > 9.5).length / prior.length);
    }
  });
  it("keeps target/same-date/future counts out of earlier fits and predictions for both families and benchmarks", () => {
    const original = backtestCorners(matches, "synthetic", "DEVELOPMENT"), target = original.records[0];
    const changed = backtestCorners(matches.map((m) => m.id === target.id ? { ...m, homeCorners: m.homeCorners + 3 } : m), "synthetic", "DEVELOPMENT");
    const forecasts = (rows: readonly CornerRecord[], date: string) => rows.filter((r) => r.kickoffAt <= date).map((r) => ({ id: r.id, p: r.poisson, nb: r.negativeBinomial, lp: r.leaguePoisson, e: r.empirical }));
    expect(forecasts(changed.records, target.kickoffAt)).toEqual(forecasts(original.records, target.kickoffAt));
    expect(changed.fits.filter((f) => f.kickoffAt <= target.kickoffAt)).toEqual(original.fits.filter((f) => f.kickoffAt <= target.kickoffAt));
    const future = matches.at(-1)!;
    const later = backtestCorners(matches.map((m) => m.id === future.id ? { ...m, awayCorners: 20 } : m), "synthetic", "DEVELOPMENT");
    expect(later.fits).toEqual(original.fits);
    expect(forecasts(later.records, target.kickoffAt)).toEqual(forecasts(original.records, target.kickoffAt));
    const earlier = backtestCorners(matches.map((m, i) => i === 0 ? { ...m, homeCorners: m.homeCorners + 3 } : m), "synthetic", "DEVELOPMENT");
    expect(earlier.fits[0]).not.toEqual(original.fits[0]);
  });
  it("starts fresh each season and is invariant to reversed/frozen input", () => {
    const original = backtestCorners(matches, "synthetic", "DEVELOPMENT");
    const frozen = Object.freeze([...matches].reverse().map((m) => Object.freeze(m)));
    expect(backtestCorners(frozen, "synthetic", "DEVELOPMENT")).toEqual(original);
    const another = backtestCorners(matches.map((m) => ({ ...m, id: `next/${m.id}` })), "next", "DEVELOPMENT");
    expect(another.fits[0].poisson).toEqual(original.fits[0].poisson); expect(another.fits[0].negativeBinomial).toEqual(original.fits[0].negativeBinomial);
    const records = [...original.records].reverse();
    expect(summarizeCornerRecords(records, 48, 12)).toEqual(summarizeCornerRecords(original.records, 48, 12));
  });
  it("fails an eligible fit explicitly and leaves unavailable metrics null", () => {
    expect(() => backtestCorners(matches, "synthetic", "DEVELOPMENT", () => { throw new CornerConvergenceError("forced failure"); })).toThrow("forced failure");
    const empty = backtestCorners(matches.slice(0, 12), "synthetic", "DEVELOPMENT");
    expect(empty.records).toEqual([]); expect(empty.fits).toEqual([]);
    expect(summarizeCornerRecords([], 12, 12).poissonRPS).toBeNull();
    expect(summarizeCornerLines([]).every((line) => line.poissonBrier === null && line.poissonECE === null)).toBe(true);
  });
  it("preserves fixed line/depth cohorts and separates development from external records", () => {
    const result = backtestCorners(matches, "synthetic", "DEVELOPMENT");
    const depth = summarizeCornerDepth(result.records), lines = summarizeCornerLines(result.records);
    expect(depth.map((row) => row.label)).toEqual(["2–3", "4–6", "7–10", "11–15", "16+"]);
    expect(depth.reduce((sum, row) => sum + row.matches, 0)).toBe(result.records.length);
    expect(lines.map((row) => row.line)).toEqual([7.5, 8.5, 9.5, 10.5, 11.5, 12.5]);
    expect(lines.every((row) => row.evaluatedMatches === result.records.length)).toBe(true);
    const mixed = [...result.records, { ...result.records[0], id: "external", dataset: "EXTERNAL_VALIDATION" as const }];
    expect(() => summarizeCornerRecords(mixed, 48, 12)).toThrow(/mix/); expect(() => bootstrapCornerAdvantage(mixed)).toThrow(/mix/);
  });
  it("reuses deterministic paired clustered/stratified resampling and has the declared preference boundaries", () => {
    const rows = backtestCorners(matches, "synthetic", "DEVELOPMENT").records;
    const positive = Object.freeze(rows.map((r) => Object.freeze({ ...r, poissonRPS: 0.2, negativeBinomialRPS: 0.1 })));
    const first = bootstrapCornerAdvantage(positive);
    expect(bootstrapCornerAdvantage([...positive].reverse())).toEqual(first);
    expect(first.seed).toBe(202607); expect(first.samples).toBe(5000); expect(first.dateClusters).toBe(3);
    expect(first.interval.lowerBound).toBeCloseTo(0.1); expect(preferredCornerModel(first.interval)).toBe(CORNER_NB_VERSION);
    const identical = bootstrapCornerAdvantage(rows.map((r) => ({ ...r, poissonRPS: 0.2, negativeBinomialRPS: 0.2 })));
    expect(identical.interval).toEqual({ observedMean: 0, lowerBound: 0, upperBound: 0 });
    expect(preferredCornerModel(identical.interval)).toBe("NONE / INCONCLUSIVE");
    expect(preferredCornerModel({ observedMean: -0.1, lowerBound: -0.2, upperBound: -0.01 })).toBe(CORNER_POISSON_VERSION);
    expect(preferredCornerModel({ observedMean: 0.01, lowerBound: 0, upperBound: 0.2 })).toBe("NONE / INCONCLUSIVE");
    const observations = positive.map((r) => ({ id: r.id, seasonId: r.seasonId, kickoffAt: r.kickoffAt, brierScore: r.negativeBinomialRPS,
      leagueBaseRateBrierScore: r.poissonRPS, leaguePoissonBrierScore: r.poissonRPS }));
    const secondSeason = observations.map((r) => ({ ...r, id: `second/${r.id}`, seasonId: "second" }));
    const clusters = buildDateClusters([...observations, ...secondSeason]);
    const sample = resampleSeasonClusters([clusters.filter((c) => c.seasonId === "synthetic"), clusters.filter((c) => c.seasonId === "second")], () => 0);
    expect(sample.filter((c) => c.seasonId === "synthetic")).toHaveLength(3); expect(sample.filter((c) => c.seasonId === "second")).toHaveLength(3);
    expect(sample.every((c) => c.observations.length === 12 && c.observations.every((r) => r.kickoffAt.startsWith(c.sourceDate)))).toBe(true);
    expect(positive[0].poissonRPS).toBe(0.2);
  });
});
