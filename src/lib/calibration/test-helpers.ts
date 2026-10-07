import type { MatchOutcome } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";
import { DEVELOPMENT_SEASONS, OUTCOMES } from "./config";
import type { CalibrationExample, CalibrationRecord, MarketValidationRecord } from "./types";

export const probabilities = (home = 0.6, draw = 0.25, away = 0.15): OutcomeProbabilities => ({ homeProbability: home, drawProbability: draw, awayProbability: away });
/** Non-separable synthetic observations, enough varied features for six-parameter fitting. */
export function examples(): CalibrationExample[] {
  return [probabilities(0.75, 0.15, 0.1), probabilities(0.15, 0.65, 0.2), probabilities(0.2, 0.2, 0.6), probabilities(0.45, 0.35, 0.2)]
    .flatMap((p, i) => Array.from({ length: 12 }, (_, j) => ({ probabilities: { ...p }, actualOutcome: OUTCOMES[(j + i) % 3] })));
}
export function calibrationRecord(overrides: Partial<CalibrationRecord> = {}): CalibrationRecord {
  return { fixtureId: "synthetic-a", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", probabilities: probabilities(), actualOutcome: "HOME", ...overrides };
}
export function olderRecords(): CalibrationRecord[] {
  return DEVELOPMENT_SEASONS.flatMap((seasonId) => examples().map((e, i) => ({ ...e, fixtureId: `${seasonId}-synthetic-${i}`, seasonId, sourceDate: `${seasonId.slice(0, 4)}-10-01T12:00:00Z` })));
}
export function marketRecord(raw = probabilities(), calibrated = probabilities(0.5, 0.3, 0.2), market = probabilities(0.45, 0.3, 0.25), outcome: MatchOutcome = "HOME"): MarketValidationRecord {
  return { ...calibrationRecord({ probabilities: raw, actualOutcome: outcome }), calibrated, market };
}
