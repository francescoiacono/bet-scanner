import { describe, expect, it } from "vitest";
import { analyseSnapshot, rankArbitrage } from "./arbitrage";
import { demoScan, demoSnapshot } from "./demo";
import { OUTCOMES } from "./types";
import { decimalOdds, instant, priceEvidenceError } from "./validation";
import { NOW } from "./test-helpers";

describe("odds inputs and price freshness", () => {
  it("accepts decimal prices without rounding", () => expect(decimalOdds(2.14000001)).toBe(2.14000001));
  it.each([1, 0, -1, Infinity, -Infinity, NaN, "2", null, undefined])("rejects invalid odds %s", (value) => expect(() => decimalOdds(value)).toThrow(RangeError));
  it.each(["2026-02-30T12:00:00Z", "2026-10-08", "2026-10-08T12:00Z", "2026-10-08T12:00:00+01:00", "not-a-time"]) ("rejects unsupported or invalid timestamps %s", (value) => expect(() => instant(value)).toThrow());
  it("parses UTC seconds and milliseconds", () => { expect(instant("2026-10-08T12:00:00Z")).toBe(NOW); expect(instant("2026-10-08T12:00:00.1Z")).toBe(NOW + 100); });
  it("accepts exactly 120 seconds, excludes older, future, absent and malformed evidence", () => {
    expect(priceEvidenceError(new Date(NOW - 120000).toISOString(), NOW)).toBeNull();
    for (const value of [new Date(NOW - 120001).toISOString(), new Date(NOW + 1).toISOString(), null, "invalid"]) expect(priceEvidenceError(value, NOW)).not.toBeNull();
  });
});
describe("pure football three-way arbitrage", () => {
  it("demo covers theoretical arbitrage, ordinary, incomplete and stale markets", () => {
    const r = demoScan(NOW); expect(r.analysis.opportunities).toHaveLength(1);
    expect(r.analysis.markets.map((m) => m.status).sort()).toEqual(["ARBITRAGE", "INSUFFICIENT DATA", "INSUFFICIENT DATA", "NO ARBITRAGE FOUND"].sort());
    expect(r.snapshot.mode).toBe("DEMO"); expect(r.snapshot.provider).toBe("SYNTHETIC"); expect(r.analysis.excluded).toHaveLength(6);
  });
  it("retains each best bookmaker, precise sum, gross ROI and equalized educational payouts", () => {
    const a = demoScan(NOW).analysis.opportunities[0], sum = 1 / 2.2 + 1 / 3.8 + 1 / 4;
    expect(a.inverseOddsSum).toBe(sum); expect(a.theoreticalGrossROI).toBeCloseTo(1 / sum - 1, 14);
    expect(OUTCOMES.map((o) => a.selections[o].bookmaker.id)).toEqual(["demo-a", "demo-b", "demo-c"]);
    expect(OUTCOMES.reduce((n, o) => n + a.illustrativeFractions[o], 0)).toBeCloseTo(1, 14);
    for (const o of OUTCOMES) expect(a.illustrativeFractions[o] * a.selections[o].decimalOdds).toBeCloseTo(a.grossPayoutPerUnit, 14);
  });
  it("does not mutate snapshots and is independent of input ordering", () => {
    const a = demoSnapshot(NOW), copy = structuredClone(a), r = analyseSnapshot(a, NOW);
    expect(a).toEqual(copy); a.markets.reverse(); a.markets.forEach((m) => m.quotes.reverse()); expect(analyseSnapshot(a, NOW)).toEqual(r);
  });
  it("S exactly one is not arbitrage", () => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]]; s.markets[0].quotes.forEach((q) => q.decimalOdds = q.outcome === "HOME" ? 2 : 4);
    expect(analyseSnapshot(s, NOW).status).toBe("NO ARBITRAGE FOUND");
  });
  it.each(["HOME", "DRAW", "AWAY"] as const)("missing %s prevents an opportunity", (outcome) => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]]; s.markets[0].quotes = s.markets[0].quotes.filter((q) => q.outcome !== outcome);
    expect(analyseSnapshot(s, NOW).status).toBe("INSUFFICIENT DATA");
  });
  it.each(["fixture", "competition", "settlement", "side", "exchange", "unavailable", "future", "missing time", "price", "bookmaker", "source", "snapshot"])("excludes unverified %s offers", (kind) => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]];
    for (const q of s.markets[0].quotes) {
      if (kind === "fixture") q.fixtureId = "other"; if (kind === "competition") q.competitionId = "other"; if (kind === "settlement") q.settlement = "EXTRA_TIME";
      if (kind === "side") q.side = "LAY"; if (kind === "exchange") q.bookmaker = { ...q.bookmaker, isExchange: true }; if (kind === "unavailable") q.available = false;
      if (kind === "future") q.evidenceAt = new Date(NOW + 1).toISOString(); if (kind === "missing time") q.evidenceAt = null; if (kind === "price") q.decimalOdds = NaN;
      if (kind === "bookmaker") q.bookmaker = { ...q.bookmaker, id: "" }; if (kind === "source") q.source.provider = "OTHER"; if (kind === "snapshot") q.snapshotAt = new Date(NOW - 100).toISOString();
    }
    expect(analyseSnapshot(s, NOW).opportunities).toHaveLength(0);
  });
  it.each(["past", "at kickoff", "unavailable", "ambiguous competition", "settlement", "future snapshot"])("excludes %s fixtures/markets", (kind) => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]]; const r = s.markets[0];
    if (kind === "past") r.fixture.kickoff = new Date(NOW - 1).toISOString(); if (kind === "at kickoff") r.fixture.kickoff = new Date(NOW).toISOString();
    if (kind === "unavailable") r.market.available = false; if (kind === "ambiguous competition") r.fixture.competition = "";
    if (kind === "settlement") r.market.settlement = "EXTRA_TIME" as typeof r.market.settlement; if (kind === "future snapshot") s.processedAt = new Date(NOW + 1).toISOString();
    expect(analyseSnapshot(s, NOW).status).toBe("INSUFFICIENT DATA");
  });
  it("requires coverage and winning legs from two different bookmakers", () => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]]; s.markets[0].quotes = s.markets[0].quotes.filter((q) => q.bookmaker.id === "demo-a");
    expect(analyseSnapshot(s, NOW).opportunities).toHaveLength(0);
    const t = demoSnapshot(NOW); t.markets = [t.markets[0]]; t.markets[0].quotes.filter((q) => q.bookmaker.id === "demo-a").forEach((q) => q.decimalOdds = 100);
    expect(analyseSnapshot(t, NOW).opportunities).toHaveLength(0);
  });
  it("duplicate bookmaker/outcome observations are excluded without choosing a convenient price", () => {
    const s = demoSnapshot(NOW); s.markets = [s.markets[0]]; s.markets[0].quotes.push(structuredClone(s.markets[0].quotes[0]));
    const r = analyseSnapshot(s, NOW); expect(r.excluded).toHaveLength(2); expect(r.markets[0].best.HOME?.bookmaker.id).not.toBe("demo-a");
  });
  it("rejects duplicate event records rather than fuzzy joining", () => { const s = demoSnapshot(NOW); s.markets.push(s.markets[0]); expect(() => analyseSnapshot(s, NOW)).toThrow(); });
  it("empty snapshots and invalid clocks are explicit", () => { const s = demoSnapshot(NOW); s.markets = []; expect(analyseSnapshot(s, NOW).status).toBe("INSUFFICIENT DATA"); expect(() => analyseSnapshot(s, NaN)).toThrow(); });
  it("ranks ROI, then oldest supporting evidence freshness, then event ID", () => {
    const base = demoScan(NOW).analysis.opportunities[0];
    const a = { ...base, fixture: { ...base.fixture, id: "a" } }, b = { ...base, fixture: { ...base.fixture, id: "b" } }, fresh = { ...base, fixture: { ...base.fixture, id: "z" }, oldestEvidenceAt: new Date(NOW).toISOString() }, rich = { ...base, theoreticalGrossROI: 1 };
    const list = [b, fresh, a, rich]; expect(rankArbitrage(list)).toEqual([rich, fresh, a, b]); expect(list).toEqual([b, fresh, a, rich]);
  });
  it("refuses to rank invalid returns", () => { const a = demoScan(NOW).analysis.opportunities[0]; for (const value of [NaN, Infinity, -1, 0]) expect(() => rankArbitrage([{ ...a, theoreticalGrossROI: value }])).toThrow(); });
});
