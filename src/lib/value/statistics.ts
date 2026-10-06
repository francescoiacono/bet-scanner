/** Same local Mulberry32 generator as the frozen diagnostics bootstrap. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
export const mean = (values: readonly number[]) => values.length ? sum(values) / values.length : null;
/** Linear interpolation at (n−1)*p; empty observations are unavailable. */
export function percentile(values: readonly number[], probability: number): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1 || values.some((value) => !Number.isFinite(value))) throw new RangeError("Invalid percentile input.");
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b), position = (ordered.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}
