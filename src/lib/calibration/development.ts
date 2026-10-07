import { bootstrapCalibrationAdvantage, selectCalibrationFamily } from "./bootstrap";
import { FAMILIES, ROLLING_FOLDS } from "./config";
import { fitCalibrator } from "./fit";
import { forecastSummary, mean } from "./metrics";
import { canonicalCalibrationRecords, trainingExamples } from "./records";
import { applyCalibrator } from "./transforms";
import type { Calibrator, CalibrationRecord, ScoredCalibrationRecord, ValidationRecord } from "./types";

/** Older records are the only argument. Fits never receive identity metadata. */
export function rollingOriginCalibration(older: readonly CalibrationRecord[]) {
  const ordered = canonicalCalibrationRecords(older, "DEVELOPMENT"), records: ScoredCalibrationRecord[] = [];
  const folds = ROLLING_FOLDS.map((fold) => {
    const train = ordered.filter((r) => (fold.trainingSeasons as readonly string[]).includes(r.seasonId)), validation = ordered.filter((r) => r.seasonId === fold.validationSeason);
    if (!train.length || !validation.length) throw new RangeError("Every declared calibration fold requires training and validation records.");
    const examples = trainingExamples(train), temperature = fitCalibrator(examples, "temperature-v1"), logistic = fitCalibrator(examples, "multinomial-logit-v1");
    const predictions = validation.map((r): ScoredCalibrationRecord => ({ ...r, forecasts: { identity: applyCalibrator(r.probabilities, { family: "identity", parameters: [] }),
      "temperature-v1": applyCalibrator(r.probabilities, temperature), "multinomial-logit-v1": applyCalibrator(r.probabilities, logistic) } }));
    records.push(...predictions);
    return { ...fold, trainingRecords: train.length, validationRecords: validation.length, temperature, logistic,
      scores: FAMILIES.map((family) => ({ family, brier: forecastSummary(predictions.map((r) => ({ probabilities: r.forecasts[family], actualOutcome: r.actualOutcome }))).brier })) };
  });
  const candidates = FAMILIES.map((family) => {
    const examples = records.map((r) => ({ probabilities: r.forecasts[family], actualOutcome: r.actualOutcome })), scores = forecastSummary(examples);
    const bootstrap = bootstrapCalibrationAdvantage(records.map((r) => ({ ...r, candidate: r.forecasts[family], benchmark: r.forecasts.identity })));
    return { family, matches: scores.matches, brier: scores.brier, logLoss: scores.logLoss, advantage: bootstrap.interval.observedMean, bootstrap,
      eligible: family !== "identity" && bootstrap.interval.lowerBound !== null && bootstrap.interval.lowerBound > 0 };
  });
  const selectedFamily = selectCalibrationFamily(candidates.filter((c) => c.family !== "identity").map((c) => ({ family: c.family as "temperature-v1" | "multinomial-logit-v1", interval: c.bootstrap.interval })));
  return { records, publicSummary: { trainingRecords: ordered.length, rollingValidationRecords: records.length, folds, candidates, selectedFamily,
    foldTemperatureRange: { minimum: Math.min(...folds.map((f) => Math.exp(f.temperature.parameters[0]))), maximum: Math.max(...folds.map((f) => Math.exp(f.temperature.parameters[0]))), mean: mean(folds.map((f) => Math.exp(f.temperature.parameters[0]))) } } };
}
/** Select older-only, then fit the selected family once on all older records. */
export function developCalibration(older: readonly CalibrationRecord[]) {
  const ordered = canonicalCalibrationRecords(older, "DEVELOPMENT"), rolling = rollingOriginCalibration(ordered);
  const fitted = fitCalibrator(trainingExamples(ordered), rolling.publicSummary.selectedFamily);
  const finalFit = Object.freeze({ ...fitted, parameters: Object.freeze([...fitted.parameters]), initialParameters: Object.freeze([...fitted.initialParameters]) });
  return { ...rolling, finalFit };
}
/** Apply one frozen older-trained map to every recent season, without refitting. */
export function applyHistoricalCalibration(recent: readonly CalibrationRecord[], frozen: Calibrator): ValidationRecord[] {
  return canonicalCalibrationRecords(recent, "VALIDATION").map((r) => ({ ...r, calibrated: applyCalibrator(r.probabilities, frozen) }));
}
