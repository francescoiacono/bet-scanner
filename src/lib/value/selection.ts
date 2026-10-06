import { MIN_EXPECTED_ROI, OUTCOME_ORDER } from "./config";
import { analyseThreeWayMarket, expectedPriceROI, fairMarketEdge, validateThreeWayProbabilities } from "./market";
import type { PaperSelection, PaperSelectionInput } from "./types";

/** Fixed before profitability evaluation. No settlement information accepted. */
export function selectPaperBet(input: PaperSelectionInput): PaperSelection | null {
  if (Object.keys(input).some((key) => key !== "modelProbabilities" && key !== "price")) throw new RangeError("Paper selection input must exclude settlement outcomes, scores and returns.");
  validateThreeWayProbabilities(input.modelProbabilities);
  const market = analyseThreeWayMarket(input.price);
  const probabilities = [input.modelProbabilities.homeProbability, input.modelProbabilities.drawProbability, input.modelProbabilities.awayProbability];
  const odds = [input.price.homeOdds, input.price.drawOdds, input.price.awayOdds];
  const fair = [market.fairProbabilities.homeProbability, market.fairProbabilities.drawProbability, market.fairProbabilities.awayProbability];
  const candidates = OUTCOME_ORDER.map((outcome, i): PaperSelection => ({ outcome, decimalOdds: odds[i], modelProbability: probabilities[i],
    fairMarketProbability: fair[i], fairMarketEdge: fairMarketEdge(probabilities[i], fair[i]), expectedROI: expectedPriceROI(probabilities[i], odds[i]) }))
    .filter((candidate) => candidate.expectedROI >= MIN_EXPECTED_ROI);
  candidates.sort((a, b) => b.expectedROI - a.expectedROI || b.fairMarketEdge - a.fairMarketEdge || OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome));
  return candidates[0] ?? null;
}
