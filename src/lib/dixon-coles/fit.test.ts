import { describe, expect, it } from "vitest";
import { fitDixonColes, FitConvergenceError } from "./fit";
import { syntheticHistory } from "./test-fixtures";

describe("deterministic Dixon–Coles maximum likelihood", () => {
  it("fits identically under reordered frozen inputs, with finite likelihood and constrained parameters", () => {
    const data = Object.freeze(syntheticHistory().map((match) => Object.freeze({ ...match })));
    const before = JSON.stringify(data), fit = fitDixonColes(data);
    expect(JSON.stringify(fitDixonColes(data))).toBe(JSON.stringify(fit));
    expect(fitDixonColes([...data].reverse())).toEqual(fit);
    expect(JSON.stringify(data)).toBe(before);
    expect(fit.teams.map((rating) => rating.team)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    expect(fit.converged).toBe(true); expect(Number.isFinite(fit.negativeLogLikelihood)).toBe(true);
    expect(Math.abs(fit.rho)).toBeLessThan(0.2);
    expect(fit.teams.reduce((sum, rating) => sum + rating.attack, 0)).toBeCloseTo(0, 12);
    expect(fit.trainingMatchCount).toBe(data.length);
  });

  it("gives the team with clearly stronger scoring evidence a stronger attack estimate", () => {
    const fit = fitDixonColes(syntheticHistory(8));
    const strong = fit.teams.find((team) => team.team === "Alpha")!;
    expect(fit.teams.filter((team) => team.team !== "Alpha").every((team) => strong.attack > team.attack)).toBe(true);
  });

  it("throws on convergence failure rather than returning stale parameters or another model", () => {
    expect(() => fitDixonColes(syntheticHistory(), { maximumIterations: 1 })).toThrow(FitConvergenceError);
    expect(() => fitDixonColes([])).toThrow(/prior/);
    expect(() => fitDixonColes(syntheticHistory(), { maximumIterations: 0 })).toThrow(RangeError);
  });
});
