import { describe, expect, it } from "vitest";
import type { OutcomeProbabilities } from "../football/types";
import {
  actualOutcome, calculateBrierScore, calculateBrierSkill, calculateCalibration,
  calibrationBucketIndex, topPick, UNIFORM_PROBABILITIES,
} from "./metrics";
import type { MatchOutcome } from "./types";

const prediction = { homeProbability: 0.6, drawProbability: 0.3, awayProbability: 0.1 };

describe("backtest probability-quality metrics", () => {
  it("uses the known HOME Brier score without dividing by three", () => {
    expect(calculateBrierScore(prediction, "HOME")).toBeCloseTo(0.26, 12);
  });

  it("uses the known DRAW Brier score", () => {
    expect(calculateBrierScore(prediction, "DRAW")).toBeCloseTo(0.86, 12);
  });

  it("scores a perfect forecast at zero, the worst at two, and valid forecasts within that range", () => {
    const perfect = { homeProbability: 1, drawProbability: 0, awayProbability: 0 };
    expect(calculateBrierScore(perfect, "HOME")).toBe(0);
    expect(calculateBrierScore(perfect, "AWAY")).toBe(2);
    for (const probabilities of [perfect, prediction, UNIFORM_PROBABILITIES]) {
      for (const outcome of ["HOME", "DRAW", "AWAY"] as const) {
        const score = calculateBrierScore(probabilities, outcome);
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(2);
      }
    }
  });

  it("scores the uniform benchmark at two-thirds for every actual outcome", () => {
    for (const outcome of ["HOME", "DRAW", "AWAY"] as const) {
      expect(calculateBrierScore(UNIFORM_PROBABILITIES, outcome)).toBeCloseTo(2 / 3, 12);
    }
  });

  it("calculates positive, zero, and negative Brier skill against the benchmark", () => {
    expect(calculateBrierSkill(0.5, 2 / 3)).toBeCloseTo(0.25);
    expect(calculateBrierSkill(2 / 3, 2 / 3)).toBe(0);
    expect(calculateBrierSkill(1, 2 / 3)).toBeCloseTo(-0.5);
    expect(calculateBrierSkill(0, 2 / 3)).toBe(1);
    expect(() => calculateBrierSkill(0.5, 0)).toThrow(RangeError);
    expect(() => calculateBrierSkill(NaN, 2 / 3)).toThrow(RangeError);
  });

  it("determines HOME, DRAW, or AWAY from a validated final score", () => {
    expect(actualOutcome(2, 1)).toBe("HOME");
    expect(actualOutcome(0, 0)).toBe("DRAW");
    expect(actualOutcome(1, 3)).toBe("AWAY");
    expect(() => actualOutcome(-1, 0)).toThrow(RangeError);
    expect(() => actualOutcome(0, 0.5)).toThrow(RangeError);
  });

  it("chooses the highest probability, breaking exact ties HOME then DRAW then AWAY", () => {
    expect(topPick({ homeProbability: 0.2, drawProbability: 0.3, awayProbability: 0.5 })).toEqual({ selection: "AWAY", confidence: 0.5 });
    expect(topPick(UNIFORM_PROBABILITIES).selection).toBe("HOME");
    expect(topPick({ homeProbability: 0.4, drawProbability: 0.4, awayProbability: 0.2 }).selection).toBe("HOME");
    expect(topPick({ homeProbability: 0.2, drawProbability: 0.4, awayProbability: 0.4 }).selection).toBe("DRAW");
  });

  it("uses half-open ten-point calibration bins including the exact boundaries", () => {
    expect(calibrationBucketIndex(0)).toBe(0);
    expect(calibrationBucketIndex(0.099)).toBe(0);
    expect(calibrationBucketIndex(0.1)).toBe(1);
    expect(calibrationBucketIndex(0.5)).toBe(5);
    expect(calibrationBucketIndex(0.9)).toBe(9);
  });

  it("places probability one in the final calibration bucket", () => {
    const calibration = calculateCalibration([{ topConfidence: 1, topSelectionCorrect: true }]);
    expect(calibrationBucketIndex(1)).toBe(9);
    expect(calibration.buckets[9]).toEqual({ lowerBound: 0.9, upperBound: 1, count: 1, meanConfidence: 1, observedAccuracy: 1 });
    expect(calibration.expectedCalibrationError).toBe(0);
  });

  it("calculates bucket means, observed accuracy, and a known weighted ECE", () => {
    const calibration = calculateCalibration([
      { topConfidence: 0.55, topSelectionCorrect: true },
      { topConfidence: 0.55, topSelectionCorrect: false },
      { topConfidence: 0.85, topSelectionCorrect: true },
      { topConfidence: 0.85, topSelectionCorrect: true },
    ]);
    expect(calibration.buckets[5].count).toBe(2);
    expect(calibration.buckets[5].meanConfidence).toBeCloseTo(0.55);
    expect(calibration.buckets[5].observedAccuracy).toBe(0.5);
    expect(calibration.buckets[8].observedAccuracy).toBe(1);
    expect(calibration.expectedCalibrationError).toBeCloseTo(0.1, 12);
    expect(calibration.buckets[0].meanConfidence).toBeNull();
  });

  it("rejects invalid probability vectors, outcomes, and confidence values explicitly", () => {
    const invalid: OutcomeProbabilities[] = [
      { ...prediction, homeProbability: NaN }, { ...prediction, homeProbability: -0.1 },
      { ...prediction, homeProbability: 1.1 }, { ...prediction, homeProbability: 0.5 },
    ];
    for (const probabilities of invalid) {
      expect(() => calculateBrierScore(probabilities, "HOME")).toThrow(RangeError);
      expect(() => topPick(probabilities)).toThrow(RangeError);
    }
    expect(() => calculateBrierScore(prediction, "OTHER" as MatchOutcome)).toThrow(RangeError);
    for (const confidence of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => calibrationBucketIndex(confidence)).toThrow(RangeError);
    }
  });
});
