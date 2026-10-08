export const MAX_PRICE_AGE_MS = 120_000;
export const MAX_TOKENS_PER_SCAN = 500;
export const APPROVAL_LIFETIME_MS = 60_000;
export function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new RangeError("Expected an ISO UTC timestamp with seconds.");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace(/\.000Z$/, "Z") !== value.replace(/\.(\d{1,3})Z$/, (_, n: string) => `.${n.padEnd(3, "0")}Z`).replace(/\.000Z$/, "Z")) throw new RangeError("Invalid calendar timestamp.");
  return time;
}
export function decimalOdds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 1) throw new RangeError("Decimal odds must be finite and greater than one.");
  return value;
}
export function priceEvidenceError(value: string | null, now: number): string | null {
  if (!Number.isFinite(now)) throw new RangeError("Invalid evaluation clock.");
  if (value === null) return "Missing required venue/sport freshness evidence";
  let time: number;
  try { time = instant(value); } catch { return "Invalid freshness timestamp"; }
  if (time > now) return "Future freshness timestamp";
  return now - time > MAX_PRICE_AGE_MS ? "Stale price evidence (older than 120 seconds)" : null;
}
export function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new RangeError(`Invalid ${name}.`);
  return value;
}
