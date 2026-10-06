import { calculateBrierScore } from "../backtest/metrics";
import { lexical, OLDER_PRICE_SEASONS, RECENT_PRICE_SEASONS } from "./config";
import { validatePriceDate } from "./data";
import { analyseThreeWayMarket, expectedPriceROI, fairMarketEdge, validateThreeWayProbabilities } from "./market";
import { selectPaperBet } from "./selection";
import { settlePaperBet } from "./settlement";
import type { FrozenValuePrediction, HistoricalThreeWayPrice, PriceCohort, ValueRecord } from "./types";

export const compareValueRecords = (a: Pick<ValueRecord, "seasonId" | "sourceDate" | "fixtureId">, b: Pick<ValueRecord, "seasonId" | "sourceDate" | "fixtureId">) =>
  lexical(a.seasonId, b.seasonId) || lexical(a.sourceDate, b.sourceDate) || lexical(a.fixtureId, b.fixtureId);

/** Requires identical eligible fixture sets. Never constructs or refits predictions. */
export function evaluateFrozenPrices(predictions: readonly FrozenValuePrediction[], prices: readonly HistoricalThreeWayPrice[], cohort: PriceCohort): ValueRecord[] {
  const seasons: readonly string[] = cohort === "RECENT" ? RECENT_PRICE_SEASONS : cohort === "OLDER" ? OLDER_PRICE_SEASONS : [];
  if (!seasons.length || prices.length !== predictions.length) throw new RangeError("Price and frozen prediction coverage must match exactly within a known cohort.");
  const byId = new Map<string, HistoricalThreeWayPrice>();
  for (const price of prices) {
    if (!price.fixtureId.trim() || byId.has(price.fixtureId)) throw new RangeError("Duplicate/empty price fixture ID.");
    byId.set(price.fixtureId, price);
  }
  const ids = new Set<string>();
  return [...predictions].sort(compareValueRecords).map((prediction) => {
    if (ids.has(prediction.fixtureId) || !seasons.includes(prediction.seasonId) || prediction.modelVersion !== "dixon-coles-v1") throw new RangeError("Duplicate frozen prediction or incorrect cohort/model.");
    ids.add(prediction.fixtureId); validatePriceDate(prediction.sourceDate); validateThreeWayProbabilities(prediction.modelProbabilities);
    const price = byId.get(prediction.fixtureId);
    if (!price || price.seasonId !== prediction.seasonId || price.sourceDate !== prediction.sourceDate) throw new RangeError(`Missing/misaligned eligible price: ${prediction.fixtureId}`);
    const market = analyseThreeWayMarket(price);
    // Select using ONLY forecasts and prices. The realised outcome is accessed afterward.
    const selection = selectPaperBet({ modelProbabilities: prediction.modelProbabilities, price });
    const settlement = settlePaperBet(selection, prediction.actualOutcome);
    if (calculateBrierScore(prediction.modelProbabilities, prediction.actualOutcome) !== prediction.modelBrier) throw new RangeError("Frozen model Brier differs from its recorded probabilities/outcome.");
    const marketFairBrier = calculateBrierScore(market.fairProbabilities, prediction.actualOutcome);
    const p = prediction.modelProbabilities, fair = market.fairProbabilities;
    return { ...prediction, cohort, price, market, marketFairBrier, modelBrierAdvantage: marketFairBrier - prediction.modelBrier,
      expectedROIs: { homeProbability: expectedPriceROI(p.homeProbability, price.homeOdds), drawProbability: expectedPriceROI(p.drawProbability, price.drawOdds), awayProbability: expectedPriceROI(p.awayProbability, price.awayOdds) },
      fairMarketEdges: { homeProbability: fairMarketEdge(p.homeProbability, fair.homeProbability), drawProbability: fairMarketEdge(p.drawProbability, fair.drawProbability), awayProbability: fairMarketEdge(p.awayProbability, fair.awayProbability) }, selection, settlement };
  });
}
