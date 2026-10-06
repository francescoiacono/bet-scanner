import type { MatchOutcome } from "../backtest/types";
import type { OutcomeProbabilities } from "../football/types";

export type PriceCohort = "RECENT" | "OLDER";
export interface FixtureIdentity {
  readonly fixtureId: string;
  readonly seasonId: string;
  /** Noon-UTC normalized date key; not an actual kickoff time. */
  readonly sourceDate: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
}
/** Provider/source type contains prices and identities, never model probabilities. */
export interface ParsedPriceRow {
  readonly seasonId: string;
  readonly sourceDate: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeOdds: number;
  readonly drawOdds: number;
  readonly awayOdds: number;
}
export interface HistoricalThreeWayPrice {
  readonly fixtureId: string;
  readonly seasonId: string;
  readonly sourceDate: string;
  readonly homeOdds: number;
  readonly drawOdds: number;
  readonly awayOdds: number;
}
/** Narrow typed projection of existing records, with no fitting dependency. */
export interface FrozenValuePrediction extends FixtureIdentity {
  readonly modelVersion: "dixon-coles-v1";
  readonly modelProbabilities: OutcomeProbabilities;
  readonly actualOutcome: MatchOutcome;
  readonly modelBrier: number;
}
export interface AnalysedMarket {
  readonly rawImplied: OutcomeProbabilities;
  readonly rawTotal: number;
  readonly overround: number;
  readonly fairProbabilities: OutcomeProbabilities;
}
export interface PaperSelection {
  readonly outcome: MatchOutcome;
  readonly decimalOdds: number;
  readonly modelProbability: number;
  readonly fairMarketProbability: number;
  readonly fairMarketEdge: number;
  readonly expectedROI: number;
}
/** The selection API has no actual outcome, score or return fields. */
export interface PaperSelectionInput {
  readonly modelProbabilities: OutcomeProbabilities;
  readonly price: HistoricalThreeWayPrice;
}
export interface PaperSettlement {
  readonly stake: 0 | 1;
  readonly returned: number;
  readonly profit: number;
  readonly won: boolean | null;
}
/** Private audit only. Public outputs are explicit aggregate projections. */
export interface ValueRecord extends FrozenValuePrediction {
  readonly cohort: PriceCohort;
  readonly price: HistoricalThreeWayPrice;
  readonly market: AnalysedMarket;
  readonly marketFairBrier: number;
  readonly modelBrierAdvantage: number;
  readonly expectedROIs: OutcomeProbabilities;
  readonly fairMarketEdges: OutcomeProbabilities;
  readonly selection: PaperSelection | null;
  readonly settlement: PaperSettlement;
}
