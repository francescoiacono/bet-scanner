/** Lanczos g=7, nine-term positive-real log Gamma; reflection below 0.5.
 * Standard approximation: https://www.boost.org/doc/libs/1_71_0/libs/math/doc/html/math_toolkit/lanczos.html
 */
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("logGamma requires a finite positive argument.");
  if (value === 1 || value === 2) return 0;
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const z = value - 1; let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  const result = 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
  if (!Number.isFinite(result)) throw new RangeError("logGamma overflow.");
  return result;
}
export function validateCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Counts must be non-negative safe integers.");
}
export function validateMean(mean: number): void {
  if (!Number.isFinite(mean) || mean < 0) throw new RangeError("Count means must be finite and non-negative.");
}
export function validateAlpha(alpha: number): void {
  if (!Number.isFinite(alpha) || alpha <= 0) throw new RangeError("NB alpha must be finite and positive.");
}
export function poissonLogPMF(count: number, mean: number): number {
  validateCount(count); validateMean(mean);
  if (mean === 0) return count === 0 ? 0 : -Infinity;
  return count * Math.log(mean) - mean - logGamma(count + 1);
}
export function poissonPMF(count: number, mean: number): number { return Math.exp(poissonLogPMF(count, mean)); }
/** Gamma-ratio identity for integer k avoids subtracting enormous logGamma
 * values as alpha → 0. Exactly the NB2 log PMF, not a Poisson substitution.
 */
export function negativeBinomialLogPMF(count: number, mean: number, alpha: number): number {
  validateCount(count); validateMean(mean); validateAlpha(alpha);
  if (mean === 0) return count === 0 ? 0 : -Infinity;
  const logScale = Math.log1p(alpha * mean);
  let rising = 0;
  for (let j = 0; j < count; j++) rising += Math.log1p(alpha * j);
  const result = count * Math.log(mean) - logGamma(count + 1) + rising - logScale / alpha - count * logScale;
  if (!Number.isFinite(result)) throw new RangeError("Invalid NB log probability.");
  return result;
}
export function negativeBinomialPMF(count: number, mean: number, alpha: number): number { return Math.exp(negativeBinomialLogPMF(count, mean, alpha)); }
export function negativeBinomialVariance(mean: number, alpha: number): number {
  validateMean(mean); validateAlpha(alpha);
  const variance = mean + alpha * mean * mean;
  if (!Number.isFinite(variance)) throw new RangeError("NB variance overflow.");
  return variance;
}
export function sumProbabilities(values: readonly number[]): number {
  let sum = 0, correction = 0;
  for (const value of values) { const y = value - correction, next = sum + y; correction = (next - sum) - y; sum = next; }
  return sum;
}
export function countCDF(maximum: number, mean: number, alpha: number | null = null): number {
  validateCount(maximum); validateMean(mean); if (alpha !== null) validateAlpha(alpha);
  const probabilities = Array.from({ length: maximum + 1 }, (_, k) => alpha === null ? poissonPMF(k, mean) : negativeBinomialPMF(k, mean, alpha));
  const cdf = sumProbabilities(probabilities);
  if (!Number.isFinite(cdf) || cdf < 0 || cdf > 1 + 1e-10) throw new RangeError("Invalid count CDF.");
  return Math.min(1, cdf); // At most floating-point roundoff, never tail renormalization.
}
