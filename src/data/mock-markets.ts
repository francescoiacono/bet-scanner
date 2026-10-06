import type { MarketQuote } from "../lib/betting/types";

// Fictional prices only: the football model never reads this dataset.
export const mockMarketQuotes: readonly MarketQuote[] = [
  { id: "quote-001-home", fixtureId: "fixture-001", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 1.9 },
  { id: "quote-001-draw", fixtureId: "fixture-001", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 3.7 },
  { id: "quote-001-away", fixtureId: "fixture-001", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 4.8 },
  { id: "quote-002-home", fixtureId: "fixture-002", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 2.35 },
  { id: "quote-002-draw", fixtureId: "fixture-002", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 3.3 },
  { id: "quote-002-away", fixtureId: "fixture-002", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 3.2 },
  { id: "quote-003-home", fixtureId: "fixture-003", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 1.8 },
  { id: "quote-003-draw", fixtureId: "fixture-003", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 3.6 },
  { id: "quote-003-away", fixtureId: "fixture-003", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 4.6 },
  { id: "quote-004-home", fixtureId: "fixture-004", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 2.65 },
  { id: "quote-004-draw", fixtureId: "fixture-004", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 3.2 },
  { id: "quote-004-away", fixtureId: "fixture-004", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 2.65 },
  { id: "quote-005-home", fixtureId: "fixture-005", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 1.65 },
  { id: "quote-005-draw", fixtureId: "fixture-005", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 4.1 },
  { id: "quote-005-away", fixtureId: "fixture-005", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 5.2 },
  { id: "quote-006-home", fixtureId: "fixture-006", market: "MATCH_WINNER", selection: "HOME", decimalOdds: 2.75 },
  { id: "quote-006-draw", fixtureId: "fixture-006", market: "MATCH_WINNER", selection: "DRAW", decimalOdds: 3.1 },
  { id: "quote-006-away", fixtureId: "fixture-006", market: "MATCH_WINNER", selection: "AWAY", decimalOdds: 2.45 },
];
