import { bootstrapCalibrationAdvantage, calibrationValidationStatus } from "./bootstrap";
import { VALIDATION_SEASONS } from "./config";
import { forecastSummary, marketGapClosure, validationSlices } from "./metrics";
import { compareCalibrationRecords } from "./records";
import type { CalibrationFamily, CalibrationFit, MarketValidationRecord } from "./types";

export function finalParameterSummary(fit: CalibrationFit) {
  return { temperature: fit.family === "temperature-v1" ? Math.exp(fit.parameters[0]) : null,
    coefficients: fit.family === "multinomial-logit-v1" ? { bH0: fit.parameters[0], bH1: fit.parameters[1], bH2: fit.parameters[2], bD0: fit.parameters[3], bD1: fit.parameters[4], bD2: fit.parameters[5] } : null };
}
export function summarizeHistoricalCalibration(records: readonly MarketValidationRecord[], selectedFamily: CalibrationFamily) {
  const ordered = [...records].sort(compareCalibrationRecords);
  if (new Set(ordered.map((r) => r.fixtureId)).size !== ordered.length || ordered.some((r) => !(VALIDATION_SEASONS as readonly string[]).includes(r.seasonId))) throw new RangeError("Validation summary requires distinct recent fixtures.");
  const score = (rows: readonly MarketValidationRecord[]) => ({ raw: forecastSummary(rows.map((r) => ({ probabilities: r.probabilities, actualOutcome: r.actualOutcome }))),
    calibrated: forecastSummary(rows.map((r) => ({ probabilities: r.calibrated, actualOutcome: r.actualOutcome }))), market: forecastSummary(rows.map((r) => ({ probabilities: r.market, actualOutcome: r.actualOutcome }))) });
  const forecasts = score(ordered), calibrationBootstrap = bootstrapCalibrationAdvantage(ordered.map((r) => ({ ...r, benchmark: r.probabilities, candidate: r.calibrated }))),
    calibratedMarketBootstrap = bootstrapCalibrationAdvantage(ordered.map((r) => ({ ...r, benchmark: r.market, candidate: r.calibrated }))),
    rawMarketBootstrap = bootstrapCalibrationAdvantage(ordered.map((r) => ({ ...r, benchmark: r.market, candidate: r.probabilities })));
  const status = calibrationValidationStatus(selectedFamily, calibrationBootstrap.interval);
  return { matches: ordered.length, forecasts, calibrationAdvantage: calibrationBootstrap.interval.observedMean, calibrationBootstrap,
    rawAdvantageVsMarket: rawMarketBootstrap.interval.observedMean, rawMarketBootstrap, calibratedAdvantageVsMarket: calibratedMarketBootstrap.interval.observedMean, calibratedMarketBootstrap,
    gapClosedFraction: marketGapClosure(forecasts.raw.brier, forecasts.calibrated.brier, forecasts.market.brier), status,
    researchModelVersion: selectedFamily !== "identity" && status === "CALIBRATION_IMPROVEMENT_SUPPORTED" ? "dixon-coles-calibrated-v1" : null,
    seasons: VALIDATION_SEASONS.map((seasonId) => { const f = score(ordered.filter((r) => r.seasonId === seasonId)); return { seasonId, matches: f.raw.matches,
      rawBrier: f.raw.brier, calibratedBrier: f.calibrated.brier, calibrationAdvantage: f.raw.brier !== null && f.calibrated.brier !== null ? f.raw.brier - f.calibrated.brier : null, marketBrier: f.market.brier,
      rawLogLoss: f.raw.logLoss, calibratedLogLoss: f.calibrated.logLoss, marketLogLoss: f.market.logLoss }; }), ...validationSlices(ordered) };
}
export type HistoricalCalibrationSummary = ReturnType<typeof summarizeHistoricalCalibration>;
