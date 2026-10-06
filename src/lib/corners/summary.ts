import { bootstrapPairedAdvantages } from "../diagnostics/bootstrap";
import { HISTORY_DEPTH_BUCKETS, historyDepthBucketIndex } from "../diagnostics/history-depth";
import type { AdvantageInterval } from "../diagnostics/types";
import { backtestCorners } from "./backtest";
import { CORNER_BOOTSTRAP, CORNER_NB_VERSION, CORNER_OVER_LINES, CORNER_POISSON_VERSION, lexical } from "./config";
import { selectedCornerSeasons, validateCornerSeason } from "./data";
import { binaryBrier, binaryCalibration, isOver } from "./metrics";
import type { CornerDataset, CornerFitAudit, CornerRecord, CornerSeason } from "./types";

const mean = <T>(rows: readonly T[], value: (row: T) => number): number | null => rows.length ? rows.reduce((sum, row) => sum + value(row), 0) / rows.length : null;
export function orderedCornerRecords(records: readonly CornerRecord[]) {
  if (new Set(records.map((r) => r.dataset)).size > 1) throw new RangeError("Development and external corner datasets must not mix.");
  return [...records].sort((a, b) => lexical(a.seasonId, b.seasonId) || lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id));
}
export function summarizeCornerRecords(input: readonly CornerRecord[], historicalMatches: number, warmUpSkips: number) {
  const rows = orderedCornerRecords(input);
  return { historicalMatches, evaluatedMatches: rows.length, warmUpSkips,
    poissonRPS: mean(rows, (r) => r.poissonRPS), negativeBinomialRPS: mean(rows, (r) => r.negativeBinomialRPS),
    pairedAdvantage: mean(rows, (r) => r.poissonRPS - r.negativeBinomialRPS),
    leaguePoissonRPS: mean(rows, (r) => r.leaguePoissonRPS), empiricalRPS: mean(rows, (r) => r.empiricalRPS),
    observedMeanTotal: mean(rows, (r) => r.actualTotal), poissonMeanTotal: mean(rows, (r) => r.poisson.expectedTotalCorners),
    negativeBinomialMeanTotal: mean(rows, (r) => r.negativeBinomial.expectedTotalCorners) };
}
export function bootstrapCornerAdvantage(records: readonly CornerRecord[]) {
  const rows = orderedCornerRecords(records);
  for (const row of rows) if ([row.poissonRPS, row.negativeBinomialRPS].some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw new RangeError("Corner RPS must be in [0, 1].");
  // Neutral adapter to the frozen resampler: slots hold NB/Poisson RPS.
  const result = bootstrapPairedAdvantages(rows.map((row) => ({ id: row.id, seasonId: row.seasonId, kickoffAt: row.kickoffAt,
    brierScore: row.negativeBinomialRPS, leagueBaseRateBrierScore: row.poissonRPS, leaguePoissonBrierScore: row.poissonRPS })), CORNER_BOOTSTRAP);
  return { method: result.method, samples: result.samples, seed: result.seed, confidenceLevel: result.confidenceLevel,
    evaluatedMatches: result.evaluatedMatches, dateClusters: result.dateClusters, strata: result.strata, interval: result.vsLeagueBaseRate };
}
export function preferredCornerModel(interval: AdvantageInterval): string {
  if (interval.lowerBound === null || interval.upperBound === null) return "NONE / INCONCLUSIVE";
  if (!Number.isFinite(interval.lowerBound) || !Number.isFinite(interval.upperBound) || interval.lowerBound > interval.upperBound) throw new RangeError("Invalid corner preference interval.");
  return interval.lowerBound > 0 ? CORNER_NB_VERSION : interval.upperBound < 0 ? CORNER_POISSON_VERSION : "NONE / INCONCLUSIVE";
}
export function summarizeCornerLines(input: readonly CornerRecord[]) {
  const rows = orderedCornerRecords(input);
  return CORNER_OVER_LINES.map((line, index) => {
    const poisson = binaryCalibration(rows.map((r) => ({ probability: r.poisson.overProbabilities[index], over: isOver(r.actualTotal, line) })));
    const nb = binaryCalibration(rows.map((r) => ({ probability: r.negativeBinomial.overProbabilities[index], over: isOver(r.actualTotal, line) })));
    return { line, evaluatedMatches: rows.length, observedOverFrequency: poisson.observedFrequency,
      poissonBrier: mean(rows, (r) => binaryBrier(r.poisson.overProbabilities[index], isOver(r.actualTotal, line))),
      negativeBinomialBrier: mean(rows, (r) => binaryBrier(r.negativeBinomial.overProbabilities[index], isOver(r.actualTotal, line))),
      leaguePoissonBrier: mean(rows, (r) => binaryBrier(r.leaguePoisson.overProbabilities[index], isOver(r.actualTotal, line))),
      empiricalBrier: mean(rows, (r) => binaryBrier(r.empirical.overProbabilities[index], isOver(r.actualTotal, line))),
      poissonMeanPredicted: poisson.meanPredictedProbability, negativeBinomialMeanPredicted: nb.meanPredictedProbability,
      poissonECE: poisson.ece, negativeBinomialECE: nb.ece, poissonCalibrationBins: poisson.bins, negativeBinomialCalibrationBins: nb.bins };
  });
}
export function summarizeCornerDepth(input: readonly CornerRecord[]) {
  const rows = orderedCornerRecords(input), groups: CornerRecord[][] = HISTORY_DEPTH_BUCKETS.map(() => []);
  for (const row of rows) groups[historyDepthBucketIndex(row.historyDepth)].push(row);
  return groups.map((group, i) => ({ label: HISTORY_DEPTH_BUCKETS[i].label, matches: group.length,
    poissonRPS: mean(group, (r) => r.poissonRPS), negativeBinomialRPS: mean(group, (r) => r.negativeBinomialRPS),
    pairedAdvantage: mean(group, (r) => r.poissonRPS - r.negativeBinomialRPS) }));
}
export function empiricalCornerDispersion(matches: readonly CornerSeason["matches"][number][]) {
  const meanTotal = mean(matches, (m) => m.homeCorners + m.awayCorners);
  // Descriptive population variance across ALL source matches, divisor N.
  const varianceTotal = meanTotal === null ? null : mean(matches, (m) => (m.homeCorners + m.awayCorners - meanTotal) ** 2);
  return { sourceMatches: matches.length, meanTotal, varianceTotal, varianceToMean: meanTotal && varianceTotal !== null ? varianceTotal / meanTotal : null, varianceConvention: "population variance; divisor N; all source matches" };
}
function summarizeCornerFits(fits: readonly CornerFitAudit[]) {
  const alpha = fits.map((f) => f.negativeBinomial.alpha!).sort((a, b) => a - b);
  const criteria = (model: "poisson" | "negativeBinomial") => ({ gradient: fits.filter((f) => f[model].convergenceCriterion === "GRADIENT_NORM").length,
    objective: fits.filter((f) => f[model].convergenceCriterion === "RELATIVE_OBJECTIVE").length, step: fits.filter((f) => f[model].convergenceCriterion === "STEP_TOLERANCE").length });
  return { successfulPoissonFits: fits.length, successfulNegativeBinomialFits: fits.length, failures: 0,
    alphaMinimum: alpha[0] ?? null, alphaMedian: alpha.length ? (alpha[Math.floor((alpha.length - 1) / 2)] + alpha[Math.floor(alpha.length / 2)]) / 2 : null,
    alphaMaximum: alpha.at(-1) ?? null,
    maximumPoissonMeanGradientNorm: fits.length ? Math.max(...fits.map((f) => f.poisson.meanGradientNorm)) : null,
    maximumNegativeBinomialMeanGradientNorm: fits.length ? Math.max(...fits.map((f) => f.negativeBinomial.meanGradientNorm)) : null,
    poissonConvergence: criteria("poisson"), negativeBinomialConvergence: criteria("negativeBinomial") };
}
export function evaluateCornerDataset(seasons: readonly CornerSeason[], dataset: CornerDataset, progress?: (id: string, fits: number) => void) {
  const selected = selectedCornerSeasons(dataset);
  if (seasons.length !== selected.length || new Set(seasons.map((s) => s.id)).size !== selected.length || selected.some((id) => !seasons.some((s) => s.id === id))) throw new RangeError(`Corner comparison requires exactly the selected ${dataset} seasons.`);
  seasons.forEach(validateCornerSeason);
  const orderedSeasons = [...seasons].sort((a, b) => lexical(a.id, b.id));
  const records: CornerRecord[] = [], fits: CornerFitAudit[] = [], summaries: { seasonId: string; summary: ReturnType<typeof summarizeCornerRecords>; finalAlpha: number | null }[] = [];
  let historicalMatches = 0, skipped = 0;
  for (const season of orderedSeasons) {
    const result = backtestCorners(season.matches, season.id, dataset);
    records.push(...result.records); fits.push(...result.fits); historicalMatches += result.historicalMatches; skipped += result.skippedIds.length;
    summaries.push({ seasonId: season.id, summary: summarizeCornerRecords(result.records, result.historicalMatches, result.skippedIds.length), finalAlpha: result.fits.at(-1)?.negativeBinomial.alpha ?? null });
    progress?.(season.id, result.fits.length);
  }
  const ordered = orderedCornerRecords(records);
  return { publicSummary: { dataset, seasonIds: summaries.map((s) => s.seasonId), summary: summarizeCornerRecords(ordered, historicalMatches, skipped),
    bootstrap: bootstrapCornerAdvantage(ordered), seasons: summaries, lines: summarizeCornerLines(ordered), historyDepth: summarizeCornerDepth(ordered),
    dispersion: empiricalCornerDispersion(orderedSeasons.flatMap((s) => [...s.matches].sort((a, b) => lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id)))), fitDiagnostics: summarizeCornerFits(fits) },
    privateAudit: { dataset, records: ordered, fits } };
}
export type CornerDatasetSummary = ReturnType<typeof evaluateCornerDataset>["publicSummary"];
