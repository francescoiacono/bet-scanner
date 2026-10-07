import { describe, expect, it } from "vitest";
import { INITIAL_PARAMETERS } from "./config";
import { applyCalibrator, calibrationLogits, logSumExp, probabilityVector, stableSoftmax } from "./transforms";
import { probabilities } from "./test-helpers";

describe("strict probabilities and stable softmax", () => {
  it("accepts valid triplets", () => expect(probabilityVector(probabilities())).toEqual([0.6, 0.25, 0.15]));
  it.each([0, -0.1, 1, NaN, Infinity])("rejects boundary/non-finite probability %s", (p) => expect(() => probabilityVector(probabilities(p, 0.2, 0.8 - p))).toThrow());
  it("rejects incorrect sums and extra feature fields", () => { expect(() => probabilityVector(probabilities(0.4, 0.4, 0.4))).toThrow(); expect(() => probabilityVector({ ...probabilities(), market: 0.5 } as ReturnType<typeof probabilities>)).toThrow(); });
  it("softmax sums to one and remains positive", () => { const p = probabilityVector(stableSoftmax([1, 2, 3])); expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1); expect(p.every((x) => x > 0 && x < 1)).toBe(true); });
  it("handles large common logits by max subtraction", () => expect(stableSoftmax([10000, 10001, 10002])).toEqual(stableSoftmax([0, 1, 2])));
  it("rejects non-finite logits or unrepresentable output", () => { expect(() => stableSoftmax([Infinity, 1, 2])).toThrow(); expect(() => stableSoftmax([10000, 0, -10000])).toThrow(); expect(() => stableSoftmax([1, 2])).toThrow(); });
  it("uses stable finite log-sum-exp", () => { expect(logSumExp([10000, 10000, 10000])).toBeCloseTo(10000 + Math.log(3)); expect(() => logSumExp([NaN])).toThrow(); });
});
describe("shared positive temperature", () => {
  const apply = (temperature: number) => applyCalibrator(probabilities(), { family: "temperature-v1", parameters: [Math.log(temperature)] });
  it("T=1 reproduces raw probabilities", () => { const q = apply(1); expect(q.homeProbability).toBeCloseTo(0.6, 14); expect(q.drawProbability).toBeCloseTo(0.25, 14); expect(q.awayProbability).toBeCloseTo(0.15, 14); });
  it("T>1 softens", () => expect(apply(2).homeProbability).toBeLessThan(0.6));
  it("T<1 sharpens", () => expect(apply(0.5).homeProbability).toBeGreaterThan(0.6));
  it.each([0.5, 1, 2, 10])("preserves class ordering at T=%s", (t) => { const q = apply(t); expect(q.homeProbability).toBeGreaterThan(q.drawProbability); expect(q.drawProbability).toBeGreaterThan(q.awayProbability); });
  it("preserves exact class ties", () => { const q = applyCalibrator(probabilities(0.4, 0.4, 0.2), { family: "temperature-v1", parameters: [Math.log(2)] }); expect(q.homeProbability).toBe(q.drawProbability); });
  it("returns unit-sum output", () => expect(probabilityVector(apply(2)).reduce((s, p) => s + p, 0)).toBeCloseTo(1));
  it("does not mutate inputs", () => { const p = probabilities(), before = structuredClone(p), parameters = [0]; applyCalibrator(p, { family: "temperature-v1", parameters }); expect(p).toEqual(before); expect(parameters).toEqual([0]); });
  it("rejects invalid temperature parameters", () => { expect(() => applyCalibrator(probabilities(), { family: "temperature-v1", parameters: [1000] })).toThrow(); expect(() => applyCalibrator(probabilities(), { family: "temperature-v1", parameters: [] })).toThrow(); });
  it("fails explicitly if extreme softening collapses class ordering", () => expect(() => applyCalibrator(probabilities(), { family: "temperature-v1", parameters: [100] })).toThrow(/ordering/));
});
describe("six-parameter AWAY-reference multinomial calibration", () => {
  const calibrator = { family: "multinomial-logit-v1" as const, parameters: INITIAL_PARAMETERS["multinomial-logit-v1"] };
  it("identity initialization reproduces raw probabilities", () => { const q = probabilityVector(applyCalibrator(probabilities(), calibrator)); q.forEach((p, i) => expect(p).toBeCloseTo(probabilityVector(probabilities())[i], 14)); });
  it("returns finite positive unit-sum output", () => { const q = probabilityVector(applyCalibrator(probabilities(), { ...calibrator, parameters: [0.1, 0.8, 0.1, -0.1, 0.05, 0.9] })); expect(q.every((x) => Number.isFinite(x) && x > 0)).toBe(true); expect(q.reduce((s, p) => s + p, 0)).toBeCloseTo(1); });
  it("uses zero AWAY logit and exact log-ratio features", () => { const z = calibrationLogits(probabilities(), calibrator); expect(z[0]).toBeCloseTo(Math.log(0.6 / 0.15)); expect(z[1]).toBeCloseTo(Math.log(0.25 / 0.15)); expect(z[2]).toBe(0); });
  it("HOME intercept raises HOME probability", () => expect(applyCalibrator(probabilities(), { ...calibrator, parameters: [0.5, 1, 0, 0, 0, 1] }).homeProbability).toBeGreaterThan(0.6));
  it("object property order is irrelevant", () => expect(applyCalibrator({ awayProbability: 0.15, homeProbability: 0.6, drawProbability: 0.25 }, calibrator)).toEqual(applyCalibrator(probabilities(), calibrator)));
  it("does not mutate probabilities or coefficients", () => { const p = probabilities(), before = structuredClone({ p, calibrator }); applyCalibrator(p, calibrator); expect({ p, calibrator }).toEqual(before); });
  it("requires exactly six finite coefficients", () => { expect(() => applyCalibrator(probabilities(), { ...calibrator, parameters: [0, 1] })).toThrow(); expect(() => applyCalibrator(probabilities(), { ...calibrator, parameters: [NaN, 1, 0, 0, 0, 1] })).toThrow(); });
});
