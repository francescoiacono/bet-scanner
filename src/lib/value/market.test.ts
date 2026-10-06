import { describe, expect, it } from "vitest";
import { analyseThreeWayMarket, expectedPriceROI, fairMarketEdge, rawImpliedProbability, validateThreeWayProbabilities } from "./market";
import { price } from "./test-helpers";

describe("historical market mathematics", () => {
  it("computes raw implied probabilities", () => { expect(rawImpliedProbability(2)).toBe(0.5); expect(rawImpliedProbability(3)).toBeCloseTo(1 / 3); });
  it("measures three-way overround", () => { const m = analyseThreeWayMarket(price({ homeOdds: 2, drawOdds: 3, awayOdds: 4 })); expect(m.rawTotal).toBeCloseTo(13 / 12); expect(m.overround).toBeCloseTo(1 / 12); });
  it("normalizes the triplet to one", () => { const p = analyseThreeWayMarket(price()).fairProbabilities; expect(p.homeProbability + p.drawProbability + p.awayProbability).toBeCloseTo(1); });
  it("matches a known proportional example", () => { const p = analyseThreeWayMarket(price({ homeOdds: 2, drawOdds: 3, awayOdds: 4 })).fairProbabilities; expect(p.homeProbability).toBeCloseTo(6 / 13); expect(p.drawProbability).toBeCloseTo(4 / 13); expect(p.awayProbability).toBeCloseTo(3 / 13); });
  it("reports an underround without filtering", () => { expect(analyseThreeWayMarket(price({ homeOdds: 4, drawOdds: 4, awayOdds: 4 })).overround).toBe(-0.25); });
  it.each([[0.5, 2, 0], [0.55, 2, 0.1], [0.45, 2, -0.1], [0.5, 2.14, 0.07]])("uses offered odds for expected ROI (%s at %s)", (p, o, ev) => expect(expectedPriceROI(p, o)).toBeCloseTo(ev));
  it("gives diagnostic edge the correct sign", () => { expect(fairMarketEdge(0.6, 0.5)).toBeCloseTo(0.1); expect(fairMarketEdge(0.4, 0.5)).toBeCloseTo(-0.1); });
  it.each([0, 1, -1, NaN, Infinity, -Infinity])("rejects invalid odds %s", (o) => { expect(() => rawImpliedProbability(o)).toThrow(); expect(() => analyseThreeWayMarket(price({ drawOdds: o }))).toThrow(); });
  it.each([-0.1, 1.1, NaN, Infinity])("rejects invalid probabilities %s", (p) => expect(() => expectedPriceROI(p, 2)).toThrow());
  it("rejects a probability triplet that does not sum to one", () => expect(() => validateThreeWayProbabilities({ homeProbability: 0.5, drawProbability: 0.5, awayProbability: 0.5 })).toThrow());
  it("does not mutate input", () => { const p = Object.freeze(price()); const before = JSON.stringify(p); analyseThreeWayMarket(p); expect(JSON.stringify(p)).toBe(before); });
});
