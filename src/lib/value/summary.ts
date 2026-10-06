import { compareValueRecords } from "./backtest";
import { bootstrapMarketBrier, bootstrapPaperROI } from "./bootstrap";
import { EV_BUCKETS, OLDER_PRICE_SEASONS, OUTCOME_ORDER, RECENT_PRICE_SEASONS } from "./config";
import { maximumDrawdown } from "./settlement";
import { mean, percentile, sum } from "./statistics";
import type { PriceCohort, ValueRecord } from "./types";

/** Explicit aggregates only: never serialize a fixture, team, price triplet or pick. */
export function paperStrategySummary(records: readonly ValueRecord[]) {
  const ordered = [...records].sort(compareValueRecords), selected = ordered.filter((r) => r.selection !== null);
  const stakes = sum(ordered.map((r) => r.settlement.stake)), returned = sum(ordered.map((r) => r.settlement.returned)), profit = sum(ordered.map((r) => r.settlement.profit));
  const wins = selected.filter((r) => r.settlement.won === true).length;
  return { evaluatedMatches: ordered.length, bets: selected.length, noBets: ordered.length - selected.length, betFrequency: ordered.length ? selected.length / ordered.length : null,
    wins, losses: selected.length - wins, strikeRate: selected.length ? wins / selected.length : null, totalStaked: stakes, totalReturned: returned, netProfit: profit, roi: stakes ? profit / stakes : null,
    averageOdds: mean(selected.map((r) => r.selection!.decimalOdds)), averageModelProbability: mean(selected.map((r) => r.selection!.modelProbability)),
    averageFairMarketProbability: mean(selected.map((r) => r.selection!.fairMarketProbability)), averageFairMarketEdge: mean(selected.map((r) => r.selection!.fairMarketEdge)),
    averageExpectedROI: mean(selected.map((r) => r.selection!.expectedROI)), maximumDrawdown: maximumDrawdown(ordered.map((r) => r.settlement.profit)) };
}
export function probabilitySummary(records: readonly ValueRecord[]) {
  const ordered = [...records].sort(compareValueRecords);
  return { evaluatedMatches: ordered.length, dixonColesBrier: mean(ordered.map((r) => r.modelBrier)), marketFairBrier: mean(ordered.map((r) => r.marketFairBrier)), modelBrierAdvantage: mean(ordered.map((r) => r.modelBrierAdvantage)) };
}
export function valueCohortSummary(records: readonly ValueRecord[], cohort: PriceCohort) {
  const seasonIds: readonly string[] = cohort === "RECENT" ? RECENT_PRICE_SEASONS : OLDER_PRICE_SEASONS;
  if (records.some((r) => r.cohort !== cohort || !seasonIds.includes(r.seasonId)) || new Set(records.map((r) => r.fixtureId)).size !== records.length) throw new RangeError("Cohort summaries require distinct records from a single price cohort.");
  const ordered = [...records].sort(compareValueRecords), overrounds = ordered.map((r) => r.market.overround), selected = ordered.filter((r) => r.selection !== null), ev = selected.map((r) => r.selection!.expectedROI);
  return { cohort, seasonIds, historicalMatches: 1900, evaluatedMatches: records.length, warmUpSkips: 1900 - records.length,
    probability: probabilitySummary(ordered), brierBootstrap: bootstrapMarketBrier(ordered), strategy: paperStrategySummary(ordered), roiBootstrap: bootstrapPaperROI(ordered),
    market: { overround: { mean: mean(overrounds), median: percentile(overrounds, 0.5), minimum: overrounds.length ? Math.min(...overrounds) : null, maximum: overrounds.length ? Math.max(...overrounds) : null },
      meanFairProbabilities: { homeProbability: mean(ordered.map((r) => r.market.fairProbabilities.homeProbability)), drawProbability: mean(ordered.map((r) => r.market.fairProbabilities.drawProbability)), awayProbability: mean(ordered.map((r) => r.market.fairProbabilities.awayProbability)) } },
    seasons: seasonIds.map((seasonId) => { const rows = ordered.filter((r) => r.seasonId === seasonId); return { seasonId, strategy: paperStrategySummary(rows), probability: probabilitySummary(rows) }; }),
    outcomes: OUTCOME_ORDER.map((outcome) => ({ outcome, strategy: paperStrategySummary(selected.filter((r) => r.selection!.outcome === outcome)) })),
    evBuckets: EV_BUCKETS.map((bucket) => ({ label: bucket.label, strategy: paperStrategySummary(selected.filter((r) => r.selection!.expectedROI >= bucket.minimum && r.selection!.expectedROI < bucket.maximum)) })),
    extremes: { maximumExpectedROI: ev.length ? Math.max(...ev) : null, p95ExpectedROI: percentile(ev, 0.95), p99ExpectedROI: percentile(ev, 0.99), selectionsAtLeast20Percent: ev.filter((value) => value >= 0.20).length } };
}
export type ValueCohortSummary = ReturnType<typeof valueCohortSummary>;
