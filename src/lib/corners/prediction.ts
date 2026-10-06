import { CORNER_NB_VERSION, CORNER_OVER_LINES, CORNER_POISSON_VERSION, MAX_EXPLICIT_TOTAL_CORNERS } from "./config";
import { negativeBinomialPMF, poissonPMF, sumProbabilities, validateAlpha, validateCount, validateMean } from "./distributions";
import { expectedCornerMeans } from "./likelihood";
import type { CornerFit, CornerPrediction, PlayedCornerMatch } from "./types";

export function validateDistribution(probabilities: readonly number[]): void {
  if (probabilities.length < 2 || probabilities.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
    || Math.abs(sumProbabilities(probabilities) - 1) > 1e-10) throw new RangeError("Count categories must be finite, non-negative and sum to one.");
}
/** Exact finite convolution through a requested CDF boundary. */
export function totalCornerMasses(maximum: number, home: number, away: number, alpha: number | null): number[] {
  validateCount(maximum); validateMean(home); validateMean(away); if (alpha !== null) validateAlpha(alpha);
  const pmf = (k: number, mean: number) => alpha === null ? poissonPMF(k, mean) : negativeBinomialPMF(k, mean, alpha);
  const hp = Array.from({ length: maximum + 1 }, (_, k) => pmf(k, home));
  const ap = Array.from({ length: maximum + 1 }, (_, k) => pmf(k, away));
  return hp.map((_, total) => sumProbabilities(Array.from({ length: total + 1 }, (_, h) => hp[h] * ap[total - h])));
}
export function overCornerProbability(line: number, home: number, away: number, alpha: number | null = null): number {
  if (!CORNER_OVER_LINES.includes(line)) throw new RangeError("Unselected corner line.");
  const cdf = sumProbabilities(totalCornerMasses(Math.floor(line), home, away, alpha));
  if (!Number.isFinite(cdf) || cdf < 0 || cdf > 1 + 1e-10) throw new RangeError("Invalid total-corner CDF.");
  return Math.max(0, 1 - cdf); // Only numerical roundoff; uses the exact line CDF, not the 30 cutoff.
}
export function distributionPrediction(fixtureId: string, home: number, away: number, alpha: number | null,
  modelVersion: CornerPrediction["modelVersion"]): CornerPrediction {
  if (!fixtureId.trim() || !Number.isFinite(home + away)) throw new RangeError("Invalid corner prediction identity/total.");
  const explicit = totalCornerMasses(MAX_EXPLICIT_TOTAL_CORNERS, home, away, alpha);
  const mass = sumProbabilities(explicit);
  if (!Number.isFinite(mass) || mass > 1 + 1e-10) throw new RangeError("Invalid explicit corner mass.");
  const totalProbabilities = [...explicit, Math.max(0, 1 - mass)];
  validateDistribution(totalProbabilities);
  return { fixtureId, expectedHomeCorners: home, expectedAwayCorners: away, expectedTotalCorners: home + away, alpha, modelVersion,
    totalProbabilities, overProbabilities: CORNER_OVER_LINES.map((line) => overCornerProbability(line, home, away, alpha)) };
}
export function predictCornerModel(fixture: Pick<PlayedCornerMatch, "id" | "homeTeam" | "awayTeam">, fit: CornerFit): CornerPrediction {
  if (!fit.converged || (fit.modelVersion !== CORNER_POISSON_VERSION && fit.modelVersion !== CORNER_NB_VERSION)
    || (fit.modelVersion === CORNER_NB_VERSION ? fit.alpha === null : fit.alpha !== null)) throw new RangeError("Invalid corner fit family/state.");
  const means = expectedCornerMeans(fixture, fit);
  return distributionPrediction(fixture.id, means.expectedHomeCorners, means.expectedAwayCorners, fit.alpha, fit.modelVersion);
}
export function empiricalCornerPrediction(fixtureId: string, history: readonly PlayedCornerMatch[]): CornerPrediction {
  if (!history.length) throw new RangeError("Empirical corners require prior history.");
  const counts = Array<number>(MAX_EXPLICIT_TOTAL_CORNERS + 2).fill(0);
  let home = 0, away = 0;
  for (const match of history) {
    const total = match.homeCorners + match.awayCorners; validateCount(total);
    counts[Math.min(total, MAX_EXPLICIT_TOTAL_CORNERS + 1)]++; home += match.homeCorners; away += match.awayCorners;
  }
  const totalProbabilities = counts.map((count) => count / history.length); validateDistribution(totalProbabilities);
  return { fixtureId, modelVersion: "league-empirical-corners", expectedHomeCorners: home / history.length, expectedAwayCorners: away / history.length,
    expectedTotalCorners: (home + away) / history.length, alpha: null, totalProbabilities,
    overProbabilities: CORNER_OVER_LINES.map((line) => history.filter((m) => m.homeCorners + m.awayCorners > line).length / history.length) };
}
