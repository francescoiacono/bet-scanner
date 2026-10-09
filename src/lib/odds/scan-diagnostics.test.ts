import { describe, expect, it } from "vitest";
import { analyseSnapshot } from "./arbitrage";
import { demoScan, demoSnapshot } from "./demo";
import { scanDiagnostics } from "./scan-diagnostics";
import { NOW } from "./test-helpers";

describe("scan coverage diagnostics", () => {
  it("separates usable comparisons from insufficient fixtures and counts each exclusion once per fixture", () => {
    const analysis = demoScan(NOW).analysis;
    const coverage = scanDiagnostics(analysis);
    expect(coverage.total).toBe(4);
    expect(coverage.comparable.map((m) => m.fixture.id)).toEqual(["demo-arbitrage", "demo-ordinary"]);
    expect(coverage.insufficient.map((m) => m.fixture.id)).toEqual(["demo-incomplete", "demo-stale"]);
    expect(coverage.reasons).toContainEqual({ reason: "Stale price evidence (older than 120 seconds)", fixtures: 1 });
    expect(coverage.reasons).toContainEqual({ reason: "Missing eligible DRAW price", fixtures: 2 });
    expect(coverage.reasons).toContainEqual({ reason: "At least two verified bookmakers are required", fixtures: 2 });
  });

  it("does not treat three outcomes from just one bookmaker as a complete comparison", () => {
    const snapshot = demoSnapshot(NOW);
    const ordinary = snapshot.markets.find((m) => m.fixture.id === "demo-ordinary")!;
    ordinary.quotes = ordinary.quotes.filter((q) => q.bookmaker.id === "demo-a");
    snapshot.markets = [ordinary];
    const analysis = analyseSnapshot(snapshot, NOW), coverage = scanDiagnostics(analysis);
    expect(Object.keys(analysis.markets[0].best)).toHaveLength(3);
    expect(coverage.comparable).toEqual([]);
    expect(coverage.insufficient).toHaveLength(1);
    expect(coverage.reasons).toEqual([{ reason: "At least two verified bookmakers are required", fixtures: 1 }]);
    expect(analysis.status).toBe("INSUFFICIENT DATA");
  });

  it("retains an insufficient classification even when its computed S is below one", () => {
    const snapshot = demoSnapshot(NOW);
    snapshot.markets = [snapshot.markets[0]];
    for (const quote of snapshot.markets[0].quotes) if (quote.bookmaker.id === "demo-a") quote.decimalOdds = 10;
    const analysis = analyseSnapshot(snapshot, NOW), coverage = scanDiagnostics(analysis);
    expect(analysis.markets[0].inverseOddsSum).toBeLessThan(1);
    expect(coverage.comparable).toEqual([]);
    expect(coverage.reasons).toContainEqual({ reason: "Best-price legs do not span multiple bookmakers", fixtures: 1 });
    expect(analysis.opportunities).toEqual([]);
  });

  it("shows the closest complete non-arbitrage markets first, with deterministic kickoff and ID ties", () => {
    const analysis = demoScan(NOW).analysis;
    const ordinary = analysis.markets.find((m) => m.status === "NO ARBITRAGE FOUND")!;
    const market = (id: string, sum: number, hour: number) => ({ ...ordinary, inverseOddsSum: sum, fixture: { ...ordinary.fixture, id, kickoff: new Date(NOW + hour * 3_600_000).toISOString() } });
    const markets = [market("wide", 1.2, 1), market("near-late", 1.01, 4), market("near-b", 1.01, 2), market("near-a", 1.01, 2)];
    const input = { ...analysis, markets, opportunities: [] };
    const before = JSON.stringify(input);
    const ordered = scanDiagnostics(input).comparable.map((m) => m.fixture.id);
    expect(ordered).toEqual(["near-a", "near-b", "near-late", "wide"]);
    expect(scanDiagnostics({ ...input, markets: [...markets].reverse() }).comparable.map((m) => m.fixture.id)).toEqual(ordered);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the engine's opportunity ranking ahead of other comparisons without mutating results", () => {
    const snapshot = demoSnapshot(NOW), original = snapshot.markets[0], stronger = structuredClone(original);
    stronger.fixture.id = "stronger";
    stronger.market.fixtureId = "stronger";
    for (const quote of stronger.quotes) {
      quote.fixtureId = "stronger";
      quote.source.eventId = "stronger";
      quote.decimalOdds += 0.2;
    }
    snapshot.markets.push(stronger);
    const analysis = analyseSnapshot(snapshot, NOW), before = JSON.stringify(analysis);
    expect(analysis.opportunities).toHaveLength(2);
    expect(scanDiagnostics(analysis).comparable.slice(0, 2).map((m) => m.fixture.id)).toEqual(analysis.opportunities.map((o) => o.fixture.id));
    expect(scanDiagnostics(analysis).comparable.at(-1)!.fixture.id).toBe("demo-ordinary");
    expect(JSON.stringify(analysis)).toBe(before);
  });

  it("handles no complete comparisons and an empty response without suggesting an evaluated market", () => {
    const snapshot = demoSnapshot(NOW);
    snapshot.markets = snapshot.markets.filter((m) => ["demo-incomplete", "demo-stale"].includes(m.fixture.id));
    const analysis = analyseSnapshot(snapshot, NOW), coverage = scanDiagnostics(analysis);
    expect(coverage.comparable).toEqual([]);
    expect(coverage.insufficient).toHaveLength(2);
    expect(analysis.status).toBe("INSUFFICIENT DATA");
    snapshot.markets = [];
    expect(scanDiagnostics(analyseSnapshot(snapshot, NOW))).toEqual({ total: 0, comparable: [], insufficient: [], reasons: [] });
  });
});
