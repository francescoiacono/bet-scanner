import type { OutcomeProbabilities } from "../football/types";
import { FAMILIES } from "./config";
import type { Calibrator } from "./types";

export function probabilityVector(probabilities: OutcomeProbabilities): [number, number, number] {
  if (Object.keys(probabilities).some((key) => !["homeProbability", "drawProbability", "awayProbability"].includes(key))) throw new RangeError("Calibration probability inputs must exclude features, results and market information.");
  const values: [number, number, number] = [probabilities.homeProbability, probabilities.drawProbability, probabilities.awayProbability];
  if (values.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1) || Math.abs(values.reduce((s, p) => s + p, 0) - 1) > 1e-10) throw new RangeError("Calibration requires finite probabilities strictly inside (0,1) summing to one.");
  return values;
}
export function probabilitiesFromVector(values: readonly number[]): OutcomeProbabilities {
  if (values.length !== 3) throw new RangeError("Exactly three classes are required.");
  const probabilities = { homeProbability: values[0], drawProbability: values[1], awayProbability: values[2] };
  probabilityVector(probabilities); return probabilities;
}
/** Finite three-class stable softmax. Underflow to a boundary fails, never clips. */
export function stableSoftmax(logits: readonly number[]): OutcomeProbabilities {
  if (logits.length !== 3 || logits.some((z) => !Number.isFinite(z))) throw new RangeError("Softmax requires three finite logits.");
  const maximum = Math.max(...logits), weights = logits.map((z) => Math.exp(z - maximum)), total = weights.reduce((s, w) => s + w, 0);
  return probabilitiesFromVector(weights.map((w) => w / total));
}
export function calibrationLogits(probabilities: OutcomeProbabilities, calibrator: Calibrator): [number, number, number] {
  const log = probabilityVector(probabilities).map(Math.log), params = calibrator.parameters;
  const count = calibrator.family === "identity" ? 0 : calibrator.family === "temperature-v1" ? 1 : 6;
  if (!FAMILIES.includes(calibrator.family) || params.length !== count || params.some((p) => !Number.isFinite(p))) throw new RangeError("Invalid calibration family/parameters.");
  if (calibrator.family === "identity") return [log[0], log[1], log[2]];
  if (calibrator.family === "temperature-v1") {
    const temperature = Math.exp(params[0]);
    if (!Number.isFinite(temperature) || temperature <= 0) throw new RangeError("Temperature must be finite and positive.");
    return [log[0] / temperature, log[1] / temperature, log[2] / temperature];
  }
  // Log differences avoid overflow in pH/pA, while defining the same log ratios.
  const x1 = log[0] - log[2], x2 = log[1] - log[2];
  return [params[0] + params[1] * x1 + params[2] * x2, params[3] + params[4] * x1 + params[5] * x2, 0];
}
export function applyCalibrator(probabilities: OutcomeProbabilities, calibrator: Calibrator): OutcomeProbabilities {
  const logits = calibrationLogits(probabilities, calibrator);
  if (calibrator.family === "identity") return { ...probabilities };
  const result = stableSoftmax(logits);
  if (calibrator.family === "temperature-v1") {
    const p = probabilityVector(probabilities), q = probabilityVector(result);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (p[i] > p[j] && q[i] <= q[j]) throw new RangeError("Temperature output cannot represent the input class ordering.");
  }
  return result;
}
export function logSumExp(logits: readonly number[]): number {
  if (!logits.length || logits.some((z) => !Number.isFinite(z))) throw new RangeError("Log-sum-exp requires finite logits.");
  const maximum = Math.max(...logits), result = maximum + Math.log(logits.reduce((s, z) => s + Math.exp(z - maximum), 0));
  if (!Number.isFinite(result)) throw new RangeError("Non-finite log-sum-exp.");
  return result;
}
