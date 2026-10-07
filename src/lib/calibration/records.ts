import { kickoffTimestamp } from "../backtest/history";
import type { ComparisonRecord } from "../model-comparison/types";
import { DEVELOPMENT_SEASONS, lexical, OUTCOMES, VALIDATION_SEASONS } from "./config";
import { probabilityVector } from "./transforms";
import type { CalibrationExample, CalibrationRecord } from "./types";

export function recordedCalibrationPrediction(record: ComparisonRecord): CalibrationRecord {
  const p = record.dixonColesPrediction;
  if (p.modelVersion !== "dixon-coles-v1" || p.fixtureId !== record.id) throw new RangeError("Expected a frozen V0.6 Dixon–Coles prediction with matching identity.");
  const probabilities = { homeProbability: p.homeProbability, drawProbability: p.drawProbability, awayProbability: p.awayProbability };
  probabilityVector(probabilities);
  return { fixtureId: record.id, seasonId: record.seasonId, sourceDate: record.kickoffAt, probabilities, actualOutcome: record.actualOutcome };
}
export const compareCalibrationRecords = (a: CalibrationRecord, b: CalibrationRecord) => lexical(a.seasonId, b.seasonId) || lexical(a.sourceDate, b.sourceDate) || lexical(a.fixtureId, b.fixtureId);
export function canonicalCalibrationRecords(records: readonly CalibrationRecord[], role: "DEVELOPMENT" | "VALIDATION"): CalibrationRecord[] {
  const seasons: readonly string[] = role === "DEVELOPMENT" ? DEVELOPMENT_SEASONS : role === "VALIDATION" ? VALIDATION_SEASONS : [];
  if (!seasons.length) throw new RangeError("Unknown calibration cohort role.");
  const ids = new Set<string>();
  for (const r of records) {
    if (Object.keys(r).some((key) => !["fixtureId", "seasonId", "sourceDate", "probabilities", "actualOutcome"].includes(key))) throw new RangeError("Calibration records must exclude teams, scores, parameters and market information.");
    if (!r.fixtureId.trim() || ids.has(r.fixtureId) || !seasons.includes(r.seasonId) || !OUTCOMES.includes(r.actualOutcome)) throw new RangeError("Duplicate/invalid calibration record or wrong cohort.");
    ids.add(r.fixtureId); probabilityVector(r.probabilities);
    if (!/^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(r.sourceDate)) throw new RangeError("Calibration requires canonical noon-UTC source dates.");
    const timestamp = kickoffTimestamp(r.sourceDate), year = Number(r.seasonId.slice(0, 4));
    if (timestamp < Date.UTC(year, 6, 1) || timestamp >= Date.UTC(year + 1, 6, 1)) throw new RangeError("Calibration source date falls outside its season.");
  }
  return [...records].sort(compareCalibrationRecords);
}
export const trainingExamples = (records: readonly CalibrationRecord[]): CalibrationExample[] => records.map((r) => ({ probabilities: { ...r.probabilities }, actualOutcome: r.actualOutcome }));
