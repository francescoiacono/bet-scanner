import type { AnalysedBet, BettingOpportunity } from "./types";

function validateOdds(decimalOdds: number): void {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new RangeError("Decimal odds must be a finite number greater than 1.");
  }
}

function validateProbability(modelProbability: number): void {
  if (
    !Number.isFinite(modelProbability) ||
    modelProbability < 0 ||
    modelProbability > 1
  ) {
    throw new RangeError("Model probability must be a finite number between 0 and 1.");
  }
}

export function calculateImpliedProbability(decimalOdds: number): number {
  validateOdds(decimalOdds);
  return 1 / decimalOdds;
}

export function calculateEdge(
  decimalOdds: number,
  modelProbability: number,
): number {
  validateProbability(modelProbability);
  return modelProbability - calculateImpliedProbability(decimalOdds);
}

export function calculateExpectedROI(
  decimalOdds: number,
  modelProbability: number,
): number {
  validateOdds(decimalOdds);
  validateProbability(modelProbability);
  return modelProbability * decimalOdds - 1;
}

/** Invalid inputs throw instead of producing a plausible-looking result. */
export function analyseBet(opportunity: BettingOpportunity): AnalysedBet {
  return {
    ...opportunity,
    impliedProbability: calculateImpliedProbability(opportunity.decimalOdds),
    edge: calculateEdge(opportunity.decimalOdds, opportunity.modelProbability),
    expectedROI: calculateExpectedROI(
      opportunity.decimalOdds,
      opportunity.modelProbability,
    ),
  };
}
