import { analyseSnapshot } from "./arbitrage";
import { OUTCOMES, type Bookmaker, type FixtureMarket, type OddsSnapshot } from "./types";

export const DEMO_BOOKMAKERS: Bookmaker[] = [
  { id: "demo-a", name: "Synthetic Book A", isExchange: false },
  { id: "demo-b", name: "Synthetic Book B", isExchange: false },
  { id: "demo-c", name: "Synthetic Book C", isExchange: false },
];
export function demoSnapshot(now: number): OddsSnapshot {
  const stamp = new Date(now).toISOString();
  const definitions = [
    { id: "demo-arbitrage", home: "Northbridge FC", away: "Harbour Athletic", prices: [[2.2, 3.4, 3.5], [2.1, 3.8, 3.6], [2.05, 3.6, 4]], missing: false, stale: false },
    { id: "demo-ordinary", home: "Meadow United", away: "Hillcrest Town", prices: [[1.8, 3.2, 4], [1.75, 3.3, 4.1], [1.7, 3.1, 4.2]], missing: false, stale: false },
    { id: "demo-incomplete", home: "Brookfield Rovers", away: "Westhaven FC", prices: [[2.2, 3.8, 4]], missing: true, stale: false },
    { id: "demo-stale", home: "Stoneford City", away: "Eastmere AFC", prices: [[2.2, 3.8, 4], [2.1, 3.9, 4.1]], missing: false, stale: true },
  ];
  const markets: FixtureMarket[] = definitions.map((d, n) => {
    const fixture = { id: d.id, sport: "FOOTBALL" as const, competitionId: "demo-league", competition: "Fictional Research League", homeTeam: d.home, awayTeam: d.away, kickoff: new Date(now + (n + 1) * 3_600_000).toISOString() };
    const market = { id: `${d.id}:1x2`, fixtureId: d.id, type: "MATCH_WINNER" as const, settlement: "REGULATION_TIME_1X2" as const, available: true };
    const quotes = d.prices.flatMap((prices, b) => OUTCOMES.filter((o) => !d.missing || o !== "DRAW").map((outcome) => ({
      id: `${d.id}:${b}:${outcome}`, fixtureId: d.id, competitionId: fixture.competitionId, marketId: market.id, settlement: market.settlement, outcome,
      decimalOdds: prices[OUTCOMES.indexOf(outcome)], bookmaker: DEMO_BOOKMAKERS[b], side: "BACK" as const, available: true,
      evidenceAt: new Date(now - (d.stale ? 121_000 : (b + 1) * 5_000)).toISOString(), snapshotAt: stamp,
      source: { provider: "SYNTHETIC", eventId: d.id, marketKey: "h2h", outcomeName: outcome, pointer: `synthetic/${d.id}/${b}/${outcome}`, link: null },
    })));
    return { fixture, market, quotes };
  });
  return { provider: "SYNTHETIC", mode: "DEMO", receivedAt: stamp, processedAt: stamp, markets, excluded: [] };
}
export function demoScan(now: number) { const snapshot = demoSnapshot(now); return { snapshot, analysis: analyseSnapshot(snapshot, now) }; }
