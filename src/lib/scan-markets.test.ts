import { describe, expect, it } from "vitest";
import { mockFixtures } from "../data/mock-fixtures";
import { mockMarketQuotes } from "../data/mock-markets";
import { mockPlayedMatches } from "../data/mock-played-matches";
import { deriveTeamProfiles, calculateHistoricalLeagueAverages } from "./backtest/history";
import { rankBets } from "./betting/rank-bets";
import { scanMarkets } from "./scan-markets";

const mockTeamProfiles = deriveTeamProfiles(mockPlayedMatches);

describe("local model-to-market pipeline", () => {
  it("produces six predictions and eighteen independently joined quote analyses", () => {
    const scan = scanMarkets(mockTeamProfiles, mockFixtures, mockMarketQuotes);
    expect(scan.predictions).toHaveLength(6);
    expect(scan.analysedBets).toHaveLength(18);
    expect(scan.leagueAverages).toEqual(calculateHistoricalLeagueAverages(mockPlayedMatches));
    for (const bet of scan.analysedBets) {
      expect(bet.fixtureId).toBe(bet.prediction.fixtureId);
      expect(bet.prediction.modelVersion).toBe("poisson-v1");
      expect(bet.expectedROI).toBeCloseTo(bet.modelProbability * bet.decimalOdds - 1, 12);
    }
    expect(rankBets(scan.analysedBets).length).toBeGreaterThan(0);
  });

  it("keeps all three quotes per fixture and stores no model probabilities in data", () => {
    for (const fixture of mockFixtures) {
      const selections = mockMarketQuotes.filter((quote) => quote.fixtureId === fixture.id).map((quote) => quote.selection).sort();
      expect(selections).toEqual(["AWAY", "DRAW", "HOME"]);
    }
    for (const quote of mockMarketQuotes) expect(quote).not.toHaveProperty("modelProbability");
    for (const profile of mockTeamProfiles) expect(profile).not.toHaveProperty("homeProbability");
    expect(mockTeamProfiles.reduce((sum, profile) => sum + profile.homeGoalsFor, 0)).toBe(mockTeamProfiles.reduce((sum, profile) => sum + profile.awayGoalsAgainst, 0));
    expect(mockTeamProfiles.reduce((sum, profile) => sum + profile.awayGoalsFor, 0)).toBe(mockTeamProfiles.reduce((sum, profile) => sum + profile.homeGoalsAgainst, 0));
  });

  it("changing market prices affects value calculations but never predictions", () => {
    const original = scanMarkets(mockTeamProfiles, mockFixtures, mockMarketQuotes);
    const changedQuotes = mockMarketQuotes.map((quote, index) => index === 0 ? { ...quote, decimalOdds: quote.decimalOdds + 1 } : quote);
    const changed = scanMarkets(mockTeamProfiles, mockFixtures, changedQuotes);
    expect(changed.predictions).toEqual(original.predictions);
    expect(changed.analysedBets[0].modelProbability).toBe(original.analysedBets[0].modelProbability);
    expect(changed.analysedBets[0].expectedROI).not.toBe(original.analysedBets[0].expectedROI);
  });

  it("changing historical aggregates changes predictions without changing quotes", () => {
    const original = scanMarkets(mockTeamProfiles, mockFixtures, mockMarketQuotes);
    const changedProfiles = mockTeamProfiles.map((profile, index) => index === 0 ? { ...profile, homeGoalsFor: 45 } : profile);
    const changed = scanMarkets(changedProfiles, mockFixtures, mockMarketQuotes);
    expect(changed.predictions[0].homeProbability).not.toBe(original.predictions[0].homeProbability);
    expect(changed.analysedBets.map((bet) => bet.decimalOdds)).toEqual(mockMarketQuotes.map((quote) => quote.decimalOdds));
  });

  it("rejects missing team profiles and quotes for unknown fixtures", () => {
    expect(() => scanMarkets(mockTeamProfiles.slice(1), mockFixtures, mockMarketQuotes)).toThrow(/Missing team profile/);
    expect(() => scanMarkets(mockTeamProfiles, mockFixtures, [{ ...mockMarketQuotes[0], fixtureId: "unknown" }])).toThrow(/Unknown fixture/);
  });

  it("rejects duplicate fixture and quote IDs", () => {
    expect(() => scanMarkets(mockTeamProfiles, [mockFixtures[0], mockFixtures[0]], [])).toThrow(/Duplicate fixture/);
    expect(() => scanMarkets(mockTeamProfiles, mockFixtures, [mockMarketQuotes[0], mockMarketQuotes[0]])).toThrow(/Duplicate quote/);
  });

  it("fails the scan explicitly on invalid model or market data", () => {
    expect(() => scanMarkets([{ ...mockTeamProfiles[0], homeGoalsAgainst: NaN }], [], [])).toThrow(RangeError);
    expect(() => scanMarkets(mockTeamProfiles, mockFixtures, [{ ...mockMarketQuotes[0], decimalOdds: 1 }])).toThrow(RangeError);
  });

  it("supports an empty set of market selections without inventing candidates", () => {
    const scan = scanMarkets(mockTeamProfiles, mockFixtures, []);
    expect(scan.predictions).toHaveLength(6);
    expect(rankBets(scan.analysedBets)).toEqual([]);
  });

  it("does not mutate arrays or nested source records", () => {
    const profiles = Object.freeze(mockTeamProfiles.map((profile) => Object.freeze({ ...profile })));
    const fixtures = Object.freeze(mockFixtures.map((fixture) => Object.freeze({ ...fixture })));
    const quotes = Object.freeze(mockMarketQuotes.map((quote) => Object.freeze({ ...quote })));
    const scan = scanMarkets(profiles, fixtures, quotes);
    rankBets(scan.analysedBets);
    expect(profiles).toEqual(mockTeamProfiles);
    expect(fixtures).toEqual(mockFixtures);
    expect(quotes).toEqual(mockMarketQuotes);
  });
});
