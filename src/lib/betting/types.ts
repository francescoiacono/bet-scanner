export type BettingMarket = "MATCH_WINNER";
export type MatchWinnerSelection = "HOME" | "DRAW" | "AWAY";

export interface BettingOpportunity {
  readonly id: string;
  readonly eventName: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly market: BettingMarket;
  readonly selection: MatchWinnerSelection;
  readonly decimalOdds: number;
  /** A probability in [0, 1], not a percentage. */
  readonly modelProbability: number;
}

export interface AnalysedBet extends BettingOpportunity {
  readonly impliedProbability: number;
  /** Probability difference; multiply by 100 to display percentage points. */
  readonly edge: number;
  /** Fractional expected return; multiply by 100 to display a percentage. */
  readonly expectedROI: number;
}
