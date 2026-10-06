import { CORNER_OVER_LINES } from "./config";
import { validateCount } from "./distributions";
import { validateDistribution } from "./prediction";

function probability(value: number): void { if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Probability must be in [0, 1]."); }
export function binaryBrier(pOver: number, observedOver: boolean): number {
  probability(pOver); if (typeof observedOver !== "boolean") throw new RangeError("Binary observations must be boolean.");
  return (pOver - Number(observedOver)) ** 2;
}
export function isOver(total: number, line: number): boolean {
  validateCount(total); if (!CORNER_OVER_LINES.includes(line)) throw new RangeError("Unselected corner line.");
  return total > line;
}
/** Normalized ordered-category RPS; last category includes its entire tail. */
export function rankedProbabilityScore(probabilities: readonly number[], observed: number): number {
  validateDistribution(probabilities); validateCount(observed);
  let cdf = 0, score = 0;
  const category = Math.min(observed, probabilities.length - 1);
  for (let k = 0; k < probabilities.length - 1; k++) { cdf += probabilities[k]; score += (cdf - Number(category <= k)) ** 2; }
  return score / (probabilities.length - 1);
}
export function binaryCalibration(observations: readonly { probability: number; over: boolean }[]) {
  const groups: { probability: number; over: boolean }[][] = Array.from({ length: 10 }, () => []);
  for (const observation of observations) {
    probability(observation.probability); if (typeof observation.over !== "boolean") throw new RangeError("Invalid binary calibration observation.");
    groups[Math.min(9, Math.floor(observation.probability * 10))].push(observation);
  }
  const bins = groups.map((group, i) => ({ lowerBound: i / 10, upperBound: (i + 1) / 10, count: group.length,
    meanPredictedProbability: group.length ? group.reduce((sum, r) => sum + r.probability, 0) / group.length : null,
    observedFrequency: group.length ? group.filter((r) => r.over).length / group.length : null }));
  return { evaluatedMatches: observations.length,
    meanPredictedProbability: observations.length ? observations.reduce((sum, r) => sum + r.probability, 0) / observations.length : null,
    observedFrequency: observations.length ? observations.filter((r) => r.over).length / observations.length : null,
    ece: observations.length ? bins.reduce((sum, bin) => sum + bin.count * Math.abs((bin.meanPredictedProbability ?? 0) - (bin.observedFrequency ?? 0)), 0) / observations.length : null,
    bins };
}
