import numeric from "numeric";
import type { PlayedMatch } from "../backtest/types";
import { prepareLikelihood } from "./likelihood";
import { DIXON_COLES_VERSION } from "./model";
import type { DixonColesFit, FitOptions } from "./types";

/** Prespecified numerical settings; changing them requires a new recorded model version. */
export const FIT_CONFIGURATION = Object.freeze({
  optimiser: "numeric@1.2.6 / BFGS", maximumIterations: 2000, stepTolerance: 1e-10,
  meanGradientTolerance: 1e-6, relativeObjectiveTolerance: 1e-10, stableIterations: 5,
  initialisation: "zeros independently for every eligible date batch; no warm starts",
  convergence: "mean gradient norm, five stable objective changes, or library step tolerance; finite valid fit required",
});

export class FitConvergenceError extends Error {
  constructor(message: string) { super(message); this.name = "FitConvergenceError"; }
}

export function fitDixonColes(history: readonly PlayedMatch[], options: FitOptions = {}): DixonColesFit {
  const objective = prepareLikelihood(history);
  const maximumIterations = options.maximumIterations === undefined ? FIT_CONFIGURATION.maximumIterations : options.maximumIterations;
  if (!Number.isSafeInteger(maximumIterations) || maximumIterations < 1) throw new RangeError("Maximum iterations must be a positive safe integer.");
  const initial = Array<number>(2 * objective.teams.length + 1).fill(0);
  let evaluations = 0, rejectedTrials = 0;
  let cachedPoint: number[] = [], cached: ReturnType<typeof objective.evaluate> | undefined;
  const evaluate = (point: number[]) => {
    if (cached && point.length === cachedPoint.length && point.every((value, index) => value === cachedPoint[index])) return cached;
    evaluations++;
    const value = objective.evaluate(point);
    cachedPoint = [...point]; cached = value;
    return value;
  };
  let lastValue: number | undefined, stable = 0, converged = false;
  let convergenceCriterion: DixonColesFit["convergenceCriterion"] = "GRADIENT_NORM";
  const callback = (_iteration: number, _point: number[], value: number, gradient: number[]) => {
    const relativeChange = lastValue === undefined ? Infinity : Math.abs(lastValue - value) / Math.max(1, Math.abs(lastValue));
    stable = relativeChange <= FIT_CONFIGURATION.relativeObjectiveTolerance ? stable + 1 : 0;
    lastValue = value;
    converged = Math.hypot(...gradient) <= FIT_CONFIGURATION.meanGradientTolerance || stable >= FIT_CONFIGURATION.stableIterations;
    if (converged) convergenceCriterion = Math.hypot(...gradient) <= FIT_CONFIGURATION.meanGradientTolerance ? "GRADIENT_NORM" : "RELATIVE_OBJECTIVE";
    return converged;
  };
  const result = numeric.uncmin((point) => {
    try { return evaluate(point).value; }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      // Infinity marks a REJECTED infeasible line-search trial, never a fitted score.
      rejectedTrials++; return Infinity;
    }
  }, initial, FIT_CONFIGURATION.stepTolerance, (point) => [...evaluate(point).gradient], maximumIterations, callback);
  const final = evaluate(result.solution);
  const meanGradientNorm = Math.hypot(...final.gradient);
  converged ||= meanGradientNorm <= FIT_CONFIGURATION.meanGradientTolerance;
  // At a tau-domain maximum switching between tied fixtures, the feasible
  // parameterisation is piecewise smooth. Record library step convergence
  // separately instead of claiming that its ordinary gradient vanished.
  if (!converged && ["Newton step smaller than tol", "Line search step size smaller than tol"].includes(result.message)) {
    converged = true; convergenceCriterion = "STEP_TOLERANCE";
  }
  if (!converged || result.iterations >= maximumIterations || !Number.isFinite(result.f)) {
    throw new FitConvergenceError(`Dixon–Coles failed to converge: ${result.message || "iteration limit"}; iterations=${result.iterations}; mean gradient norm=${meanGradientNorm}.`);
  }
  return { ...final.parameters, modelVersion: DIXON_COLES_VERSION, trainingMatchCount: objective.trainingMatchCount,
    teamCount: objective.teams.length, converged: true, iterations: result.iterations, evaluations, rejectedTrials,
    negativeLogLikelihood: final.negativeLogLikelihood, meanGradientNorm, termination: result.message, convergenceCriterion,
    rawParameters: [...result.solution] };
}
