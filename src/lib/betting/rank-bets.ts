import type { AnalysedBet } from "./types";

export const DEFAULT_MINIMUM_EDGE = 0.02;

/** Filter and rank already analysed quotes without mutating the source. */
export function rankBets(
  analysedBets: readonly AnalysedBet[],
  minimumEdge: number = DEFAULT_MINIMUM_EDGE,
): AnalysedBet[] {
  if (!Number.isFinite(minimumEdge) || minimumEdge < 0 || minimumEdge > 1) {
    throw new RangeError("Minimum edge must be a finite number between 0 and 1.");
  }

  if (analysedBets.some((bet) => !Number.isFinite(bet.edge) || !Number.isFinite(bet.expectedROI))) {
    throw new RangeError("Ranking requires finite analysed edge and expected ROI values.");
  }

  return analysedBets
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
