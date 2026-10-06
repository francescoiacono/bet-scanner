import { describe, expect, it } from "vitest";
import {
  analyseBet,
  calculateEdge,
  calculateExpectedROI,
  calculateImpliedProbability,
  probabilityForSelection,
} from "./analyse-bet";
import type { FootballFixture, MatchPrediction } from "../football/types";
import type { MarketQuote, MatchWinnerSelection } from "./types";

const fixture: FootballFixture = {
  id: "fixture",
  homeTeam: "Example Home",
  awayTeam: "Example Away",
};
const quote: MarketQuote = {
  id: "example",
  fixtureId: fixture.id,
  market: "MATCH_WINNER",
  selection: "HOME",
  decimalOdds: 2.14,
};
const prediction: MatchPrediction = {
  fixtureId: fixture.id,
  homeProbability: 0.5,
  drawProbability: 0.3,
  awayProbability: 0.2,
  expectedHomeGoals: 1.7,
  expectedAwayGoals: 1.1,
  modelVersion: "test-model",
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

  it("joins separate quotes and predictions and adds all three calculations", () => {
    const result = analyseBet(quote, fixture, prediction);
    expect(result).toMatchObject(quote);
    expect(result.eventName).toBe("Example Home vs Example Away");
    expect(result.modelProbability).toBe(0.5);
    expect(result.prediction).toEqual(prediction);
    expect(result.prediction).not.toBe(prediction);
    expect(result.impliedProbability).toBeCloseTo(1 / 2.14);
    expect(result.edge).toBeCloseTo(0.5 - 1 / 2.14);
    expect(result.expectedROI).toBeCloseTo(0.07);
    expect(quote).not.toHaveProperty("modelProbability");
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
      expect(() => analyseBet({ ...quote, decimalOdds }, fixture, prediction)).toThrow(RangeError);
    },
  );

  it.each([-0.01, 1.01, NaN, Infinity, -Infinity])(
    "rejects invalid model probability: %s",
    (modelProbability) => {
      expect(() => calculateEdge(2, modelProbability)).toThrow(RangeError);
      expect(() => calculateExpectedROI(2, modelProbability)).toThrow(RangeError);
      expect(() => analyseBet(quote, fixture, { ...prediction, homeProbability: modelProbability })).toThrow(RangeError);
    },
  );

  it.each([
    ["HOME", 0.5], ["DRAW", 0.3], ["AWAY", 0.2],
  ] as const)("selects the correct %s probability", (selection, probability) => {
    expect(probabilityForSelection(prediction, selection)).toBe(probability);
    const analysed = analyseBet({ ...quote, selection }, fixture, prediction);
    expect(analysed.modelProbability).toBe(probability);
    expect(analysed.edge).toBeCloseTo(probability - 1 / quote.decimalOdds);
    expect(analysed.expectedROI).toBeCloseTo(probability * quote.decimalOdds - 1);
  });

  it("rejects mismatched quote or prediction fixture IDs", () => {
    expect(() => analyseBet({ ...quote, fixtureId: "other" }, fixture, prediction)).toThrow(RangeError);
    expect(() => analyseBet(quote, fixture, { ...prediction, fixtureId: "other" })).toThrow(RangeError);
  });

  it("rejects unsupported markets and selections at runtime", () => {
    expect(() => analyseBet({ ...quote, market: "OTHER" as MarketQuote["market"] }, fixture, prediction)).toThrow(RangeError);
    expect(() => analyseBet({ ...quote, selection: "OTHER" as MatchWinnerSelection }, fixture, prediction)).toThrow(RangeError);
  });

  it.each(["homeProbability", "drawProbability", "awayProbability"] as const)(
    "validates %s even when analysing another selection",
    (field) => {
      expect(() => analyseBet(quote, fixture, { ...prediction, [field]: NaN })).toThrow(RangeError);
      expect(() => analyseBet(quote, fixture, { ...prediction, [field]: -0.1 })).toThrow(RangeError);
    },
  );

  it("rejects unnormalized model probabilities", () => {
    expect(() => analyseBet(quote, fixture, { ...prediction, drawProbability: 0.4 })).toThrow(/sum to 1/);
  });

  it.each([
    { expectedHomeGoals: -1 }, { expectedAwayGoals: Infinity },
    { modelVersion: "" }, { fixtureId: "" },
  ])("rejects invalid prediction metadata: %j", (invalidFields) => {
    expect(() => analyseBet(quote, fixture, { ...prediction, ...invalidFields })).toThrow(RangeError);
  });

  it("rejects blank quote IDs and invalid fixtures", () => {
    expect(() => analyseBet({ ...quote, id: " " }, fixture, prediction)).toThrow(RangeError);
    expect(() => analyseBet(quote, { ...fixture, awayTeam: fixture.homeTeam }, prediction)).toThrow(RangeError);
  });

  it("does not mutate any source input", () => {
    const frozenQuote = Object.freeze({ ...quote });
    const frozenFixture = Object.freeze({ ...fixture });
    const frozenPrediction = Object.freeze({ ...prediction });
    const result = analyseBet(frozenQuote, frozenFixture, frozenPrediction);
    expect(frozenQuote).toEqual(quote);
    expect(frozenFixture).toEqual(fixture);
    expect(frozenPrediction).toEqual(prediction);
    expect(result.prediction).not.toBe(frozenPrediction);
  });
});
