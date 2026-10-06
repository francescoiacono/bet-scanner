import type { FootballFixture, MatchPrediction } from "../football/types";
import { validateFixture, validateName, validatePrediction } from "../football/validation";
import type { AnalysedBet, MarketQuote, MatchWinnerSelection } from "./types";

function validateOdds(decimalOdds: number): void {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new RangeError("Decimal odds must be a finite number greater than 1.");
  }
}

function validateProbability(modelProbability: number): void {
  if (
    !Number.isFinite(modelProbability) ||
    modelProbability < 0 ||
    modelProbability > 1
  ) {
    throw new RangeError("Model probability must be a finite number between 0 and 1.");
  }
}

export function calculateImpliedProbability(decimalOdds: number): number {
  validateOdds(decimalOdds);
  return 1 / decimalOdds;
}

export function calculateEdge(
  decimalOdds: number,
  modelProbability: number,
): number {
  validateProbability(modelProbability);
  return modelProbability - calculateImpliedProbability(decimalOdds);
}

export function calculateExpectedROI(
  decimalOdds: number,
  modelProbability: number,
): number {
  validateOdds(decimalOdds);
  validateProbability(modelProbability);
  return modelProbability * decimalOdds - 1;
}

export function probabilityForSelection(
  prediction: MatchPrediction,
  selection: MatchWinnerSelection,
): number {
  validatePrediction(prediction);
  switch (selection) {
    case "HOME": return prediction.homeProbability;
    case "DRAW": return prediction.drawProbability;
    case "AWAY": return prediction.awayProbability;
    default: throw new RangeError("Unsupported match-winner selection.");
  }
}

/** Join separate market and model inputs; invalid data fails explicitly. */
export function analyseBet(
  quote: MarketQuote,
  fixture: FootballFixture,
  prediction: MatchPrediction,
): AnalysedBet {
  validateName(quote.id, "Quote ID");
  validateFixture(fixture);
  if (quote.market !== "MATCH_WINNER") {
    throw new RangeError("Only MATCH_WINNER markets are supported.");
  }
  if (quote.fixtureId !== fixture.id || prediction.fixtureId !== fixture.id) {
    throw new RangeError("Quote, fixture, and prediction must reference the same fixture.");
  }
  const modelProbability = probabilityForSelection(prediction, quote.selection);
  return {
    ...quote,
    eventName: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    prediction: { ...prediction },
    modelProbability,
    impliedProbability: calculateImpliedProbability(quote.decimalOdds),
    edge: calculateEdge(quote.decimalOdds, modelProbability),
    expectedROI: calculateExpectedROI(quote.decimalOdds, modelProbability),
  };
}
