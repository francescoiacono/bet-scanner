import numeric from "numeric";
import { FIT_CONFIGURATION, INITIAL_PARAMETERS, OUTCOMES } from "./config";
import { prepareCalibrationObjective, validateExample } from "./objective";
import { applyCalibrator, probabilityVector } from "./transforms";
import type { CalibrationExample, CalibrationFamily, CalibrationFit } from "./types";

export class CalibrationConvergenceError extends Error {
  constructor(message: string) { super(message); this.name = "CalibrationConvergenceError"; }
}
export function fitCalibrator(examples: readonly CalibrationExample[], family: CalibrationFamily, options: { maximumIterations?: number } = {}): CalibrationFit {
  if (!examples.length) throw new RangeError("Calibration fit requires training records.");
  const maximumIterations = options.maximumIterations ?? FIT_CONFIGURATION.maximumIterations;
  if (!Number.isSafeInteger(maximumIterations) || maximumIterations < 1) throw new RangeError("Maximum iterations must be a positive safe integer.");
  examples.forEach(validateExample);
  if (family === "identity") {
    const losses = examples.map((r) => -Math.log(probabilityVector(r.probabilities)[OUTCOMES.indexOf(r.actualOutcome)])).sort((a, b) => a - b);
    return { family, parameters: [], initialParameters: [], trainingRecords: examples.length, iterations: 0, evaluations: 0,
      objective: losses.reduce((s, v) => s + v, 0) / losses.length, meanGradientNorm: null, convergenceCriterion: "NO_FIT", termination: "Identity has no fitted parameters." };
  }
  const objective = prepareCalibrationObjective(examples, family), initial = [...INITIAL_PARAMETERS[family]];
  let evaluations = 0, cachedPoint: number[] = [], cached: ReturnType<typeof objective.evaluate> | undefined;
  const evaluate = (point: number[]) => {
    if (cached && point.length === cachedPoint.length && point.every((v, i) => v === cachedPoint[i])) return cached;
    const result = objective.evaluate(point); evaluations++; cachedPoint = [...point]; cached = result; return result;
  };
  let lastValue: number | undefined, stable = 0, converged = false;
  let criterion: CalibrationFit["convergenceCriterion"] = "GRADIENT_NORM";
  const result = numeric.uncmin((point) => evaluate(point).value, initial, FIT_CONFIGURATION.stepTolerance, (point) => [...evaluate(point).gradient], maximumIterations,
    (_iteration, _point, value, gradient) => {
      const change = lastValue === undefined ? Infinity : Math.abs(lastValue - value) / Math.max(1, Math.abs(lastValue));
      stable = change <= FIT_CONFIGURATION.relativeObjectiveTolerance ? stable + 1 : 0; lastValue = value;
      converged = Math.hypot(...gradient) <= FIT_CONFIGURATION.gradientTolerance || stable >= FIT_CONFIGURATION.stableIterations;
      if (converged) criterion = Math.hypot(...gradient) <= FIT_CONFIGURATION.gradientTolerance ? "GRADIENT_NORM" : "RELATIVE_OBJECTIVE";
      return converged;
    });
  const final = evaluate(result.solution), norm = Math.hypot(...final.gradient);
  if (norm <= FIT_CONFIGURATION.gradientTolerance) { converged = true; criterion = "GRADIENT_NORM"; }
  if (!converged && ["Newton step smaller than tol", "Line search step size smaller than tol"].includes(result.message)) { converged = true; criterion = "STEP_TOLERANCE"; }
  if (!converged || result.iterations >= maximumIterations || !Number.isFinite(result.f) || result.solution.some((v) => !Number.isFinite(v))) throw new CalibrationConvergenceError(`Calibration failed: ${result.message || "iteration limit"}; iterations=${result.iterations}; gradient norm=${norm}.`);
  // Explicitly verify representable probabilities for every fitted training vector.
  const calibrator = { family, parameters: [...result.solution] }; examples.forEach((r) => applyCalibrator(r.probabilities, calibrator));
  return { ...calibrator, initialParameters: initial, trainingRecords: examples.length, iterations: result.iterations, evaluations,
    objective: final.value, meanGradientNorm: norm, convergenceCriterion: criterion, termination: result.message };
}
