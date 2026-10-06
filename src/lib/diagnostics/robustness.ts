import { summarizeBacktest } from "../backtest/metrics";
import type { BacktestSummary, MultiSeasonBacktestResult, SeasonPrediction } from "../backtest/types";
import { summarizeHistoryDepth } from "./history-depth";
import { diagnoseOutcomes } from "./outcome-calibration";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const canonicalRecords = (records: readonly SeasonPrediction[]) => [...records]
  .sort((a, b) => compare(a.seasonId, b.seasonId) || compare(a.kickoffAt, b.kickoffAt) || compare(a.id, b.id));

/** Pool existing individual evaluations; no prediction is rerun or fitted. */
export function leaveOneSeasonOut(result: MultiSeasonBacktestResult) {
  const records = canonicalRecords(result.predictions);
  return [...result.seasonSummaries].sort((a, b) => compare(a.seasonId, b.seasonId)).map((excluded) => {
    const includedSeasons = result.seasonSummaries.filter((season) => season.seasonId !== excluded.seasonId);
    const remaining = records.filter((record) => record.seasonId !== excluded.seasonId);
    return {
      excludedSeason: excluded.seasonId,
      includedSeasons: includedSeasons.map((season) => season.seasonId).sort(compare),
      summary: summarizeBacktest(remaining,
        includedSeasons.reduce((sum, season) => sum + season.summary.totalHistoricalMatches, 0),
        includedSeasons.reduce((sum, season) => sum + season.summary.skippedMatches, 0)),
    };
  });
}

/** Lowest skill vs base rate; exact ties choose the lexicographically first season ID. */
export function diagnoseWeakestSeason(result: MultiSeasonBacktestResult) {
  const records = canonicalRecords(result.predictions);
  let weakest: { seasonId: string; summary: BacktestSummary; records: readonly SeasonPrediction[] } | null = null;
  for (const season of [...result.seasonSummaries].sort((a, b) => compare(a.seasonId, b.seasonId))) {
    const selected = records.filter((record) => record.seasonId === season.seasonId);
    const summary = summarizeBacktest(selected, season.summary.totalHistoricalMatches, season.summary.skippedMatches);
    if (summary.brierSkillVsLeagueBaseRate === null) continue;
    if (weakest === null || summary.brierSkillVsLeagueBaseRate < weakest.summary.brierSkillVsLeagueBaseRate!) {
      weakest = { seasonId: season.seasonId, summary, records: selected };
    }
  }
  return weakest === null ? null : {
    seasonId: weakest.seasonId,
    summary: weakest.summary,
    historyDepth: summarizeHistoryDepth(weakest.records),
    outcomes: diagnoseOutcomes(weakest.records),
  };
}
