import { describe, expect, it } from "vitest";
import { calculateBrierScore, calculateCalibration, calibrationBucketIndex } from "../backtest/metrics";
import { buildDateClusters, resampleSeasonClusters } from "../diagnostics/bootstrap";
import { bootstrapCalibrationAdvantage } from "./bootstrap";
import { confidenceBucketIndex, disagreementBucketIndex, forecastSummary, marketGapClosure, multiclassLogLoss, validationSlices } from "./metrics";
import { summarizeHistoricalCalibration } from "./summary";
import { calibrationRecord, marketRecord, probabilities } from "./test-helpers";

describe("proper scores, sharpness and fixed calibration bins", () => {
  it("three-class Brier uses the sum", () => expect(calculateBrierScore(probabilities(0.5, 0.25, 0.25), "HOME")).toBe(0.375));
  it("natural-log loss has known values", () => { expect(multiclassLogLoss(probabilities(0.5, 0.25, 0.25), "HOME")).toBeCloseTo(Math.log(2)); expect(multiclassLogLoss(probabilities(), "DRAW")).toBeCloseTo(-Math.log(0.25)); });
  it("near-perfect forecast scores better than poor", () => { const good = probabilities(0.99, 0.005, 0.005), poor = probabilities(0.01, 0.495, 0.495); expect(calculateBrierScore(good, "HOME")).toBeLessThan(calculateBrierScore(poor, "HOME")); expect(multiclassLogLoss(good, "HOME")).toBeLessThan(multiclassLogLoss(poor, "HOME")); });
  it("empty aggregation returns null scores, ECE and sharpness", () => { const s = forecastSummary([]); expect(s.brier).toBeNull(); expect(s.logLoss).toBeNull(); expect(s.topConfidenceECE).toBeNull(); expect(s.meanEntropy).toBeNull(); });
  it.each([[0, 0], [0.1, 1], [0.9, 9], [1, 9]])("generic probability %s enters bin %s", (p, index) => expect(calibrationBucketIndex(p)).toBe(index));
  it("classwise ECE matches a known example", () => { const s = forecastSummary([{ probabilities: probabilities(0.5, 0.25, 0.25), actualOutcome: "HOME" }, { probabilities: probabilities(0.5, 0.25, 0.25), actualOutcome: "DRAW" }]); expect(s.outcomes[0].ece).toBe(0); expect(s.outcomes[1].ece).toBe(0.25); expect(s.outcomes[2].ece).toBe(0.25); });
  it("top-confidence ECE matches a known example", () => expect(calculateCalibration([{ topConfidence: 0.6, topSelectionCorrect: true }, { topConfidence: 0.6, topSelectionCorrect: false }]).expectedCalibrationError).toBeCloseTo(0.1));
  it("empty bins are unavailable and class/bin counts sum to N", () => { const s = forecastSummary([{ probabilities: probabilities(), actualOutcome: "HOME" }]); expect(s.topConfidenceBins[0].meanConfidence).toBeNull(); for (const outcome of s.outcomes) expect(outcome.bins.reduce((n, b) => n + b.count, 0)).toBe(1); expect(s.topConfidenceBins.reduce((n, b) => n + b.count, 0)).toBe(1); });
  it("entropy is conventional positive entropy", () => { const s = forecastSummary([{ probabilities: probabilities(1 / 3, 1 / 3, 1 / 3), actualOutcome: "HOME" }]); expect(s.meanEntropy).toBeCloseTo(Math.log(3)); expect(s.meanMaximumProbability).toBe(1 / 3); });
});
describe("predeclared confidence/disagreement slices", () => {
  it.each([[1 / 3, 0], [0.4, 1], [0.5, 2], [0.6, 3], [0.7, 4], [0.8, 5], [1, 5]])("raw confidence %s belongs to exactly bucket %s", (p, index) => expect(confidenceBucketIndex(p)).toBe(index));
  it.each([[0, 0], [0.049999, 0], [0.05, 1], [0.1, 2], [0.2, 3], [1, 3]])("disagreement %s enters bucket %s", (p, index) => expect(disagreementBucketIndex(p)).toBe(index));
  it("bucket counts cover each raw forecast exactly once", () => { const rows = [1 / 3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.99].map((p, i) => ({ ...marketRecord(probabilities(p, (1 - p) / 2, (1 - p) / 2)), fixtureId: `synthetic-${i}` })); const s = validationSlices(rows); expect(s.confidenceBuckets.reduce((n, b) => n + b.matches, 0)).toBe(rows.length); expect(s.disagreementBuckets.reduce((n, b) => n + b.matches, 0)).toBe(rows.length); });
  it("market changes can move diagnostic buckets but not calibrated probabilities", () => { const a = marketRecord(), b = { ...a, market: probabilities(0.59, 0.26, 0.15) }; expect(validationSlices([a]).disagreementBuckets).not.toEqual(validationSlices([b]).disagreementBuckets); expect(a.calibrated).toEqual(b.calibrated); });
  it("reports known signed and absolute outcome residuals", () => { const r = validationSlices([marketRecord()]).residuals; expect(r[0].rawMeanResidual).toBeCloseTo(0.15); expect(r[0].calibratedMeanResidual).toBeCloseTo(0.05); expect(r[2].rawMeanAbsoluteDifference).toBeCloseTo(0.1); });
});
describe("paired season/date-cluster Brier bootstrap", () => {
  const rows = () => [{ ...calibrationRecord(), candidate: probabilities(0.7, 0.2, 0.1), benchmark: probabilities(0.5, 0.3, 0.2) }];
  it("same fixed seed gives identical intervals", () => { const b = bootstrapCalibrationAdvantage(rows()); expect(b).toEqual(bootstrapCalibrationAdvantage(rows())); expect(b.seed).toBe(202609); expect(b.samples).toBe(5000); });
  it("paired advantage has benchmark-minus-candidate sign", () => { const r = rows()[0]; expect(bootstrapCalibrationAdvantage([r]).interval.observedMean).toBeCloseTo(calculateBrierScore(r.benchmark, r.actualOutcome) - calculateBrierScore(r.candidate, r.actualOutcome)); });
  it("source-date records remain clustered and seasons stratified", () => { const observations = [{ id: "a", seasonId: "2021-22", kickoffAt: "2021-10-01T12:00:00Z", brierScore: 0.2, leagueBaseRateBrierScore: 0.3, leaguePoissonBrierScore: 0.3 }, { id: "b", seasonId: "2021-22", kickoffAt: "2021-10-01T12:00:00Z", brierScore: 0.3, leagueBaseRateBrierScore: 0.4, leaguePoissonBrierScore: 0.4 }, { id: "c", seasonId: "2022-23", kickoffAt: "2022-10-01T12:00:00Z", brierScore: 0.1, leagueBaseRateBrierScore: 0.2, leaguePoissonBrierScore: 0.2 }]; const c = buildDateClusters(observations), sampled = resampleSeasonClusters([[c[0]], [c[1]]], () => 0); expect(sampled[0].observations).toHaveLength(2); expect(sampled.map((c) => c.seasonId)).toEqual(["2021-22", "2022-23"]); });
  it("positive improvement gives a positive interval", () => expect(bootstrapCalibrationAdvantage(rows()).interval.lowerBound).toBeGreaterThan(0));
  it("harm gives a negative interval", () => { const r = rows()[0]; expect(bootstrapCalibrationAdvantage([{ ...r, candidate: r.benchmark, benchmark: r.candidate }]).interval.upperBound).toBeLessThan(0); });
  it("identical predictions yield a zero interval", () => { const r = rows()[0], b = bootstrapCalibrationAdvantage([{ ...r, candidate: r.benchmark }]); expect(b.interval).toEqual({ observedMean: 0, lowerBound: 0, upperBound: 0 }); });
  it("does not mutate inputs", () => { const r = rows(), before = structuredClone(r); bootstrapCalibrationAdvantage(r); expect(r).toEqual(before); });
  it("market-minus-calibrated sign and naming are correct", () => { const s = summarizeHistoricalCalibration([marketRecord()], "temperature-v1"); expect(s.calibratedAdvantageVsMarket).toBeCloseTo(s.forecasts.market.brier! - s.forecasts.calibrated.brier!); expect(s.calibrationAdvantage).toBeCloseTo(s.forecasts.raw.brier! - s.forecasts.calibrated.brier!); expect(s.researchModelVersion).toBeNull(); });
  it("promotes the separate research label only for supported non-identity improvement", () => { const r = marketRecord(probabilities(0.4, 0.3, 0.3), probabilities(0.7, 0.2, 0.1)); expect(summarizeHistoricalCalibration([r], "temperature-v1").researchModelVersion).toBe("dixon-coles-calibrated-v1"); expect(summarizeHistoricalCalibration([r], "identity").researchModelVersion).toBeNull(); });
});
describe("market-gap closure", () => {
  it.each([[0.55, 0.5], [0.6, 0], [0.5, 1], [0.45, 1.5], [0.65, -0.5]])("calibrated Brier %s closes fraction %s", (c, fraction) => expect(marketGapClosure(0.6, c, 0.5)).toBeCloseTo(fraction));
  it("raw no worse than market makes closure unavailable", () => { expect(marketGapClosure(0.5, 0.45, 0.5)).toBeNull(); expect(marketGapClosure(0.4, 0.45, 0.5)).toBeNull(); expect(marketGapClosure(null, null, null)).toBeNull(); });
});
