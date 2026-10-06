import type { VenueHistory } from "../backtest/types";
import type { HistoryDepthSummary, HistoryObservation } from "./types";

export const HISTORY_DEPTH_BUCKETS = Object.freeze([
  { label: "2–3", minimum: 2, maximum: 3 },
  { label: "4–6", minimum: 4, maximum: 6 },
  { label: "7–10", minimum: 7, maximum: 10 },
  { label: "11–15", minimum: 11, maximum: 15 },
  { label: "16+", minimum: 16, maximum: Infinity },
] as const);

export function calculateHistoryDepth(history: VenueHistory): number {
  const counts = [history.homeTeamHomeMatches, history.homeTeamAwayMatches, history.awayTeamHomeMatches, history.awayTeamAwayMatches];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new RangeError("Venue history counts must be non-negative safe integers.");
  }
  return Math.min(...counts);
}

/** Fixed V0.5 slices require the unchanged minimum-two-appearances warm-up. */
export function historyDepthBucketIndex(depth: number): number {
  if (!Number.isSafeInteger(depth) || depth < 2) throw new RangeError("History-depth diagnostics require depth >= 2.");
  return HISTORY_DEPTH_BUCKETS.findIndex((bucket) => depth >= bucket.minimum && depth <= bucket.maximum);
}

export function summarizeHistoryDepth(records: readonly HistoryObservation[]): readonly HistoryDepthSummary[] {
  const groups: HistoryObservation[][] = HISTORY_DEPTH_BUCKETS.map(() => []);
  for (const record of records) {
    if (calculateHistoryDepth(record.venueHistory) !== record.historyDepth) {
      throw new RangeError("Recorded history depth must equal the minimum venue count.");
    }
    groups[historyDepthBucketIndex(record.historyDepth)].push(record);
  }
  return groups.map((group, index) => {
    const mean = (value: (record: HistoryObservation) => number) => group.length
      ? group.reduce((sum, record) => sum + value(record), 0) / group.length : null;
    return {
      label: HISTORY_DEPTH_BUCKETS[index].label,
      evaluatedMatches: group.length,
      modelBrier: mean((record) => record.brierScore),
      leagueBaseRateBrier: mean((record) => record.leagueBaseRateBrierScore),
      advantageVsLeagueBaseRate: mean((record) => record.leagueBaseRateBrierScore - record.brierScore),
      leaguePoissonBrier: mean((record) => record.leaguePoissonBrierScore),
      advantageVsLeaguePoisson: mean((record) => record.leaguePoissonBrierScore - record.brierScore),
      topPickAccuracy: mean((record) => Number(record.topSelectionCorrect)),
    };
  });
}
