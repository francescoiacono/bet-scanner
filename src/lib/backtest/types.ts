import type { FootballFixture, LeagueAverages, MatchPrediction } from "../football/types";

export type MatchOutcome = "HOME" | "DRAW" | "AWAY";

export interface PlayedMatch extends FootballFixture {
  readonly kickoffAt: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
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
