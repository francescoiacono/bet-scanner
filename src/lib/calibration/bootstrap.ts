import { calculateBrierScore } from "../backtest/metrics";
import { bootstrapPairedAdvantages } from "../diagnostics/bootstrap";
import type { AdvantageInterval } from "../diagnostics/types";
import type { OutcomeProbabilities } from "../football/types";
import { CALIBRATION_BOOTSTRAP } from "./config";
import type { CalibrationFamily, CalibrationRecord, CalibrationStatus } from "./types";

export interface PairedForecast extends CalibrationRecord {
  readonly candidate: OutcomeProbabilities;
  readonly benchmark: OutcomeProbabilities;
}
/** benchmark Brier − candidate Brier, with identical fixture/date/outcome pairing. */
export function bootstrapCalibrationAdvantage(records: readonly PairedForecast[]) {
  const { vsLeagueBaseRate, vsLeaguePoisson: unused, ...metadata } = bootstrapPairedAdvantages(records.map((r) => ({ id: r.fixtureId, seasonId: r.seasonId, kickoffAt: r.sourceDate,
    brierScore: calculateBrierScore(r.candidate, r.actualOutcome), leagueBaseRateBrierScore: calculateBrierScore(r.benchmark, r.actualOutcome), leaguePoissonBrierScore: calculateBrierScore(r.benchmark, r.actualOutcome) })), CALIBRATION_BOOTSTRAP);
  void unused; return { ...metadata, interval: vsLeagueBaseRate };
}
export interface CandidateEvidence {
  readonly family: "temperature-v1" | "multinomial-logit-v1";
  readonly interval: AdvantageInterval;
}
/** Only development Brier evidence is accepted. No recent or market metrics. */
export function selectCalibrationFamily(evidence: readonly CandidateEvidence[]): CalibrationFamily {
  if (evidence.length !== 2 || new Set(evidence.map((r) => r.family)).size !== 2) throw new RangeError("Exactly the two fixed non-identity candidates are required.");
  for (const row of evidence) {
    if (!["temperature-v1", "multinomial-logit-v1"].includes(row.family) || Object.keys(row).some((key) => key !== "family" && key !== "interval") || Object.keys(row.interval).some((key) => !["observedMean", "lowerBound", "upperBound"].includes(key))) throw new RangeError("Calibration selection accepts development Brier intervals only, no validation or market metrics.");
    if (Object.values(row.interval).some((value) => value !== null && !Number.isFinite(value))) throw new RangeError("Non-finite candidate evidence.");
    if (row.interval.lowerBound !== null && row.interval.upperBound !== null && row.interval.lowerBound > row.interval.upperBound) throw new RangeError("Invalid candidate interval.");
  }
  const eligible = evidence.filter((r) => r.interval.observedMean !== null && r.interval.lowerBound !== null && r.interval.upperBound !== null && r.interval.lowerBound > 0);
  if (!eligible.length) return "identity";
  if (eligible.length === 1) return eligible[0].family;
  const temperature = eligible.find((r) => r.family === "temperature-v1")!, logistic = eligible.find((r) => r.family === "multinomial-logit-v1")!;
  return Math.abs(temperature.interval.observedMean! - logistic.interval.observedMean!) <= 1e-12 || temperature.interval.observedMean! > logistic.interval.observedMean! ? "temperature-v1" : "multinomial-logit-v1";
}
export function calibrationValidationStatus(family: CalibrationFamily, interval: AdvantageInterval): CalibrationStatus {
  if (family === "identity") return "IDENTITY_RETAINED";
  if (interval.lowerBound === null || interval.upperBound === null || !Number.isFinite(interval.lowerBound) || !Number.isFinite(interval.upperBound) || interval.lowerBound > interval.upperBound) return "INCONCLUSIVE";
  if (interval.lowerBound > 0) return "CALIBRATION_IMPROVEMENT_SUPPORTED";
  if (interval.upperBound < 0) return "CALIBRATION_HARM_SUPPORTED";
  return "INCONCLUSIVE";
}
