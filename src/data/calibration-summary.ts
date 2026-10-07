import artifact from "./generated/calibration-v09-summary.json";
import type { CALIBRATION_PROTOCOL } from "../lib/calibration/config";
import type { rollingOriginCalibration } from "../lib/calibration/development";
import type { finalParameterSummary, HistoricalCalibrationSummary } from "../lib/calibration/summary";
import type { CalibrationFit } from "../lib/calibration/types";

interface CalibrationSummary {
  readonly schemaVersion: number;
  readonly calibrationSpecificationSha256: string;
  readonly configuration: typeof CALIBRATION_PROTOCOL;
  readonly development: ReturnType<typeof rollingOriginCalibration>["publicSummary"];
  readonly finalFit: CalibrationFit;
  readonly finalParameters: ReturnType<typeof finalParameterSummary>;
  readonly validation: HistoricalCalibrationSummary;
}
/** Aggregate-only rendering boundary: no private audit, numerical fitting or source loading. */
export const calibrationSummary = artifact as unknown as CalibrationSummary;
/** Parameter presentation conversion stays outside React. No fit is performed. */
export const foldTemperatures = calibrationSummary.development.folds.map((fold) => Math.exp(fold.temperature.parameters[0]));
