import type { MatchOutcome } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";

export type CalibrationFamily = "identity" | "temperature-v1" | "multinomial-logit-v1";
/** The fitter receives ONLY these two fields. Identity/date metadata stays outside. */
export interface CalibrationExample {
  readonly probabilities: OutcomeProbabilities;
  readonly actualOutcome: MatchOutcome;
}
export interface CalibrationRecord extends CalibrationExample {
  readonly fixtureId: string;
  readonly seasonId: string;
  readonly sourceDate: string;
}
export interface Calibrator {
  readonly family: CalibrationFamily;
  readonly parameters: readonly number[];
}
export interface CalibrationFit extends Calibrator {
  readonly trainingRecords: number;
  readonly initialParameters: readonly number[];
  readonly iterations: number;
  readonly evaluations: number;
  readonly objective: number;
  readonly meanGradientNorm: number | null;
  readonly convergenceCriterion: "NO_FIT" | "GRADIENT_NORM" | "RELATIVE_OBJECTIVE" | "STEP_TOLERANCE";
  readonly termination: string;
}
export interface ScoredCalibrationRecord extends CalibrationRecord {
  readonly forecasts: Readonly<Record<CalibrationFamily, OutcomeProbabilities>>;
}
export interface ValidationRecord extends CalibrationRecord {
  readonly calibrated: OutcomeProbabilities;
}
/** Produced after calibration is frozen; never accepted by fitting/selection. */
export interface MarketValidationRecord extends ValidationRecord {
  readonly market: OutcomeProbabilities;
}
export type CalibrationStatus = "IDENTITY_RETAINED" | "CALIBRATION_IMPROVEMENT_SUPPORTED" | "CALIBRATION_HARM_SUPPORTED" | "INCONCLUSIVE";
