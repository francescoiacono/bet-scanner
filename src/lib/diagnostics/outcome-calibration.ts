import { calculateBrierScore, calculateCalibration } from "../backtest/metrics";
import type { MatchOutcome } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";
import type { OutcomeDiagnostic, OutcomeObservation } from "./types";

const OUTCOMES = ["HOME", "DRAW", "AWAY"] as const;
const probability = (prediction: OutcomeProbabilities, outcome: MatchOutcome) => ({
  HOME: prediction.homeProbability, DRAW: prediction.drawProbability, AWAY: prediction.awayProbability,
})[outcome];

export function calculateBrierComponents(prediction: OutcomeProbabilities, actual: MatchOutcome): Readonly<Record<MatchOutcome, number>> {
  calculateBrierScore(prediction, actual); // Reuse the established probability/outcome validation.
  return {
    HOME: (prediction.homeProbability - Number(actual === "HOME")) ** 2,
    DRAW: (prediction.drawProbability - Number(actual === "DRAW")) ** 2,
    AWAY: (prediction.awayProbability - Number(actual === "AWAY")) ** 2,
  };
}

export function diagnoseOutcomes(records: readonly OutcomeObservation[]): readonly OutcomeDiagnostic[] {
  const components = records.map((record) => ({
    model: calculateBrierComponents(record.prediction, record.actualOutcome),
    base: calculateBrierComponents(record.leagueBaseRateProbabilities, record.actualOutcome),
    poisson: calculateBrierComponents(record.leaguePoissonPrediction, record.actualOutcome),
  }));
  return OUTCOMES.map((outcome) => {
    const observations = records.map((record) => ({
      topConfidence: probability(record.prediction, outcome),
      topSelectionCorrect: record.actualOutcome === outcome,
    }));
    // The existing 10-point binning/ECE machinery also applies to one-vs-rest outcomes.
    const calibration = calculateCalibration(observations);
    const meanPredictedProbability = records.length
      ? observations.reduce((sum, observation) => sum + observation.topConfidence, 0) / records.length : null;
    const observedFrequency = records.length
      ? observations.filter((observation) => observation.topSelectionCorrect).length / records.length : null;
    const meanComponent = (forecast: "model" | "base" | "poisson") => components.length
      ? components.reduce((sum, component) => sum + component[forecast][outcome], 0) / components.length : null;
    return {
      outcome,
      evaluatedMatches: records.length,
      meanPredictedProbability, observedFrequency,
      predictionGap: meanPredictedProbability === null || observedFrequency === null ? null : meanPredictedProbability - observedFrequency,
      calibrationECE: calibration.expectedCalibrationError,
      modelBrierComponent: meanComponent("model"),
      leagueBaseRateBrierComponent: meanComponent("base"),
      leaguePoissonBrierComponent: meanComponent("poisson"),
      calibrationBuckets: calibration.buckets.map((bucket) => ({
        lowerBound: bucket.lowerBound, upperBound: bucket.upperBound, count: bucket.count,
        meanPredictedProbability: bucket.meanConfidence, observedFrequency: bucket.observedAccuracy,
      })),
    };
  });
}
