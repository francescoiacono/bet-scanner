import { MODEL_VERSION, predictMatch } from "../football/predict-match";
import type { LeagueAverages, OutcomeProbabilities } from "../football/types";
import {
  calculateHistoricalLeagueAverages, DEFAULT_MINIMUM_VENUE_MATCHES,
  deriveTeamProfiles, hasEnoughHistory, kickoffTimestamp,
  validateMinimumVenueMatches, validatePlayedMatches,
} from "./history";
import { actualOutcome, calculateBrierScore, summarizeBacktest, topPick, UNIFORM_PROBABILITIES } from "./metrics";
import { calculateLeagueBaseRate } from "./league-base-rate";
import type { BacktestConfig, BacktestPrediction, BacktestResult, PlayedMatch, SkippedMatch } from "./types";

/** Predict the entire kickoff batch before admitting any of its results. */
export function runBacktest(
  playedMatches: readonly PlayedMatch[],
  config: BacktestConfig = {},
): BacktestResult {
  const minimumVenueMatches = config.minimumVenueMatches === undefined
    ? DEFAULT_MINIMUM_VENUE_MATCHES : config.minimumVenueMatches;
  validateMinimumVenueMatches(minimumVenueMatches);
  validatePlayedMatches(playedMatches);
  const ordered = playedMatches.map((match) => ({ match, timestamp: kickoffTimestamp(match.kickoffAt) }))
    .sort((a, b) => a.timestamp - b.timestamp || (a.match.id < b.match.id ? -1 : a.match.id > b.match.id ? 1 : 0));
  const history: PlayedMatch[] = [];
  const predictions: BacktestPrediction[] = [];
  const skippedMatches: SkippedMatch[] = [];

  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].timestamp === ordered[start].timestamp) end++;
    const batch = ordered.slice(start, end);
    const profiles = new Map(deriveTeamProfiles(history).map((profile) => [profile.team, profile]));
    let leagueAverages: LeagueAverages | undefined;
    let leagueBaseRate: OutcomeProbabilities | undefined;

    for (const { match } of batch) {
      const home = profiles.get(match.homeTeam);
      const away = profiles.get(match.awayTeam);
      if (!home || !away || !hasEnoughHistory(home, minimumVenueMatches) || !hasEnoughHistory(away, minimumVenueMatches)) {
        skippedMatches.push({ ...match, trainingMatchCount: history.length, reason: "INSUFFICIENT_HISTORY" });
        continue;
      }
      leagueAverages ??= calculateHistoricalLeagueAverages(history);
      leagueBaseRate ??= calculateLeagueBaseRate(history);
      // The model receives fixture identity, never this fixture's final score.
      const fixture = { id: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam };
      const prediction = predictMatch(fixture, home, away, leagueAverages);
      const outcome = actualOutcome(match.homeGoals, match.awayGoals);
      const pick = topPick(prediction);
      predictions.push({
        ...match,
        trainingMatchCount: history.length,
        latestTrainingKickoffAt: new Date(ordered[start - 1].timestamp).toISOString(),
        leagueAverages: { ...leagueAverages },
        prediction,
        actualOutcome: outcome,
        brierScore: calculateBrierScore(prediction, outcome),
        uniformBrierScore: calculateBrierScore(UNIFORM_PROBABILITIES, outcome),
        leagueBaseRateProbabilities: { ...leagueBaseRate },
        leagueBaseRateBrierScore: calculateBrierScore(leagueBaseRate, outcome),
        topSelection: pick.selection,
        topConfidence: pick.confidence,
        topSelectionCorrect: pick.selection === outcome,
      });
    }

    // Mandatory causal barrier: even unready fixtures become history only here.
    history.push(...batch.map(({ match }) => match));
    start = end;
  }

  return {
    modelVersion: MODEL_VERSION,
    minimumVenueMatches,
    predictions,
    skippedMatches,
    summary: summarizeBacktest(predictions, playedMatches.length, skippedMatches.length),
  };
}
