import { summarizeBacktest } from "../backtest/metrics";
import type { HistoricalSeason } from "../backtest/types";
import { EPL_SEASON_IDS, EXTERNAL_EPL_SEASON_IDS, validateHistoricalSeason, type HistoricalDataset } from "../data/openfootball";
import { runPairedBacktest } from "./run-paired-backtest";
import { bootstrapModelComparison, compareHistoryDepth, compareOutcomes, orderComparisonRecords, summarizeModels } from "./summaries";
import type { ComparisonFitAudit, ComparisonRecord, DatasetComparison } from "./types";

/** Dataset isolation is structural, not a label applied to one pooled report. */
export function buildDatasetComparison(seasons: readonly HistoricalSeason[], dataset: HistoricalDataset,
  progress?: (seasonId: string, successfulFits: number) => void): DatasetComparison {
  if (dataset !== "DEVELOPMENT" && dataset !== "EXTERNAL_VALIDATION") throw new RangeError("Unknown comparison dataset.");
  const selected = dataset === "DEVELOPMENT" ? EPL_SEASON_IDS : EXTERNAL_EPL_SEASON_IDS;
  if (seasons.length !== selected.length || new Set(seasons.map((season) => season.id)).size !== selected.length
    || selected.some((id) => !seasons.some((season) => season.id === id))) throw new RangeError(`Comparison requires exactly the selected ${dataset} seasons.`);
  for (const season of seasons) validateHistoricalSeason(season);
  const records: ComparisonRecord[] = [], fits: ComparisonFitAudit[] = [];
  const summaries: DatasetComparison["seasons"][number][] = [];
  let historicalMatches = 0, warmUpSkips = 0;
  for (const season of [...seasons].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    // A fresh call starts empty; no fit or parameters cross this boundary.
    const result = runPairedBacktest(season.matches);
    const prefix = `${dataset}/${season.id}/`;
    fits.push(...result.fits.map((audit) => ({ ...audit, id: prefix + audit.id, seasonId: season.id, dataset })));
    records.push(...result.records.map((record) => ({ ...record, fitId: prefix + record.fitId, seasonId: season.id, dataset })));
    historicalMatches += season.matches.length; warmUpSkips += result.baseline.summary.skippedMatches;
    summaries.push({ seasonId: season.id, summary: summarizeModels(result.records, season.matches.length, result.baseline.summary.skippedMatches),
      finalRho: result.fits.at(-1)?.fit.rho ?? null });
    progress?.(season.id, result.fits.length);
  }
  const ordered = orderComparisonRecords(records);
  const rho = fits.map((audit) => audit.fit.rho).sort((a, b) => a - b);
  const home = fits.map((audit) => audit.fit.homeAdvantage);
  const median = rho.length ? (rho[Math.floor((rho.length - 1) / 2)] + rho[Math.floor(rho.length / 2)]) / 2 : null;
  return { dataset, seasonIds: summaries.map((season) => season.seasonId), summary: summarizeModels(ordered, historicalMatches, warmUpSkips),
    baselineSummary: summarizeBacktest(ordered, historicalMatches, warmUpSkips), seasons: summaries,
    bootstrap: bootstrapModelComparison(ordered), outcomes: compareOutcomes(ordered), historyDepth: compareHistoryDepth(ordered),
    fitDiagnostics: { successfulFits: fits.length, failures: 0, rhoMinimum: rho[0] ?? null, rhoMaximum: rho.at(-1) ?? null, rhoMedian: median,
      nearRhoBoundaryFits: rho.filter((value) => Math.abs(value) >= 0.199).length,
      homeAdvantageMinimum: home.length ? Math.min(...home) : null, homeAdvantageMaximum: home.length ? Math.max(...home) : null,
      maximumMeanGradientNorm: fits.length ? Math.max(...fits.map((audit) => audit.fit.meanGradientNorm)) : null }, fits, records: ordered };
}
