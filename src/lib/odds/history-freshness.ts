import type { OddsSnapshot } from "./types";
import { instant, MAX_PRICE_AGE_MS } from "./validation";

/** Next local presentation boundary; never schedules a provider request. */
export function nextHistoryBoundary(snapshot: OddsSnapshot, now: number): number | null {
  if (!Number.isFinite(now)) throw new RangeError("Invalid evaluation clock.");
  const boundaries: number[] = [];
  for (const row of snapshot.markets) {
    const kickoff = instant(row.fixture.kickoff);
    for (const quote of row.quotes) {
      if (quote.evidenceAt === null) continue;
      let evidence: number;
      try { evidence = instant(quote.evidenceAt); } catch { continue; }
      const expiry = evidence + MAX_PRICE_AGE_MS + 1;
      if (evidence <= now && expiry > now && kickoff > now) boundaries.push(Math.min(expiry, kickoff));
    }
  }
  return boundaries.length ? boundaries.reduce((earliest, boundary) => Math.min(earliest, boundary)) : null;
}
