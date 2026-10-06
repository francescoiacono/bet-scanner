import type { VenueHistory } from "../backtest/types";

export type CornerDataset = "DEVELOPMENT" | "EXTERNAL_VALIDATION";
export type CornerModelVersion = "corner-poisson-v1" | "corner-negative-binomial-v1";
export interface PlayedCornerMatch {
  readonly id: string;
  /** Normalized source-date ordering key, not an actual kickoff time. */
  readonly kickoffAt: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeCorners: number;
  readonly awayCorners: number;
}
export interface CornerSeason { readonly id: string; readonly matches: readonly PlayedCornerMatch[] }
export interface CornerTeamRating { readonly team: string; readonly cornerAttack: number; readonly cornerDefenceWeakness: number }
export interface CornerParameters {
  readonly teams: readonly CornerTeamRating[];
  readonly homeCornerAdvantage: number;
  readonly alpha: number | null;
}
export interface CornerFit extends CornerParameters {
  readonly modelVersion: CornerModelVersion;
  readonly trainingMatchCount: number;
  readonly teamCount: number;
  readonly converged: true;
  readonly iterations: number;
  readonly evaluations: number;
  readonly rejectedTrials: number;
  readonly negativeLogLikelihood: number;
  readonly meanGradientNorm: number;
  readonly convergenceCriterion: "GRADIENT_NORM" | "RELATIVE_OBJECTIVE" | "STEP_TOLERANCE";
  readonly termination: string;
  readonly rawParameters: readonly number[];
}
export interface CornerPrediction {
  readonly fixtureId: string;
  readonly expectedHomeCorners: number;
  readonly expectedAwayCorners: number;
  readonly expectedTotalCorners: number;
  readonly modelVersion: CornerModelVersion | "league-average-poisson-corners" | "league-empirical-corners";
  readonly alpha: number | null;
  /** 0..30, then ALL remaining probability in 31+. */
  readonly totalProbabilities: readonly number[];
  readonly overProbabilities: readonly number[];
}
/** These detailed rows and fits are private; never import them in React. */
export interface CornerRecord {
  readonly id: string;
  readonly seasonId: string;
  readonly dataset: CornerDataset;
  readonly kickoffAt: string;
  readonly actualTotal: number;
  readonly trainingMatchCount: number;
  readonly venueHistory: VenueHistory;
  readonly historyDepth: number;
  readonly fitId: string;
  readonly poisson: CornerPrediction;
  readonly negativeBinomial: CornerPrediction;
  readonly leaguePoisson: CornerPrediction;
  readonly empirical: CornerPrediction;
  readonly poissonRPS: number;
  readonly negativeBinomialRPS: number;
  readonly leaguePoissonRPS: number;
  readonly empiricalRPS: number;
}
export interface CornerFitAudit {
  readonly id: string;
  readonly kickoffAt: string;
  readonly latestTrainingKickoffAt: string;
  readonly poisson: CornerFit;
  readonly negativeBinomial: CornerFit;
}
