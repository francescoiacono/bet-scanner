import { calculateBrierSkill, topPick } from "../backtest/metrics";
import { bootstrapPairedAdvantages } from "../diagnostics/bootstrap";
import { HISTORY_DEPTH_BUCKETS, historyDepthBucketIndex } from "../diagnostics/history-depth";
import { calculateBrierComponents } from "../diagnostics/outcome-calibration";
import type { ComparisonHistoryBucket, ComparisonOutcome, ComparisonRecord, ComparisonSummary, PairedPrediction } from "./types";

export const COMPARISON_BOOTSTRAP = Object.freeze({ samples: 5000, seed: 202606, confidenceLevel: 0.95 });
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const orderComparisonRecords = (records: readonly ComparisonRecord[]) => [...records]
  .sort((a, b) => lexical(a.seasonId, b.seasonId) || lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id));

export function pairedModelAdvantage(poissonBrier: number, dixonColesBrier: number): number {
  if ([poissonBrier, dixonColesBrier].some((value) => !Number.isFinite(value) || value < 0 || value > 2)) throw new RangeError("Paired Brier scores must be in [0, 2].");
  return poissonBrier - dixonColesBrier;
}

export function summarizeModels(records: readonly PairedPrediction[], historicalMatches: number, warmUpSkips: number): ComparisonSummary {
  const mean = (value: (record: PairedPrediction) => number) => records.length ? records.reduce((sum, record) => sum + value(record), 0) / records.length : null;
  const poissonV1Brier = mean((record) => record.brierScore), dixonColesBrier = mean((record) => record.dixonColesBrierScore);
  const leaguePoissonBrier = mean((record) => record.leaguePoissonBrierScore);
  const skill = (model: number | null) => model === null || leaguePoissonBrier === null || leaguePoissonBrier === 0 ? null : calculateBrierSkill(model, leaguePoissonBrier);
  return { historicalMatches, evaluatedMatches: records.length, warmUpSkips, poissonV1Brier, dixonColesBrier,
    pairedAdvantage: mean((record) => pairedModelAdvantage(record.brierScore, record.dixonColesBrierScore)),
    leaguePoissonBrier, leagueBaseRateBrier: mean((record) => record.leagueBaseRateBrierScore),
    poissonV1SkillVsLeaguePoisson: skill(poissonV1Brier), dixonColesSkillVsLeaguePoisson: skill(dixonColesBrier),
    poissonV1Accuracy: mean((record) => Number(record.topSelectionCorrect)),
    dixonColesAccuracy: mean((record) => Number(topPick(record.dixonColesPrediction).selection === record.actualOutcome)) };
}

export function compareHistoryDepth(records: readonly PairedPrediction[]): readonly ComparisonHistoryBucket[] {
  return HISTORY_DEPTH_BUCKETS.map((bucket, index) => {
    const group = records.filter((record) => historyDepthBucketIndex(record.historyDepth) === index);
    const summary = summarizeModels(group, group.length, 0);
    return { label: bucket.label, matches: group.length, poissonV1Brier: summary.poissonV1Brier,
      dixonColesBrier: summary.dixonColesBrier, pairedAdvantage: summary.pairedAdvantage };
  });
}

export function compareOutcomes(records: readonly PairedPrediction[]): readonly ComparisonOutcome[] {
  const scores = records.map((record) => ({ poisson: calculateBrierComponents(record.prediction, record.actualOutcome),
    dixonColes: calculateBrierComponents(record.dixonColesPrediction, record.actualOutcome) }));
  return (["HOME", "DRAW", "AWAY"] as const).map((outcome) => ({ outcome,
    poissonV1Component: scores.length ? scores.reduce((sum, score) => sum + score.poisson[outcome], 0) / scores.length : null,
    dixonColesComponent: scores.length ? scores.reduce((sum, score) => sum + score.dixonColes[outcome], 0) / scores.length : null }));
}

export function bootstrapModelComparison(records: readonly ComparisonRecord[]) {
  if (new Set(records.map((record) => record.dataset)).size > 1) throw new RangeError("Development and external-validation bootstrap samples must never mix.");
  // Adapt to the unchanged V0.5 paired engine: DC is the model; Poisson is its
  // comparison forecast. Both slots carry the SAME baseline, not new benchmarks.
  const result = bootstrapPairedAdvantages(records.map((record) => ({
    id: record.id, seasonId: record.seasonId, kickoffAt: record.kickoffAt, brierScore: record.dixonColesBrierScore,
    leagueBaseRateBrierScore: record.brierScore, leaguePoissonBrierScore: record.brierScore,
  })), COMPARISON_BOOTSTRAP);
  return { samples: result.samples, seed: result.seed, confidenceLevel: result.confidenceLevel,
    method: result.method, dateClusters: result.dateClusters, interval: result.vsLeagueBaseRate };
}
