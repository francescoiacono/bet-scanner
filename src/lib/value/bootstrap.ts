import { bootstrapPairedAdvantages, buildDateClusters, resampleSeasonClusters } from "../diagnostics/bootstrap";
import type { AdvantageInterval, DateCluster, PairedObservation } from "../diagnostics/types";
import { VALUE_BOOTSTRAP } from "./config";
import { compareValueRecords } from "./backtest";
import { percentile, seededRandom, sum } from "./statistics";
import type { ValueRecord } from "./types";

/** Adapts frozen score pairs to the existing generic clustering implementation. */
export function valueObservations(records: readonly ValueRecord[]): PairedObservation[] {
  return records.map((r) => ({ id: r.fixtureId, seasonId: r.seasonId, kickoffAt: r.sourceDate,
    brierScore: r.modelBrier, leagueBaseRateBrierScore: r.marketFairBrier, leaguePoissonBrierScore: r.marketFairBrier }));
}
export function bootstrapMarketBrier(records: readonly ValueRecord[]) {
  const { vsLeagueBaseRate, vsLeaguePoisson: unused, ...metadata } = bootstrapPairedAdvantages(valueObservations(records), VALUE_BOOTSTRAP);
  void unused;
  return { ...metadata, interval: vsLeagueBaseRate };
}
export interface ROIInterval extends AdvantageInterval {
  readonly zeroStakeReplicates: number;
  readonly availability: "AVAILABLE" | "UNAVAILABLE_ZERO_STAKES" | "UNAVAILABLE_NO_MATCHES";
}
/** Resample original evaluated match clusters, including no-bets, within season. */
export function bootstrapPaperROI(records: readonly ValueRecord[]) {
  const clusters = buildDateClusters(valueObservations(records));
  const bySeason = new Map<string, DateCluster[]>();
  for (const cluster of clusters) { const group = bySeason.get(cluster.seasonId) ?? []; group.push(cluster); bySeason.set(cluster.seasonId, group); }
  const strata = [...bySeason.values()], byId = new Map(records.map((r) => [r.fixtureId, r]));
  const totals = new Map(clusters.map((cluster) => [cluster, {
    profit: sum(cluster.observations.map((r) => byId.get(r.id)!.settlement.profit)),
    stakes: sum(cluster.observations.map((r) => byId.get(r.id)!.settlement.stake)),
  }]));
  const totalStakes = sum(records.map((r) => r.settlement.stake));
  const observedMean = totalStakes ? sum([...records].sort(compareValueRecords).map((r) => r.settlement.profit)) / totalStakes : null;
  const metadata = { method: "season-stratified original source-date-cluster percentile bootstrap" as const, ...VALUE_BOOTSTRAP,
    evaluatedMatches: records.length, dateClusters: clusters.length,
    strata: [...bySeason].map(([seasonId, group]) => ({ seasonId, dateClusters: group.length, evaluatedMatches: sum(group.map((c) => c.observations.length)) })) };
  if (!records.length) return { ...metadata, interval: { observedMean, lowerBound: null, upperBound: null, zeroStakeReplicates: 0, availability: "UNAVAILABLE_NO_MATCHES" as const } };
  const random = seededRandom(VALUE_BOOTSTRAP.seed), values: number[] = [];
  let zeroStakeReplicates = 0;
  for (let i = 0; i < VALUE_BOOTSTRAP.samples; i++) {
    let profit = 0, stakes = 0;
    for (const cluster of resampleSeasonClusters(strata, random)) { const total = totals.get(cluster)!; profit += total.profit; stakes += total.stakes; }
    if (!stakes) zeroStakeReplicates++; else values.push(profit / stakes);
  }
  // Never silently omit an undefined replicate to manufacture a conditional CI.
  const tail = (1 - VALUE_BOOTSTRAP.confidenceLevel) / 2;
  const interval: ROIInterval = { observedMean, lowerBound: zeroStakeReplicates ? null : percentile(values, tail), upperBound: zeroStakeReplicates ? null : percentile(values, 1 - tail),
    zeroStakeReplicates, availability: zeroStakeReplicates ? "UNAVAILABLE_ZERO_STAKES" : "AVAILABLE" };
  return { ...metadata, interval };
}
export type ProfitabilityStatus = "HISTORICAL_PAPER_EDGE_SUPPORTED" | "HISTORICAL_PAPER_EDGE_NEGATIVE" | "INCONCLUSIVE";
export function historicalProfitabilityStatus(recent: Pick<AdvantageInterval, "lowerBound" | "upperBound">, older: Pick<AdvantageInterval, "lowerBound" | "upperBound">): ProfitabilityStatus {
  const bounds = [recent.lowerBound, recent.upperBound, older.lowerBound, older.upperBound];
  if (bounds.some((value) => value === null || !Number.isFinite(value)) || recent.lowerBound! > recent.upperBound! || older.lowerBound! > older.upperBound!) return "INCONCLUSIVE";
  if (recent.lowerBound! > 0 && older.lowerBound! > 0) return "HISTORICAL_PAPER_EDGE_SUPPORTED";
  if (recent.upperBound! < 0 && older.upperBound! < 0) return "HISTORICAL_PAPER_EDGE_NEGATIVE";
  return "INCONCLUSIVE";
}
