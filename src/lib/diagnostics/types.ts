import type { BacktestPrediction, MatchOutcome, VenueHistory } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";

export interface PairedObservation {
  readonly id: string;
  readonly seasonId: string;
  readonly kickoffAt: string;
  readonly brierScore: number;
  readonly leagueBaseRateBrierScore: number;
  readonly leaguePoissonBrierScore: number;
}

export interface BootstrapConfig {
  readonly samples?: number;
  readonly seed?: number;
  readonly confidenceLevel?: number;
}

export interface AdvantageInterval {
  readonly observedMean: number | null;
  readonly lowerBound: number | null;
  readonly upperBound: number | null;
}

export interface BootstrapResult {
  readonly method: "season-stratified date-cluster paired percentile bootstrap";
  readonly samples: number;
  readonly seed: number;
  readonly confidenceLevel: number;
  readonly evaluatedMatches: number;
  readonly dateClusters: number;
  readonly strata: readonly { readonly seasonId: string; readonly dateClusters: number; readonly evaluatedMatches: number }[];
  readonly vsLeagueBaseRate: AdvantageInterval;
  readonly vsLeaguePoisson: AdvantageInterval;
}

export interface DateCluster {
  readonly seasonId: string;
  readonly sourceDate: string;
  readonly observations: readonly PairedObservation[];
}

export interface HistoryObservation extends Pick<BacktestPrediction,
  "brierScore" | "leagueBaseRateBrierScore" | "leaguePoissonBrierScore" | "topSelectionCorrect"> {
  readonly venueHistory: VenueHistory;
  readonly historyDepth: number;
}

export interface HistoryDepthSummary {
  readonly label: string;
  readonly evaluatedMatches: number;
  readonly modelBrier: number | null;
  readonly leagueBaseRateBrier: number | null;
  readonly advantageVsLeagueBaseRate: number | null;
  readonly leaguePoissonBrier: number | null;
  readonly advantageVsLeaguePoisson: number | null;
  readonly topPickAccuracy: number | null;
}

export interface OutcomeObservation {
  readonly prediction: OutcomeProbabilities;
  readonly leagueBaseRateProbabilities: OutcomeProbabilities;
  readonly leaguePoissonPrediction: OutcomeProbabilities;
  readonly actualOutcome: MatchOutcome;
}

export interface OutcomeCalibrationBucket {
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly count: number;
  readonly meanPredictedProbability: number | null;
  readonly observedFrequency: number | null;
}

export interface OutcomeDiagnostic {
  readonly outcome: MatchOutcome;
  readonly evaluatedMatches: number;
  readonly meanPredictedProbability: number | null;
  readonly observedFrequency: number | null;
  readonly predictionGap: number | null;
  readonly calibrationECE: number | null;
  readonly modelBrierComponent: number | null;
  readonly leagueBaseRateBrierComponent: number | null;
  readonly leaguePoissonBrierComponent: number | null;
  readonly calibrationBuckets: readonly OutcomeCalibrationBucket[];
}
