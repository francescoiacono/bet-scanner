import type { MarketAnalysis, ScanAnalysis } from "./types";

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareFixture = (a: MarketAnalysis, b: MarketAnalysis) =>
  Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff) || compareText(a.fixture.id, b.fixture.id);

/** Presentation diagnostics from the existing evaluation, without revalidating or changing it. */
export function scanDiagnostics(analysis: ScanAnalysis) {
  const opportunityRanks = new Map(analysis.opportunities.map((opportunity, rank) => [opportunity.fixture.id, rank]));
  const comparable = analysis.markets.filter((market) => market.status !== "INSUFFICIENT DATA").sort((a, b) => {
    const aRank = opportunityRanks.get(a.fixture.id) ?? Infinity;
    const bRank = opportunityRanks.get(b.fixture.id) ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return a.inverseOddsSum! - b.inverseOddsSum! || compareFixture(a, b);
  });
  const insufficient = analysis.markets.filter((market) => market.status === "INSUFFICIENT DATA").sort(compareFixture);
  const reasonCounts = new Map<string, number>();
  for (const market of insufficient) {
    // Count affected fixtures, not repeated rejected offers; several reasons can affect one fixture.
    const reasons = new Set([...market.reasons, ...market.excluded.map((record) => record.reason)]);
    for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const reasons = [...reasonCounts].map(([reason, fixtures]) => ({ reason, fixtures }))
    .sort((a, b) => b.fixtures - a.fixtures || compareText(a.reason, b.reason));
  return { total: analysis.markets.length, comparable, insufficient, reasons };
}
