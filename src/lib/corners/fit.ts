import numeric from "numeric";
import { CORNER_FIT_CONFIGURATION as configuration, CORNER_NB_VERSION } from "./config";
import { prepareCornerLikelihood } from "./likelihood";
import type { CornerFit, CornerModelVersion, PlayedCornerMatch } from "./types";

export class CornerConvergenceError extends Error {
  constructor(message: string) { super(message); this.name = "CornerConvergenceError"; }
}
export function initialCornerVector(teamCount: number, model: CornerModelVersion): number[] {
  if (!Number.isSafeInteger(teamCount) || teamCount < 2) throw new RangeError("Invalid fit team count.");
  const initial = Array<number>(2 * teamCount).fill(0);
  if (model === CORNER_NB_VERSION) initial.push(Math.log(configuration.initialAlpha));
  return initial;
}
export function fitCornerModel(history: readonly PlayedCornerMatch[], model: CornerModelVersion, options: { maximumIterations?: number } = {}): CornerFit {
  const objective = prepareCornerLikelihood(history, model);
  const maximumIterations = options.maximumIterations ?? configuration.maximumIterations;
  if (!Number.isSafeInteger(maximumIterations) || maximumIterations < 1) throw new RangeError("Maximum corner iterations must be a positive safe integer.");
  let evaluations = 0, rejectedTrials = 0, lastValue: number | undefined, stable = 0, converged = false;
  let criterion: CornerFit["convergenceCriterion"] = "GRADIENT_NORM";
  let cachedPoint: number[] = [], cached: ReturnType<typeof objective.evaluate> | undefined;
  const evaluate = (point: number[]) => {
    if (cached && point.every((v, i) => v === cachedPoint[i]) && point.length === cachedPoint.length) return cached;
    evaluations++; const result = objective.evaluate(point); cachedPoint = [...point]; cached = result; return result;
  };
  const result = numeric.uncmin((point) => {
    try { return evaluate(point).value; }
    catch (error) { if (!(error instanceof RangeError)) throw error; rejectedTrials++; return Infinity; }
  }, initialCornerVector(objective.teams.length, model), configuration.stepTolerance, (point) => [...evaluate(point).gradient], maximumIterations,
  (_iteration, _point, value, gradient) => {
    const change = lastValue === undefined ? Infinity : Math.abs(value - lastValue) / Math.max(1, Math.abs(lastValue));
    stable = change <= configuration.relativeObjectiveTolerance ? stable + 1 : 0; lastValue = value;
    const gradientConverged = Math.hypot(...gradient) <= configuration.meanGradientTolerance;
    converged = gradientConverged || stable >= configuration.stableIterations;
    if (converged) criterion = gradientConverged ? "GRADIENT_NORM" : "RELATIVE_OBJECTIVE";
    return converged;
  });
  const final = evaluate(result.solution), meanGradientNorm = Math.hypot(...final.gradient);
  if (meanGradientNorm <= configuration.meanGradientTolerance) { converged = true; criterion = "GRADIENT_NORM"; }
  if (!converged && ["Newton step smaller than tol", "Line search step size smaller than tol"].includes(result.message)) { converged = true; criterion = "STEP_TOLERANCE"; }
  if (!converged || result.iterations >= maximumIterations || !Number.isFinite(result.f)) throw new CornerConvergenceError(`${model} failed: ${result.message || "iteration limit"}; iterations=${result.iterations}; gradient=${meanGradientNorm}.`);
  return { ...final.parameters, modelVersion: model, converged: true, trainingMatchCount: history.length, teamCount: objective.teams.length,
    iterations: result.iterations, evaluations, rejectedTrials, negativeLogLikelihood: final.negativeLogLikelihood,
    meanGradientNorm, convergenceCriterion: criterion, termination: result.message, rawParameters: [...result.solution] };
}
