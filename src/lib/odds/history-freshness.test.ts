import { describe, expect, it } from "vitest";
import { nextHistoryBoundary } from "./history-freshness";
import { normalizeOddsRelay } from "./providers/oddsrelay-normalize";
import { board, BOOKS, NOW, SPORTS } from "./test-helpers";

describe("local historical evidence expiry", () => {
  const snapshot = () => normalizeOddsRelay(board(), BOOKS, SPORTS, ["a", "b"], NOW);
  it("schedules the first evidence boundary and stops when all evidence is expired", () => {
    const input = snapshot();
    expect(nextHistoryBoundary(input, NOW)).toBe(NOW + 100_001);
    expect(nextHistoryBoundary(input, NOW + 100_001)).toBe(NOW + 110_001);
    expect(nextHistoryBoundary(input, NOW + 110_001)).toBeNull();
  });
  it("kickoff takes precedence and invalid, missing or future evidence cannot refresh itself", () => {
    const input = snapshot(); input.markets[0].fixture.kickoff = new Date(NOW + 1000).toISOString();
    expect(nextHistoryBoundary(input, NOW)).toBe(NOW + 1000);
    expect(nextHistoryBoundary(input, NOW + 1000)).toBeNull();
    input.markets[0].fixture.kickoff = new Date(NOW + 3_600_000).toISOString();
    input.markets[0].quotes.forEach((q, i) => { q.evidenceAt = i % 3 === 0 ? null : i % 3 === 1 ? "invalid" : new Date(NOW + 1000).toISOString(); });
    expect(nextHistoryBoundary(input, NOW)).toBeNull();
    expect(() => nextHistoryBoundary(input, NaN)).toThrow("Invalid evaluation clock");
  });
});
