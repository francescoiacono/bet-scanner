import type { OutcomeProbabilities } from "../football/types";
import { validateGoals } from "./history";
import type { BacktestPrediction, BacktestSummary, MatchOutcome } from "./types";

export const UNIFORM_PROBABILITIES: OutcomeProbabilities = Object.freeze({
  homeProbability: 1 / 3, drawProbability: 1 / 3, awayProbability: 1 / 3,
});

const OUTCOMES = ["HOME", "DRAW", "AWAY"] as const;

function probabilityVector(prediction: OutcomeProbabilities): readonly number[] {
  const values = [prediction.homeProbability, prediction.drawProbability, prediction.awayProbability];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-10) {
    throw new RangeError("Metrics require finite outcome probabilities in [0, 1] summing to 1.");
  }
  return values;
}

export function actualOutcome(homeGoals: number, awayGoals: number): MatchOutcome {
  validateGoals(homeGoals);
  validateGoals(awayGoals);
  return homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW";
}

/** Three-class Brier: sum of squared errors, with no division by three (0–2). */
export function calculateBrierScore(prediction: OutcomeProbabilities, outcome: MatchOutcome): number {
  const probabilities = probabilityVector(prediction);
  if (!OUTCOMES.includes(outcome)) throw new RangeError("Actual outcome must be HOME, DRAW, or AWAY.");
  return probabilities.reduce((score, probability, i) => score + (probability - (OUTCOMES[i] === outcome ? 1 : 0)) ** 2, 0);
}

/** Exact ties use HOME, then DRAW, then AWAY; confidence is a model probability. */
export function topPick(prediction: OutcomeProbabilities): { selection: MatchOutcome; confidence: number } {
  const probabilities = probabilityVector(prediction);
  let best = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[best]) best = i;
  }
  return { selection: OUTCOMES[best], confidence: probabilities[best] };
}

export function calculateBrierSkill(modelMean: number, uniformMean: number): number {
  if (!Number.isFinite(modelMean) || modelMean < 0 || modelMean > 2 ||
    !Number.isFinite(uniformMean) || uniformMean <= 0 || uniformMean > 2) {
    throw new RangeError("Brier skill requires a valid model mean and a positive benchmark mean.");
  }
  return 1 - modelMean / uniformMean;
}

export interface CalibrationObservation {
  readonly topConfidence: number;
  readonly topSelectionCorrect: boolean;
}

/** Ten half-open 10-point bins; the final bin includes 1.0. */
export function calibrationBucketIndex(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError("Calibration confidence must be finite and in [0, 1].");
  }
  return Math.min(9, Math.floor(confidence * 10));
}

export function calculateCalibration(observations: readonly CalibrationObservation[]) {
  const totals = Array.from({ length: 10 }, () => ({ count: 0, confidence: 0, correct: 0 }));
  for (const observation of observations) {
    const bucket = totals[calibrationBucketIndex(observation.topConfidence)];
    if (typeof observation.topSelectionCorrect !== "boolean") {
      throw new RangeError("Calibration correctness must be boolean.");
    }
    bucket.count++;
    bucket.confidence += observation.topConfidence;
    bucket.correct += Number(observation.topSelectionCorrect);
  }
  const buckets = totals.map((bucket, i) => ({
    lowerBound: i / 10,
    upperBound: (i + 1) / 10,
    count: bucket.count,
    meanConfidence: bucket.count ? bucket.confidence / bucket.count : null,
    observedAccuracy: bucket.count ? bucket.correct / bucket.count : null,
  }));
  const expectedCalibrationError = observations.length === 0 ? null : buckets.reduce((error, bucket) => {
    if (bucket.meanConfidence === null || bucket.observedAccuracy === null) return error;
    return error + bucket.count / observations.length * Math.abs(bucket.meanConfidence - bucket.observedAccuracy);
  }, 0);
  return { buckets, expectedCalibrationError };
}

export function summarizeBacktest(
  records: readonly BacktestPrediction[],
  totalHistoricalMatches: number,
  skippedMatches: number,
): BacktestSummary {
  const count = records.length;
  const meanBrierScore = count ? records.reduce((sum, record) => sum + record.brierScore, 0) / count : null;
  const uniformBenchmarkBrier = count ? records.reduce((sum, record) => sum + record.uniformBrierScore, 0) / count : null;
  const topPickCorrectCount = records.filter((record) => record.topSelectionCorrect).length;
  const calibration = calculateCalibration(records);
  return {
    totalHistoricalMatches,
    evaluatedMatches: count,
    skippedMatches,
    meanBrierScore,
    uniformBenchmarkBrier,
    brierSkillScore: meanBrierScore === null || uniformBenchmarkBrier === null ? null : calculateBrierSkill(meanBrierScore, uniformBenchmarkBrier),
    topPickCorrectCount,
    topPickAccuracy: count ? topPickCorrectCount / count : null,
    topPickCalibrationECE: calibration.expectedCalibrationError,
    calibrationBuckets: calibration.buckets,
  };
}
