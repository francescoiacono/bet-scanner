import { describe, expect, it } from "vitest";
import { calculateMatchProbabilities, MAX_GOALS, poissonProbability } from "./poisson";

describe("Poisson score probabilities", () => {
  it("matches known probabilities for lambda 2", () => {
    expect(poissonProbability(2, 0)).toBeCloseTo(0.1353352832366127, 12);
    expect(poissonProbability(2, 3)).toBeCloseTo(Math.exp(-2) * 2 ** 3 / 6, 12);
  });

  it("satisfies the Poisson recurrence between consecutive scores", () => {
    for (let k = 1; k <= MAX_GOALS; k++) {
      expect(poissonProbability(2, k) / poissonProbability(2, k - 1)).toBeCloseTo(2 / k, 12);
    }
  });

  it.each([0, 0.01, 1.2, 2.5, 10, 50, 750, 1000])(
    "keeps all 0–10 goal probabilities finite and non-negative for lambda %s", (lambda) => {
      const probabilities = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonProbability(lambda, k));
      expect(probabilities).toHaveLength(11);
      for (const value of probabilities) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(1 + Number.EPSILON);
    },
  );

  it("handles zero intensity as a point mass at zero goals", () => {
    expect(poissonProbability(0, 0)).toBe(1);
    for (let k = 1; k <= MAX_GOALS; k++) expect(poissonProbability(0, k)).toBe(0);
    expect(calculateMatchProbabilities(0, 0)).toEqual({ homeProbability: 0, drawProbability: 1, awayProbability: 0 });
  });

  it.each([[1.5, 1.2], [2.16, 0.675], [0, 3], [10, 10], [50, 40]])(
    "normalizes finite HOME/DRAW/AWAY probabilities for %s vs %s", (home, away) => {
      const result = calculateMatchProbabilities(home, away);
      const values = Object.values(result);
      expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      for (const value of values) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    },
  );

  it("normalizes the retained mass rather than treating the truncated tails as losses", () => {
    const rawMass = Array.from({ length: 11 }, (_, k) => poissonProbability(10, k)).reduce((sum, value) => sum + value, 0);
    expect(rawMass).toBeLessThan(1);
    const result = calculateMatchProbabilities(10, 0);
    expect(result.drawProbability).toBeCloseTo(poissonProbability(10, 0) / rawMass, 12);
    expect(result.homeProbability).toBeCloseTo(1 - result.drawProbability, 12);
    expect(result.awayProbability).toBe(0);
  });

  it("is symmetric for equal intensities and swaps outcomes when teams swap", () => {
    const equal = calculateMatchProbabilities(1.5, 1.5);
    expect(equal.homeProbability).toBeCloseTo(equal.awayProbability, 12);
    const original = calculateMatchProbabilities(2, 0.7);
    const swapped = calculateMatchProbabilities(0.7, 2);
    expect(original.homeProbability).toBeCloseTo(swapped.awayProbability, 12);
    expect(original.awayProbability).toBeCloseTo(swapped.homeProbability, 12);
    expect(original.drawProbability).toBeCloseTo(swapped.drawProbability, 12);
  });

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid intensities: %s", (lambda) => {
    expect(() => poissonProbability(lambda, 0)).toThrow(RangeError);
    expect(() => calculateMatchProbabilities(lambda, 1)).toThrow(RangeError);
    expect(() => calculateMatchProbabilities(1, lambda)).toThrow(RangeError);
  });

  it.each([-1, 0.5, 11, NaN, Infinity])("rejects invalid goal counts: %s", (goals) => {
    expect(() => poissonProbability(2, goals)).toThrow(RangeError);
  });

  it("fails explicitly when score-grid probability mass underflows", () => {
    expect(() => calculateMatchProbabilities(1000, 0)).toThrow(/probability mass/);
    expect(() => calculateMatchProbabilities(500, 500)).toThrow(/probability mass/);
  });
});
