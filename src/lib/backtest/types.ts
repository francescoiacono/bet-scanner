import type { FootballFixture, LeagueAverages, MatchPrediction, OutcomeProbabilities } from "../football/types";

export type MatchOutcome = "HOME" | "DRAW" | "AWAY";

export interface PlayedMatch extends FootballFixture {
  readonly kickoffAt: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
}

export interface HistoricalSeason {
  readonly id: string;
  readonly league: "EPL";
  readonly matches: readonly PlayedMatch[];
}

export interface BacktestConfig {
  readonly minimumVenueMatches?: number;
}

export interface BacktestPrediction extends PlayedMatch {
  readonly trainingMatchCount: number;
  readonly latestTrainingKickoffAt: string;
  readonly leagueAverages: LeagueAverages;
  readonly prediction: MatchPrediction;
  readonly actualOutcome: MatchOutcome;
  readonly brierScore: number;
  readonly uniformBrierScore: number;
  readonly leagueBaseRateProbabilities: OutcomeProbabilities;
  readonly leagueBaseRateBrierScore: number;
  readonly topSelection: MatchOutcome;
  readonly topConfidence: number;
  readonly topSelectionCorrect: boolean;
}

export interface SkippedMatch extends PlayedMatch {
  readonly trainingMatchCount: number;
  readonly reason: "INSUFFICIENT_HISTORY";
}

export interface CalibrationBucket {
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly count: number;
  readonly meanConfidence: number | null;
  readonly observedAccuracy: number | null;
}

export interface BacktestSummary {
  readonly totalHistoricalMatches: number;
  readonly evaluatedMatches: number;
  readonly skippedMatches: number;
  readonly meanBrierScore: number | null;
  readonly uniformBenchmarkBrier: number | null;
  readonly brierSkillScore: number | null;
  readonly leagueBaseRateBrier: number | null;
  readonly brierSkillVsLeagueBaseRate: number | null;
  readonly topPickCorrectCount: number;
  readonly topPickAccuracy: number | null;
  readonly topPickCalibrationECE: number | null;
  readonly calibrationBuckets: readonly CalibrationBucket[];
}

export interface BacktestResult {
  readonly modelVersion: string;
  readonly minimumVenueMatches: number;
  readonly predictions: readonly BacktestPrediction[];
  readonly skippedMatches: readonly SkippedMatch[];
  readonly summary: BacktestSummary;
}

export interface SeasonPrediction extends BacktestPrediction {
  readonly seasonId: string;
}

export interface SeasonSkip extends SkippedMatch {
  readonly seasonId: string;
}

export interface SeasonSummary {
  readonly seasonId: string;
  readonly league: "EPL";
  readonly summary: BacktestSummary;
}

export interface MultiSeasonBacktestResult {
  readonly modelVersion: string;
  readonly minimumVenueMatches: number;
  readonly seasonSummaries: readonly SeasonSummary[];
  readonly predictions: readonly SeasonPrediction[];
  readonly skippedMatches: readonly SeasonSkip[];
  readonly summary: BacktestSummary;
}
