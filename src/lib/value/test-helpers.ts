import { calculateBrierScore } from "../backtest/metrics";
import { evaluateFrozenPrices } from "./backtest";
import type { FrozenValuePrediction, HistoricalThreeWayPrice, ValueRecord } from "./types";

export function prediction(overrides: Partial<FrozenValuePrediction> = {}): FrozenValuePrediction {
  const value = { fixtureId: "synthetic-a", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", homeTeam: "Arsenal FC", awayTeam: "Manchester United FC",
    modelVersion: "dixon-coles-v1" as const, modelProbabilities: { homeProbability: 0.6, drawProbability: 0.25, awayProbability: 0.15 }, actualOutcome: "HOME" as const, modelBrier: 0, ...overrides };
  return { ...value, modelBrier: calculateBrierScore(value.modelProbabilities, value.actualOutcome) };
}
export function price(overrides: Partial<HistoricalThreeWayPrice> = {}): HistoricalThreeWayPrice {
  return { fixtureId: "synthetic-a", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", homeOdds: 2, drawOdds: 4, awayOdds: 4, ...overrides };
}
export function record(modelOverrides: Partial<FrozenValuePrediction> = {}, priceOverrides: Partial<HistoricalThreeWayPrice> = {}): ValueRecord {
  const model = prediction(modelOverrides), offered = price({ fixtureId: model.fixtureId, seasonId: model.seasonId, sourceDate: model.sourceDate, ...priceOverrides });
  return evaluateFrozenPrices([model], [offered], model.seasonId.startsWith("202") ? "RECENT" : "OLDER")[0];
}
export function noBet(overrides: Partial<FrozenValuePrediction> = {}): ValueRecord {
  return record({ modelProbabilities: { homeProbability: 0.5, drawProbability: 0.25, awayProbability: 0.25 }, ...overrides }, { homeOdds: 1.9, drawOdds: 3.8, awayOdds: 3.8 });
}
