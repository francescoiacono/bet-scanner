import type { BacktestPrediction, BacktestSummary } from "../backtest/types";
import type { HistoricalDataset } from "../data/openfootball";
import type { AdvantageInterval, OutcomeDiagnostic } from "../diagnostics/types";
import type { DixonColesFit, DixonColesPrediction } from "../dixon-coles/types";

export interface PairedPrediction extends BacktestPrediction {
  readonly dixonColesPrediction: DixonColesPrediction;
  readonly dixonColesBrierScore: number;
  readonly fitId: string;
}
export interface ComparisonRecord extends PairedPrediction {
  readonly seasonId: string;
  readonly dataset: HistoricalDataset;
}
export interface FitAudit {
  readonly id: string;
  readonly kickoffAt: string;
  readonly latestTrainingKickoffAt: string;
  readonly fit: DixonColesFit;
}
export interface ComparisonFitAudit extends FitAudit {
  readonly seasonId: string;
  readonly dataset: HistoricalDataset;
}
export interface ComparisonSummary {
  readonly historicalMatches: number;
  readonly evaluatedMatches: number;
  readonly warmUpSkips: number;
  readonly poissonV1Brier: number | null;
  readonly dixonColesBrier: number | null;
  readonly pairedAdvantage: number | null;
  readonly leaguePoissonBrier: number | null;
  readonly leagueBaseRateBrier: number | null;
  readonly poissonV1SkillVsLeaguePoisson: number | null;
  readonly dixonColesSkillVsLeaguePoisson: number | null;
  readonly poissonV1Accuracy: number | null;
  readonly dixonColesAccuracy: number | null;
}
export interface ComparisonHistoryBucket {
  readonly label: string;
  readonly matches: number;
  readonly poissonV1Brier: number | null;
  readonly dixonColesBrier: number | null;
  readonly pairedAdvantage: number | null;
}
export interface ComparisonOutcome {
  readonly outcome: OutcomeDiagnostic["outcome"];
  readonly poissonV1Component: number | null;
  readonly dixonColesComponent: number | null;
}
export interface DatasetComparison {
  readonly dataset: HistoricalDataset;
  readonly seasonIds: readonly string[];
  readonly summary: ComparisonSummary;
  readonly baselineSummary: BacktestSummary;
  readonly seasons: readonly { readonly seasonId: string; readonly summary: ComparisonSummary; readonly finalRho: number | null }[];
  readonly bootstrap: { readonly samples: number; readonly seed: number; readonly confidenceLevel: number; readonly dateClusters: number; readonly method: string; readonly interval: AdvantageInterval };
  readonly outcomes: readonly ComparisonOutcome[];
  readonly historyDepth: readonly ComparisonHistoryBucket[];
  readonly fitDiagnostics: { readonly successfulFits: number; readonly failures: 0; readonly rhoMinimum: number | null; readonly rhoMaximum: number | null;
    readonly rhoMedian: number | null; readonly nearRhoBoundaryFits: number; readonly homeAdvantageMinimum: number | null; readonly homeAdvantageMaximum: number | null;
    readonly maximumMeanGradientNorm: number | null };
  readonly fits: readonly ComparisonFitAudit[];
  readonly records: readonly ComparisonRecord[];
}
