import type { MatchPrediction } from "../football/types";

export type BettingMarket = "MATCH_WINNER";
export type MatchWinnerSelection = "HOME" | "DRAW" | "AWAY";

/** Market inputs deliberately contain no model probabilities. */
export interface MarketQuote {
  readonly id: string;
  readonly fixtureId: string;
  readonly market: BettingMarket;
  readonly selection: MatchWinnerSelection;
  readonly decimalOdds: number;
}

/** Derived only after independently supplied quotes and predictions are joined. */
export interface AnalysedBet extends MarketQuote {
  readonly eventName: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly prediction: MatchPrediction;
  /** A probability in [0, 1], not a percentage. */
  readonly modelProbability: number;
  readonly impliedProbability: number;
  /** Probability difference; multiply by 100 to display percentage points. */
  readonly edge: number;
  /** Fractional expected return; multiply by 100 to display a percentage. */
  readonly expectedROI: number;
}
