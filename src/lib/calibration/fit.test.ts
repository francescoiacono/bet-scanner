import { describe, expect, it } from "vitest";
import { INITIAL_PARAMETERS } from "./config";
import { CalibrationConvergenceError, fitCalibrator } from "./fit";
import { prepareCalibrationObjective } from "./objective";
import { examples } from "./test-helpers";
import type { CalibrationExample } from "./types";

describe.each(["temperature-v1", "multinomial-logit-v1"] as const)("%s fitting", (family) => {
  it("fits deterministically", () => expect(fitCalibrator(examples(), family)).toEqual(fitCalibrator(examples(), family)));
  it("reversed example ordering produces exactly the same fit", () => expect(fitCalibrator(examples(), family)).toEqual(fitCalibrator(examples().reverse(), family)));
  it("does not mutate training data", () => { const rows = examples(), before = structuredClone(rows); fitCalibrator(rows, family); expect(rows).toEqual(before); });
  it("uses exactly the prescribed starting parameters", () => expect(fitCalibrator(examples(), family).initialParameters).toEqual(INITIAL_PARAMETERS[family]));
  it("has finite mean natural-log objective and gradients", () => { const v = prepareCalibrationObjective(examples(), family).evaluate(INITIAL_PARAMETERS[family]); expect(Number.isFinite(v.value)).toBe(true); expect(v.gradient.every(Number.isFinite)).toBe(true); expect(fitCalibrator(examples(), family).objective).toBeLessThan(v.value); });
  it("analytic gradient matches finite differences", () => { const o = prepareCalibrationObjective(examples(), family), point = family === "temperature-v1" ? [0.2] : [0.1, 0.9, 0.05, -0.1, 0.05, 0.8], gradient = o.evaluate(point).gradient, epsilon = 1e-6; point.forEach((_, i) => { const plus = [...point], minus = [...point]; plus[i] += epsilon; minus[i] -= epsilon; expect(gradient[i]).toBeCloseTo((o.evaluate(plus).value - o.evaluate(minus).value) / (2 * epsilon), 7); }); });
  it("fails explicitly at the iteration cap without fallback", () => expect(() => fitCalibrator(examples(), family, { maximumIterations: 1 })).toThrow(CalibrationConvergenceError));
  it("rejects invalid iteration caps", () => { for (const cap of [0, -1, 1.5, NaN]) expect(() => fitCalibrator(examples(), family, { maximumIterations: cap })).toThrow(); });
  it("fits finite parameters and records convergence diagnostics", () => { const f = fitCalibrator(examples(), family); expect(f.parameters.every(Number.isFinite)).toBe(true); expect(f.iterations).toBeLessThan(2000); expect(f.meanGradientNorm).not.toBeNull(); expect(f.trainingRecords).toBe(48); });
  it("rejects metadata, bookmaker features and invalid outcomes", () => { for (const key of ["fixtureId", "seasonId", "market", "odds", "homeTeam", "profit"]) expect(() => fitCalibrator([{ ...examples()[0], [key]: "forbidden" } as CalibrationExample], family)).toThrow(/only/); expect(() => fitCalibrator([{ ...examples()[0], actualOutcome: "INVALID" as "HOME" }], family)).toThrow(); });
  it("fails non-finite parameters/objective trials explicitly", () => { const o = prepareCalibrationObjective(examples(), family); expect(() => o.evaluate(INITIAL_PARAMETERS[family].map(() => Infinity))).toThrow(); });
});
it("identity requires no optimisation or fitted parameters", () => { const f = fitCalibrator(examples(), "identity"); expect(f.parameters).toEqual([]); expect(f.iterations).toBe(0); expect(f.convergenceCriterion).toBe("NO_FIT"); });
