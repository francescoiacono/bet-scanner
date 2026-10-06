import { calculateBrierScore } from "../backtest/metrics";
import type { ComparisonRecord } from "../model-comparison/types";
import { validatePriceDate } from "./data";
import { validateThreeWayProbabilities } from "./market";
import type { FrozenValuePrediction } from "./types";

/** Projection only. No model fitting/prediction function is imported or called. */
export function recordedValuePrediction(record: ComparisonRecord): FrozenValuePrediction {
  if (record.dixonColesPrediction.modelVersion !== "dixon-coles-v1" || record.dixonColesPrediction.fixtureId !== record.id) throw new RangeError("Invalid frozen Dixon–Coles record version/identity.");
  const { homeProbability, drawProbability, awayProbability } = record.dixonColesPrediction;
  const modelProbabilities = { homeProbability, drawProbability, awayProbability };
  validateThreeWayProbabilities(modelProbabilities); validatePriceDate(record.kickoffAt);
  if (calculateBrierScore(modelProbabilities, record.actualOutcome) !== record.dixonColesBrierScore) throw new Error("Frozen V0.6 Brier record is inconsistent; stop rather than change the model.");
  return { fixtureId: record.id, seasonId: record.seasonId, sourceDate: record.kickoffAt, homeTeam: record.homeTeam, awayTeam: record.awayTeam,
    modelVersion: "dixon-coles-v1", modelProbabilities, actualOutcome: record.actualOutcome, modelBrier: record.dixonColesBrierScore };
}
