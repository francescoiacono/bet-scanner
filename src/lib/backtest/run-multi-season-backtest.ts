import { validateHistoricalSeason } from "../data/openfootball";
import { MODEL_VERSION } from "../football/predict-match";
import { DEFAULT_MINIMUM_VENUE_MATCHES, validateMinimumVenueMatches } from "./history";
import { summarizeBacktest } from "./metrics";
import { runBacktest } from "./run-backtest";
import type { BacktestConfig, HistoricalSeason, MultiSeasonBacktestResult, SeasonPrediction, SeasonSkip, SeasonSummary } from "./types";

/** Each call to runBacktest starts from empty history; no cross-season state exists. */
export function runMultiSeasonBacktest(
  seasons: readonly HistoricalSeason[],
  config: BacktestConfig = {},
): MultiSeasonBacktestResult {
  const minimumVenueMatches = config.minimumVenueMatches === undefined
    ? DEFAULT_MINIMUM_VENUE_MATCHES : config.minimumVenueMatches;
  validateMinimumVenueMatches(minimumVenueMatches);
  const ids = new Set<string>();
  const matchIds = new Set<string>();
  // Validate all seasons first, so malformed/partial data never yields a partial report.
  for (const season of seasons) {
    if (ids.has(season.id)) throw new RangeError(`Duplicate historical season: ${season.id}.`);
    ids.add(season.id);
    validateHistoricalSeason(season);
    for (const match of season.matches) {
      if (matchIds.has(match.id)) throw new RangeError(`Duplicate normalized match ID: ${match.id}.`);
      matchIds.add(match.id);
    }
  }
  const predictions: SeasonPrediction[] = [];
  const skippedMatches: SeasonSkip[] = [];
  const seasonSummaries: SeasonSummary[] = [];
  for (const season of [...seasons].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const result = runBacktest(season.matches, { minimumVenueMatches });
    seasonSummaries.push({ seasonId: season.id, league: season.league, summary: result.summary });
    predictions.push(...result.predictions.map((record) => ({ ...record, seasonId: season.id })));
    skippedMatches.push(...result.skippedMatches.map((record) => ({ ...record, seasonId: season.id })));
  }
  return {
    modelVersion: MODEL_VERSION,
    minimumVenueMatches,
    seasonSummaries,
    predictions,
    skippedMatches,
    // Score the combined match records directly, never average season means.
    summary: summarizeBacktest(predictions, seasons.reduce((total, season) => total + season.matches.length, 0), skippedMatches.length),
  };
}
