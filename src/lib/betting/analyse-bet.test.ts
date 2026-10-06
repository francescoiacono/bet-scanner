import { describe, expect, it } from "vitest";
import {
  analyseBet,
  calculateEdge,
  calculateExpectedROI,
  calculateImpliedProbability,
} from "./analyse-bet";
import type { BettingOpportunity } from "./types";

const opportunity: BettingOpportunity = {
  id: "example",
  eventName: "Example Home vs Example Away",
  homeTeam: "Example Home",
  awayTeam: "Example Away",
  market: "MATCH_WINNER",
  selection: "HOME",
  decimalOdds: 2.14,
  modelProbability: 0.5,
};

describe("bet analysis", () => {
  it("calculates implied probability from decimal odds", () => {
    expect(calculateImpliedProbability(2)).toBe(0.5);
    expect(calculateImpliedProbability(2.14)).toBeCloseTo(0.46728972, 8);
  });

  it("calculates edge as a probability difference, not a percentage", () => {
    expect(calculateEdge(2.14, 0.5)).toBeCloseTo(0.03271028, 8);
    expect(calculateEdge(2, 0.4)).toBeCloseTo(-0.1);
  });

  it("calculates the example expected ROI of 7%", () => {
    expect(calculateExpectedROI(2.14, 0.5)).toBeCloseTo(0.07);
  });

  it("retains opportunity fields and adds all three calculations", () => {
    const result = analyseBet(opportunity);
    expect(result).toMatchObject(opportunity);
    expect(result.impliedProbability).toBeCloseTo(1 / 2.14);
    expect(result.edge).toBeCloseTo(0.5 - 1 / 2.14);
    expect(result.expectedROI).toBeCloseTo(0.07);
    expect(result).not.toBe(opportunity);
  });

  it("handles fair pricing and both valid probability endpoints", () => {
    expect(calculateEdge(2, 0.5)).toBe(0);
    expect(calculateExpectedROI(2, 0.5)).toBe(0);
    expect(calculateExpectedROI(2, 0)).toBe(-1);
    expect(calculateExpectedROI(2, 1)).toBe(1);
  });

  it.each([1, 0, -2, NaN, Infinity, -Infinity])(
    "rejects invalid decimal odds: %s",
    (decimalOdds) => {
      expect(() => calculateImpliedProbability(decimalOdds)).toThrow(RangeError);
      expect(() => calculateEdge(decimalOdds, 0.5)).toThrow(RangeError);
      expect(() => calculateExpectedROI(decimalOdds, 0.5)).toThrow(RangeError);
      expect(() => analyseBet({ ...opportunity, decimalOdds })).toThrow(RangeError);
    },
  );

  it.each([-0.01, 1.01, NaN, Infinity, -Infinity])(
    "rejects invalid model probability: %s",
    (modelProbability) => {
      expect(() => calculateEdge(2, modelProbability)).toThrow(RangeError);
      expect(() => calculateExpectedROI(2, modelProbability)).toThrow(RangeError);
      expect(() => analyseBet({ ...opportunity, modelProbability })).toThrow(RangeError);
    },
  );
});
