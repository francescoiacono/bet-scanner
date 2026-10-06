import { analyseBet } from "./analyse-bet";
import type { AnalysedBet, BettingOpportunity } from "./types";

export const DEFAULT_MINIMUM_EDGE = 0.02;

/** Analyse, filter, and rank without mutating the source opportunities. */
export function rankBets(
  opportunities: readonly BettingOpportunity[],
  minimumEdge: number = DEFAULT_MINIMUM_EDGE,
): AnalysedBet[] {
  if (!Number.isFinite(minimumEdge) || minimumEdge < 0 || minimumEdge > 1) {
    throw new RangeError("Minimum edge must be a finite number between 0 and 1.");
  }

  return opportunities
    .map(analyseBet)
    .filter((bet) => {
      // Subtraction can put an exact boundary one machine epsilon below it.
      // This preserves inclusive comparisons without rounding displayed values.
      return bet.edge >= minimumEdge || minimumEdge - bet.edge <= Number.EPSILON;
    })
    .sort((a, b) => {
      const roiDifference = b.expectedROI - a.expectedROI;
      if (roiDifference !== 0) return roiDifference;
      // Code-point ID order makes equal-ROI results deterministic in any locale.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
