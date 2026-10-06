import { describe, expect, it } from "vitest";
import { binaryBrier, binaryCalibration, isOver, rankedProbabilityScore } from "./metrics";

describe("normalized corner RPS and line-level binary metrics", () => {
  it("gives zero for a perfect forecast and the specified normalized known value", () => {
    expect(rankedProbabilityScore([0, 1, 0], 1)).toBe(0);
    expect(rankedProbabilityScore([0.2, 0.3, 0.5], 1)).toBeCloseTo((0.2 ** 2 + 0.5 ** 2) / 2, 13);
    expect(rankedProbabilityScore([0, 0, 1], 0)).toBeGreaterThan(rankedProbabilityScore([0, 1, 0], 0));
  });
  it("handles the 31+ category and never mutates a forecast", () => {
    const probabilities = Object.freeze([...Array(31).fill(0), 1]);
    expect(rankedProbabilityScore(probabilities, 31)).toBe(0); expect(rankedProbabilityScore(probabilities, 100)).toBe(0);
    expect(rankedProbabilityScore(probabilities, 0)).toBe(1); expect(probabilities[31]).toBe(1);
  });
  it("rejects invalid observations or distributions instead of producing plausible scores", () => {
    for (const probabilities of [[0.2, 0.3], [-0.1, 1.1], [NaN, 1], [1]]) expect(() => rankedProbabilityScore(probabilities, 1)).toThrow(RangeError);
    expect(() => rankedProbabilityScore([0.5, 0.5], -1)).toThrow(RangeError);
  });
  it("uses exact half-line boundaries and conventional binary Brier", () => {
    expect(isOver(9, 9.5)).toBe(false); expect(isOver(10, 9.5)).toBe(true);
    expect(binaryBrier(0.8, true)).toBeCloseTo(0.04, 13); expect(binaryBrier(0.8, false)).toBeCloseTo(0.64, 13);
    expect(binaryBrier(1, true)).toBe(0); expect(binaryBrier(1, false)).toBe(1);
    expect(() => binaryBrier(1.1, true)).toThrow(RangeError);
  });
  it("puts exact boundaries and probability 1 in their fixed bins and computes mean/observed rates", () => {
    const observations = Object.freeze([{ probability: 0, over: false }, { probability: 0.1, over: true }, { probability: 0.9, over: false }, { probability: 1, over: true }]);
    const result = binaryCalibration(observations);
    expect(result.bins.map((bin) => bin.count)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(result.meanPredictedProbability).toBe(0.5); expect(result.observedFrequency).toBe(0.5);
    expect(result.ece).toBeCloseTo((0 + 0.9 + 2 * 0.45) / 4, 13);
    expect(observations[1].probability).toBe(0.1);
  });
  it("returns null/unavailable rather than NaN on empty data", () => {
    const result = binaryCalibration([]);
    expect(result.meanPredictedProbability).toBeNull(); expect(result.observedFrequency).toBeNull(); expect(result.ece).toBeNull();
    expect(result.bins.every((bin) => bin.count === 0 && bin.meanPredictedProbability === null)).toBe(true);
  });
});
