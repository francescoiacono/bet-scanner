import { describe, expect, it } from "vitest";
import { mockFixtures } from "../../data/mock-fixtures";
import { mockMarketQuotes } from "../../data/mock-markets";
import { mockPlayedMatches } from "../../data/mock-played-matches";
import { deriveTeamProfiles } from "../backtest/history";
import { scanMarkets } from "../scan-markets";
import { analyseBet } from "./analyse-bet";
import { DEFAULT_MINIMUM_EDGE, rankBets } from "./rank-bets";
import type { AnalysedBet } from "./types";

const mockTeamProfiles = deriveTeamProfiles(mockPlayedMatches);

function bet(
  id: string,
  decimalOdds: number,
  modelProbability: number,
): AnalysedBet {
  const fixture = { id: "fixture", homeTeam: "Example Home", awayTeam: "Example Away" };
  return analyseBet(
    { id, fixtureId: fixture.id, market: "MATCH_WINNER", selection: "HOME", decimalOdds },
    fixture,
    {
      fixtureId: fixture.id,
      homeProbability: modelProbability,
      drawProbability: (1 - modelProbability) / 2,
      awayProbability: (1 - modelProbability) / 2,
      expectedHomeGoals: 1.5,
      expectedAwayGoals: 1,
      modelVersion: "test-model",
    },
  );
}

describe("candidate filtering and ranking", () => {
  it("retains the default threshold of two percentage points", () => {
    expect(DEFAULT_MINIMUM_EDGE).toBe(0.02);
  });

  it("rejects negative value, fair pricing, and positive value below the threshold", () => {
    expect(rankBets([
      bet("negative", 2, 0.4),
      bet("fair", 2, 0.5),
      bet("small-edge", 2, 0.51),
    ])).toEqual([]);
  });

  it("includes a candidate exactly at the minimum edge, despite subtraction noise", () => {
    const candidates = rankBets([bet("boundary", 2.5, 0.42)]);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["boundary"]);
    expect(candidates[0].edge).toBeCloseTo(0.02);
  });

  it("rejects candidates just below the threshold without display rounding", () => {
    expect(rankBets([bet("below", 2.5, 0.42 - 1e-8)])).toEqual([]);
  });

  it("ranks by expected ROI rather than raw probability edge", () => {
    const candidates = rankBets([
      bet("larger-edge", 2, 0.57),
      bet("larger-roi", 4, 0.3),
      bet("smaller-roi", 2, 0.53),
    ]);
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "larger-roi", "larger-edge", "smaller-roi",
    ]);
    expect(candidates[0].expectedROI).toBeCloseTo(0.2);
    expect(candidates[0].edge).toBeLessThan(candidates[1].edge);
  });

  it("breaks equal-ROI ties by ID regardless of input order", () => {
    const a = bet("a", 2, 0.55);
    const b = bet("b", 2, 0.55);
    expect(rankBets([b, a]).map((candidate) => candidate.id)).toEqual(["a", "b"]);
    expect(rankBets([a, b]).map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });

  it("supports a configurable threshold and no qualifying candidates", () => {
    const opportunities = [bet("candidate", 2, 0.55)];
    expect(rankBets(opportunities, 0.04)).toHaveLength(1);
    expect(rankBets(opportunities, 0.1)).toEqual([]);
    expect(rankBets([])).toEqual([]);
  });

  it("accepts a zero threshold, including exactly fair candidates", () => {
    expect(rankBets([bet("fair", 2, 0.5)], 0)).toHaveLength(1);
  });

  it("does not mutate the source array or opportunities", () => {
    const a = Object.freeze(bet("a", 2, 0.53));
    const b = Object.freeze(bet("b", 3, 0.4));
    const input = Object.freeze([a, b]);
    expect(rankBets(input).map((candidate) => candidate.id)).toEqual(["b", "a"]);
    expect(input).toEqual([a, b]);
    expect(a.edge).toBeCloseTo(0.03);
  });

  it.each([-0.01, 1.01, NaN, Infinity, -Infinity])(
    "rejects invalid thresholds even for an empty dataset: %s",
    (threshold) => {
      expect(() => rankBets([], threshold)).toThrow(RangeError);
    },
  );

  it("invalid analysis cannot enter ranking", () => {
    expect(() => rankBets([bet("invalid-odds", 1, 0.5)])).toThrow(RangeError);
    expect(() => rankBets([bet("invalid-probability", 2, 1.1)])).toThrow(RangeError);
  });

  it("ranks the eighteen model-derived market selections using the same rules", () => {
    const { analysedBets: analysed } = scanMarkets(mockTeamProfiles, mockFixtures, mockMarketQuotes);
    expect(analysed).toHaveLength(18);
    expect(analysed.some((candidate) => candidate.edge > 0)).toBe(true);
    expect(analysed.some((candidate) => candidate.edge < 0)).toBe(true);
    const ranked = rankBets(analysed);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 0; i < ranked.length; i++) {
      expect(ranked[i].edge + Number.EPSILON).toBeGreaterThanOrEqual(DEFAULT_MINIMUM_EDGE);
      if (i > 0) expect(ranked[i - 1].expectedROI).toBeGreaterThanOrEqual(ranked[i].expectedROI);
    }
    expect(rankBets(analysed, 1)).toEqual([]);
  });

  it.each(["edge", "expectedROI"] as const)("rejects non-finite analysed %s", (field) => {
    expect(() => rankBets([{ ...bet("bad", 2, 0.55), [field]: NaN }])).toThrow(RangeError);
  });
});
