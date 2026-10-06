import { describe, expect, it } from "vitest";
import { CORNER_FIT_CONFIGURATION, CORNER_NB_VERSION, CORNER_POISSON_VERSION } from "./config";
import { CornerConvergenceError, fitCornerModel, initialCornerVector } from "./fit";
import { decodeCornerParameters, expectedCornerMeans, prepareCornerLikelihood } from "./likelihood";
import { syntheticCornerHistory } from "./test-fixtures";

const models = [CORNER_POISSON_VERSION, CORNER_NB_VERSION] as const;
describe("joint corner maximum-likelihood fits", () => {
  it("uses deterministic mean zeros and the predeclared NB alpha=0.1", () => {
    expect(initialCornerVector(4, CORNER_POISSON_VERSION)).toEqual(Array(8).fill(0));
    const initial = initialCornerVector(4, CORNER_NB_VERSION);
    expect(initial.slice(0, 8)).toEqual(Array(8).fill(0)); expect(initial[8]).toBe(Math.log(0.1));
    expect(CORNER_FIT_CONFIGURATION.initialAlpha).toBe(0.1);
  });
  it.each(models)("%s is deterministic, order invariant and preserves frozen inputs", (model) => {
    const history = Object.freeze(syntheticCornerHistory().map((m) => Object.freeze(m)));
    const fit = fitCornerModel(history, model);
    expect(fitCornerModel(history, model)).toEqual(fit);
    expect(fitCornerModel([...history].reverse(), model)).toEqual(fit);
    expect(fit.teams.map((t) => t.team)).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    expect(fit.teams.reduce((sum, t) => sum + t.cornerAttack, 0)).toBeCloseTo(0, 13);
    expect(Number.isFinite(fit.negativeLogLikelihood)).toBe(true); expect(fit.converged).toBe(true);
    const means = expectedCornerMeans(history[0], fit);
    expect(means.expectedHomeCorners).toBeGreaterThan(0); expect(Number.isFinite(means.expectedTotalCorners)).toBe(true);
    const alpha = fit.teams.find((t) => t.team === "Alpha")!, delta = fit.teams.find((t) => t.team === "Delta")!;
    expect(alpha.cornerAttack).toBeGreaterThan(delta.cornerAttack);
    expect(alpha.cornerDefenceWeakness).toBeLessThan(delta.cornerDefenceWeakness);
    if (model === CORNER_NB_VERSION) expect(Number.isFinite(fit.alpha) && fit.alpha! > 0).toBe(true);
    expect(() => fitCornerModel(history, model, { maximumIterations: 1 })).toThrow(CornerConvergenceError);
  });
  it.each(models)("%s gradient agrees with a full centered numerical check", (model) => {
    const objective = prepareCornerLikelihood(syntheticCornerHistory(3), model);
    const point = initialCornerVector(4, model); point[0] = 0.12; point[3] = 1.2; point[7] = 0.2;
    const actual = objective.evaluate(point);
    for (let i = 0; i < point.length; i++) {
      const lower = [...point], upper = [...point], epsilon = 2e-5; lower[i] -= epsilon; upper[i] += epsilon;
      const reference = (objective.evaluate(upper).value - objective.evaluate(lower).value) / (2 * epsilon);
      expect(actual.gradient[i]).toBeCloseTo(reference, 5);
    }
  });
  it("enforces parameter signs, home-only advantage and structurally derived attacks", () => {
    const teams = ["Alpha", "Beta"], parameters = decodeCornerParameters(teams, [0.3, -0.2, 0.5, 0.4], CORNER_POISSON_VERSION);
    const means = expectedCornerMeans({ homeTeam: "Alpha", awayTeam: "Beta" }, parameters);
    expect(means.expectedHomeCorners).toBeCloseTo(Math.exp(0.4 + 0.3 + 0.5));
    expect(means.expectedAwayCorners).toBeCloseTo(Math.exp(-0.3 - 0.2));
    const changed = expectedCornerMeans({ homeTeam: "Alpha", awayTeam: "Beta" }, { ...parameters, homeCornerAdvantage: 0.6 });
    expect(changed.expectedAwayCorners).toBe(means.expectedAwayCorners); expect(changed.expectedHomeCorners).toBeGreaterThan(means.expectedHomeCorners);
    expect(() => decodeCornerParameters([...teams].reverse(), [0, 0, 0, 0], CORNER_POISSON_VERSION)).toThrow(/lexically/);
    expect(() => decodeCornerParameters(teams, [0, 0, 0, 0, 1000], CORNER_NB_VERSION)).toThrow(/alpha/);
  });
});
