import type { OutcomeProbabilities } from "../football/types";
import type { AnalysedMarket, HistoricalThreeWayPrice } from "./types";

export function validateDecimalOdds(odds: number): void {
  if (!Number.isFinite(odds) || odds <= 1) throw new RangeError("Historical decimal odds must be finite and strictly greater than one.");
}
export function validateProbability(probability: number): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError("Probability must be finite and in [0, 1].");
}
export function validateThreeWayProbabilities(probabilities: OutcomeProbabilities): void {
  const values = [probabilities.homeProbability, probabilities.drawProbability, probabilities.awayProbability];
  values.forEach(validateProbability);
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-10) throw new RangeError("Three-way probabilities must sum to one.");
}
export function rawImpliedProbability(odds: number): number {
  validateDecimalOdds(odds); const implied = 1 / odds;
  if (!Number.isFinite(implied) || implied <= 0 || implied >= 1) throw new RangeError("Invalid raw implied probability.");
  return implied;
}
export function analyseThreeWayMarket(price: Pick<HistoricalThreeWayPrice, "homeOdds" | "drawOdds" | "awayOdds">): AnalysedMarket {
  const home = rawImpliedProbability(price.homeOdds), draw = rawImpliedProbability(price.drawOdds), away = rawImpliedProbability(price.awayOdds);
  const rawTotal = home + draw + away;
  const fairProbabilities = { homeProbability: home / rawTotal, drawProbability: draw / rawTotal, awayProbability: away / rawTotal };
  validateThreeWayProbabilities(fairProbabilities);
  return { rawImplied: { homeProbability: home, drawProbability: draw, awayProbability: away }, rawTotal, overround: rawTotal - 1, fairProbabilities };
}
export function expectedPriceROI(probability: number, odds: number): number {
  validateProbability(probability); validateDecimalOdds(odds);
  return probability * odds - 1;
}
export function fairMarketEdge(modelProbability: number, marketProbability: number): number {
  validateProbability(modelProbability); validateProbability(marketProbability);
  return modelProbability - marketProbability;
}
