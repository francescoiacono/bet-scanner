import type { HistoricalThreeWayPrice } from "../value/types";
import { analyseThreeWayMarket } from "../value/market";
import { probabilityVector } from "./transforms";
import type { MarketValidationRecord, ValidationRecord } from "./types";

/** Called only AFTER fixed calibrated predictions exist. This module never fits. */
export function attachMarketBenchmark(records: readonly ValidationRecord[], prices: readonly HistoricalThreeWayPrice[]): MarketValidationRecord[] {
  if (records.length !== prices.length) throw new RangeError("Calibration market benchmark needs exactly the same eligible fixtures.");
  const byId = new Map(prices.map((p) => [p.fixtureId, p]));
  if (byId.size !== prices.length || new Set(records.map((r) => r.fixtureId)).size !== records.length) throw new RangeError("Duplicate benchmark fixture.");
  return records.map((r) => {
    const p = byId.get(r.fixtureId);
    if (!p || p.seasonId !== r.seasonId || p.sourceDate !== r.sourceDate) throw new RangeError(`Missing/misaligned calibration benchmark: ${r.fixtureId}`);
    const market = analyseThreeWayMarket(p).fairProbabilities; probabilityVector(market);
    return { ...r, market };
  });
}
