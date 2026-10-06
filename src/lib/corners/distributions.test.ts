import { describe, expect, it } from "vitest";
import { countCDF, logGamma, negativeBinomialPMF, negativeBinomialVariance, poissonPMF } from "./distributions";
import { distributionPrediction, overCornerProbability, totalCornerMasses, validateDistribution } from "./prediction";

describe("count distributions and stable log Gamma", () => {
  it("reproduces Gamma identities and stays finite over fitting ranges", () => {
    expect(logGamma(1)).toBeCloseTo(0, 13);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 13);
    let factorial = 0;
    for (let n = 1; n <= 100; n++) { factorial += Math.log(n); expect(logGamma(n + 1)).toBeCloseTo(factorial, 10); }
    for (const value of [1e-8, 0.1, 1, 100, 1e6, 1e10]) expect(Number.isFinite(logGamma(value))).toBe(true);
    for (const value of [0, -1, NaN, Infinity]) expect(() => logGamma(value)).toThrow(RangeError);
  });
  it("matches Poisson PMFs, increasing CDF, finite nonnegative mass and expectation", () => {
    expect(poissonPMF(2, 3)).toBeCloseTo(Math.exp(-3) * 9 / 2, 13);
    expect(poissonPMF(0, 0)).toBe(1); expect(poissonPMF(1, 0)).toBe(0);
    let previous = 0, expected = 0;
    for (let k = 0; k < 80; k++) {
      const pmf = poissonPMF(k, 5); expect(Number.isFinite(pmf) && pmf >= 0).toBe(true);
      const cdf = countCDF(k, 5); expect(cdf).toBeGreaterThanOrEqual(previous); previous = cdf; expected += k * pmf;
    }
    expect(previous).toBeCloseTo(1, 12); expect(expected).toBeCloseTo(5, 12);
    expect(() => poissonPMF(-1, 2)).toThrow(RangeError); expect(() => poissonPMF(1, -2)).toThrow(RangeError);
  });
  it("matches NB examples, mean and NB2 variance", () => {
    expect(negativeBinomialPMF(0, 2, 1)).toBeCloseTo(1 / 3, 13);
    expect(negativeBinomialPMF(1, 2, 1)).toBeCloseTo(2 / 9, 13);
    expect(negativeBinomialPMF(2, 2, 0.5)).toBeCloseTo(0.1875, 13);
    let mass = 0, expected = 0, second = 0;
    for (let k = 0; k < 200; k++) {
      const p = negativeBinomialPMF(k, 5, 0.4); expect(Number.isFinite(p) && p >= 0).toBe(true);
      mass += p; expected += k * p; second += k * k * p;
    }
    expect(mass).toBeCloseTo(1, 12); expect(expected).toBeCloseTo(5, 11);
    expect(second - expected ** 2).toBeCloseTo(negativeBinomialVariance(5, 0.4), 10);
  });
  it("approaches Poisson smoothly for very small alpha and rejects invalid dispersion", () => {
    for (const alpha of [1e-8, 1e-12, 1e-20]) for (let k = 0; k < 35; k++) expect(negativeBinomialPMF(k, 5, alpha)).toBeCloseTo(poissonPMF(k, 5), 7);
    for (const alpha of [0, -1, Infinity, NaN]) expect(() => negativeBinomialPMF(2, 5, alpha)).toThrow(RangeError);
  });
  it("convolves home and away, retaining every upper-tail probability instead of normalizing it away", () => {
    const masses = totalCornerMasses(30, 5, 4, null);
    masses.forEach((p, k) => expect(p).toBeCloseTo(poissonPMF(k, 9), 12));
    for (const alpha of [null, 0.2, 2]) {
      const forecast = distributionPrediction("test", 20, 15, alpha, alpha === null ? "corner-poisson-v1" : "corner-negative-binomial-v1");
      expect(forecast.totalProbabilities).toHaveLength(32); validateDistribution(forecast.totalProbabilities);
      expect(forecast.totalProbabilities[31]).toBeGreaterThan(0.1);
      expect(forecast.totalProbabilities.slice(0, 31)).toEqual(totalCornerMasses(30, 20, 15, alpha));
    }
  });
  it("evaluates fixed Over lines from their exact CDF and responds sensibly to larger means", () => {
    for (const alpha of [null, 0.1]) {
      const direct = totalCornerMasses(9, 5, 4, alpha).reduce((sum, p) => sum + p, 0);
      expect(overCornerProbability(9.5, 5, 4, alpha)).toBeCloseTo(1 - direct, 13);
      expect(overCornerProbability(9.5, 7, 6, alpha)).toBeGreaterThan(overCornerProbability(9.5, 5, 4, alpha));
    }
    expect(overCornerProbability(9.5, 0, 0)).toBe(0);
    expect(() => overCornerProbability(13.5, 5, 4)).toThrow(RangeError);
  });
});
