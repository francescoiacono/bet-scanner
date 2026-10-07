import { calculateBrierScore, calculateCalibration, topPick } from "../backtest/metrics";
import type { MatchOutcome } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";
import { CONFIDENCE_BUCKETS, DISAGREEMENT_BUCKETS, OUTCOMES } from "./config";
import { probabilityVector } from "./transforms";
import type { CalibrationExample, MarketValidationRecord } from "./types";

export const mean = (values: readonly number[]) => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
export function multiclassLogLoss(probabilities: OutcomeProbabilities, actual: MatchOutcome): number {
  if (!OUTCOMES.includes(actual)) throw new RangeError("Unknown log-loss outcome.");
  return -Math.log(probabilityVector(probabilities)[OUTCOMES.indexOf(actual)]);
}
export function forecastSummary(examples: readonly CalibrationExample[]) {
  const picks = examples.map((r) => ({ ...topPick(r.probabilities), correct: topPick(r.probabilities).selection === r.actualOutcome }));
  const topCalibration = calculateCalibration(picks.map((p) => ({ topConfidence: p.confidence, topSelectionCorrect: p.correct })));
  return { matches: examples.length, brier: mean(examples.map((r) => calculateBrierScore(r.probabilities, r.actualOutcome))),
    logLoss: mean(examples.map((r) => multiclassLogLoss(r.probabilities, r.actualOutcome))), topPickAccuracy: mean(picks.map((p) => Number(p.correct))),
    topConfidenceECE: topCalibration.expectedCalibrationError, topConfidenceBins: topCalibration.buckets,
    meanMaximumProbability: mean(picks.map((p) => p.confidence)), meanEntropy: mean(examples.map((r) => -probabilityVector(r.probabilities).reduce((s, p) => s + p * Math.log(p), 0))),
    outcomes: OUTCOMES.map((outcome, i) => { const bins = calculateCalibration(examples.map((r) => ({ topConfidence: probabilityVector(r.probabilities)[i], topSelectionCorrect: r.actualOutcome === outcome })));
      return { outcome, ece: bins.expectedCalibrationError, bins: bins.buckets.map((b) => ({ lowerBound: b.lowerBound, upperBound: b.upperBound, count: b.count, meanPredictedProbability: b.meanConfidence, observedFrequency: b.observedAccuracy })) }; }) };
}
export function marketGapClosure(rawBrier: number | null, calibratedBrier: number | null, marketBrier: number | null): number | null {
  if ([rawBrier, calibratedBrier, marketBrier].some((v) => v === null)) return null;
  if ([rawBrier, calibratedBrier, marketBrier].some((v) => !Number.isFinite(v) || v! < 0 || v! > 2)) throw new RangeError("Gap closure requires valid Brier scores.");
  const gap = rawBrier! - marketBrier!;
  return gap > 0 ? (rawBrier! - calibratedBrier!) / gap : null;
}
function bucketIndex(value: number, buckets: readonly { minimum: number; maximum: number }[]): number {
  if (!Number.isFinite(value)) throw new RangeError("Diagnostic buckets require finite values.");
  const index = buckets.findIndex((b, i) => value >= b.minimum && (value < b.maximum || i === buckets.length - 1 && value <= b.maximum));
  if (index < 0) throw new RangeError("Diagnostic value outside fixed bucket support.");
  return index;
}
export const confidenceBucketIndex = (confidence: number) => bucketIndex(confidence, CONFIDENCE_BUCKETS);
export const disagreementBucketIndex = (difference: number) => bucketIndex(difference, DISAGREEMENT_BUCKETS);
export function maximumMarketDisagreement(probabilities: OutcomeProbabilities, market: OutcomeProbabilities): number {
  const p = probabilityVector(probabilities), m = probabilityVector(market);
  return Math.max(...p.map((v, i) => Math.abs(v - m[i])));
}
export function validationSlices(records: readonly MarketValidationRecord[]) {
  const scores = (rows: readonly MarketValidationRecord[]) => ({ matches: rows.length, rawBrier: mean(rows.map((r) => calculateBrierScore(r.probabilities, r.actualOutcome))),
    calibratedBrier: mean(rows.map((r) => calculateBrierScore(r.calibrated, r.actualOutcome))), marketBrier: mean(rows.map((r) => calculateBrierScore(r.market, r.actualOutcome))) });
  return { confidenceBuckets: CONFIDENCE_BUCKETS.map((bucket, index) => {
    const rows = records.filter((r) => confidenceBucketIndex(topPick(r.probabilities).confidence) === index);
    return { label: bucket.label, ...scores(rows), rawMeanTopConfidence: mean(rows.map((r) => topPick(r.probabilities).confidence)),
      rawTopPickAccuracy: mean(rows.map((r) => Number(topPick(r.probabilities).selection === r.actualOutcome))), calibratedMeanTopConfidence: mean(rows.map((r) => topPick(r.calibrated).confidence)) };
  }), disagreementBuckets: DISAGREEMENT_BUCKETS.map((bucket, index) => {
    const rows = records.filter((r) => disagreementBucketIndex(maximumMarketDisagreement(r.probabilities, r.market)) === index);
    return { label: bucket.label, ...scores(rows), rawMeanDisagreement: mean(rows.map((r) => maximumMarketDisagreement(r.probabilities, r.market))),
      calibratedMeanAbsoluteDisagreement: mean(rows.map((r) => maximumMarketDisagreement(r.calibrated, r.market))) };
  }), residuals: OUTCOMES.map((outcome, i) => {
    const raw = records.map((r) => probabilityVector(r.probabilities)[i] - probabilityVector(r.market)[i]), calibrated = records.map((r) => probabilityVector(r.calibrated)[i] - probabilityVector(r.market)[i]);
    return { outcome, rawMeanResidual: mean(raw), calibratedMeanResidual: mean(calibrated), rawMeanAbsoluteDifference: mean(raw.map(Math.abs)), calibratedMeanAbsoluteDifference: mean(calibrated.map(Math.abs)) };
  }) };
}
