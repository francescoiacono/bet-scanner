import { kickoffTimestamp } from "../backtest/history";
import type { AdvantageInterval, BootstrapConfig, BootstrapResult, DateCluster, PairedObservation } from "./types";

export const DEFAULT_BOOTSTRAP_CONFIG = Object.freeze({ samples: 5000, seed: 202605, confidenceLevel: 0.95 });
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Canonical ordering makes results reproducible even if source records are reordered. */
export function buildDateClusters(records: readonly PairedObservation[]): readonly DateCluster[] {
  const ids = new Set<string>();
  for (const record of records) {
    if (!record.id.trim() || !record.seasonId.trim() || ids.has(record.id)) {
      throw new RangeError("Bootstrap observations require unique match IDs and non-empty season IDs.");
    }
    ids.add(record.id);
    kickoffTimestamp(record.kickoffAt);
    if ([record.brierScore, record.leagueBaseRateBrierScore, record.leaguePoissonBrierScore]
      .some((score) => !Number.isFinite(score) || score < 0 || score > 2)) {
      throw new RangeError("Paired Brier scores must be finite and in [0, 2].");
    }
  }
  const ordered = [...records].sort((a, b) => compare(a.seasonId, b.seasonId)
    || compare(a.kickoffAt.slice(0, 10), b.kickoffAt.slice(0, 10)) || compare(a.id, b.id));
  const clusters: { seasonId: string; sourceDate: string; observations: PairedObservation[] }[] = [];
  for (const record of ordered) {
    const sourceDate = record.kickoffAt.slice(0, 10);
    const last = clusters.at(-1);
    if (last && last.seasonId === record.seasonId && last.sourceDate === sourceDate) last.observations.push(record);
    else clusters.push({ seasonId: record.seasonId, sourceDate, observations: [record] });
  }
  return clusters;
}

/** Resample whole clusters, retaining the original cluster count in EACH season. */
export function resampleSeasonClusters(
  strata: readonly (readonly DateCluster[])[],
  random: () => number,
): readonly DateCluster[] {
  const sample: DateCluster[] = [];
  for (const clusters of strata) {
    for (let i = 0; i < clusters.length; i++) {
      const draw = random();
      if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError("Random draws must be in [0, 1).");
      sample.push(clusters[Math.floor(draw * clusters.length)]);
    }
  }
  return sample;
}

/** Mulberry32: local uint32 state, with no global randomness or dependency. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear interpolation between adjacent order statistics, at (n - 1) * p. */
function percentile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function bootstrapPairedAdvantages(
  records: readonly PairedObservation[],
  config: BootstrapConfig = {},
): BootstrapResult {
  const samples = config.samples === undefined ? DEFAULT_BOOTSTRAP_CONFIG.samples : config.samples;
  const seed = config.seed === undefined ? DEFAULT_BOOTSTRAP_CONFIG.seed : config.seed;
  const confidenceLevel = config.confidenceLevel === undefined ? DEFAULT_BOOTSTRAP_CONFIG.confidenceLevel : config.confidenceLevel;
  if (!Number.isSafeInteger(samples) || samples < 1) throw new RangeError("Bootstrap samples must be a positive safe integer.");
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("Bootstrap seed must be a uint32 integer.");
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new RangeError("Bootstrap confidence level must be between 0 and 1, exclusive.");
  }
  const clusters = buildDateClusters(records);
  const bySeason = new Map<string, DateCluster[]>();
  for (const cluster of clusters) {
    const season = bySeason.get(cluster.seasonId) ?? [];
    season.push(cluster);
    bySeason.set(cluster.seasonId, season);
  }
  const strata = [...bySeason.values()];
  const metadata = {
    method: "season-stratified date-cluster paired percentile bootstrap" as const,
    samples, seed, confidenceLevel,
    evaluatedMatches: records.length,
    dateClusters: clusters.length,
    strata: [...bySeason].map(([seasonId, group]) => ({ seasonId, dateClusters: group.length,
      evaluatedMatches: group.reduce((count, cluster) => count + cluster.observations.length, 0) })),
  };
  if (!records.length) {
    const unavailable = { observedMean: null, lowerBound: null, upperBound: null };
    return { ...metadata, vsLeagueBaseRate: { ...unavailable }, vsLeaguePoisson: { ...unavailable } };
  }
  // Cache sums per cluster; paired comparisons share every resampling draw.
  const totals = new Map(clusters.map((cluster) => [cluster, {
    count: cluster.observations.length,
    base: cluster.observations.reduce((sum, r) => sum + r.leagueBaseRateBrierScore - r.brierScore, 0),
    poisson: cluster.observations.reduce((sum, r) => sum + r.leaguePoissonBrierScore - r.brierScore, 0),
  }]));
  const mean = (sample: readonly DateCluster[]) => {
    let base = 0, poisson = 0, count = 0;
    for (const cluster of sample) {
      const total = totals.get(cluster)!;
      base += total.base;
      poisson += total.poisson;
      count += total.count;
    }
    // Match-weighted mean: resampled clusters need not have equal sizes.
    return { base: base / count, poisson: poisson / count };
  };
  const observed = mean(clusters);
  const random = seededRandom(seed);
  const baseSamples: number[] = [], poissonSamples: number[] = [];
  for (let i = 0; i < samples; i++) {
    const replicate = mean(resampleSeasonClusters(strata, random));
    baseSamples.push(replicate.base);
    poissonSamples.push(replicate.poisson);
  }
  const tail = (1 - confidenceLevel) / 2;
  const interval = (values: number[], observedMean: number): AdvantageInterval => {
    values.sort((a, b) => a - b);
    return { observedMean, lowerBound: percentile(values, tail), upperBound: percentile(values, 1 - tail) };
  };
  return { ...metadata, vsLeagueBaseRate: interval(baseSamples, observed.base), vsLeaguePoisson: interval(poissonSamples, observed.poisson) };
}
