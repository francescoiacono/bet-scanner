import { OUTCOMES, type ArbitrageOpportunity, type FixtureMarket, type MarketAnalysis, type OddsQuote, type OddsSnapshot, type ScanAnalysis } from "./types";
import { decimalOdds, instant, priceEvidenceError, text } from "./validation";

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function quoteError(q: OddsQuote, row: FixtureMarket, snapshot: OddsSnapshot, now: number): string | null {
  const { fixture: f, market: m } = row;
  if (q.fixtureId !== f.id || q.competitionId !== f.competitionId || q.marketId !== m.id || q.settlement !== m.settlement || q.source.eventId !== f.id || q.source.provider !== snapshot.provider || q.snapshotAt !== snapshot.processedAt) return "Mismatched fixture, competition, settlement or source";
  if (!OUTCOMES.includes(q.outcome)) return "Unknown outcome";
  if (q.side !== "BACK" || q.bookmaker.isExchange) return "Exchange/lay offers are excluded";
  if (!q.available) return "Unavailable offer";
  try { text(q.id, "quote ID"); text(q.bookmaker.id, "bookmaker ID"); text(q.bookmaker.name, "bookmaker name"); decimalOdds(q.decimalOdds); } catch { return "Invalid bookmaker identity or decimal odds"; }
  return priceEvidenceError(q.evidenceAt, now);
}
export function analyseFixtureMarket(row: FixtureMarket, snapshot: OddsSnapshot, now: number): MarketAnalysis {
  const { fixture: f, market: m } = row;
  const result: MarketAnalysis = { fixture: f, status: "INSUFFICIENT DATA", best: {}, inverseOddsSum: null, opportunity: null, excluded: [], reasons: [] };
  try {
    [f.id, f.competitionId, f.competition, f.homeTeam, f.awayTeam, m.id].forEach((v) => text(v, "fixture/market identity"));
    if (f.homeTeam === f.awayTeam || f.sport !== "FOOTBALL" || m.fixtureId !== f.id || m.type !== "MATCH_WINNER" || m.settlement !== "REGULATION_TIME_1X2") throw new RangeError("Ambiguous fixture or settlement");
    if (instant(f.kickoff) <= now) throw new RangeError("Fixture has already started");
    if (instant(snapshot.processedAt) > now || instant(snapshot.receivedAt) > now) throw new RangeError("Future snapshot timestamp");
    if (!m.available) throw new RangeError("Unavailable market");
  } catch (error) { result.reasons.push(error instanceof Error ? error.message : "Invalid fixture"); return result; }
  const eligible: OddsQuote[] = [];
  const identities = new Map<string, number>();
  for (const q of row.quotes) identities.set(`${q.bookmaker.id}\0${q.outcome}`, (identities.get(`${q.bookmaker.id}\0${q.outcome}`) ?? 0) + 1);
  for (const q of [...row.quotes].sort((a, b) => compareId(a.id, b.id))) {
    const reason = quoteError(q, row, snapshot, now) ?? (identities.get(`${q.bookmaker.id}\0${q.outcome}`)! > 1 ? "Duplicate bookmaker/outcome offers" : null);
    if (reason) result.excluded.push({ eventId: f.id, source: q.source.pointer, reason }); else eligible.push(q);
  }
  for (const outcome of OUTCOMES) {
    const offers = eligible.filter((q) => q.outcome === outcome).sort((a, b) => b.decimalOdds - a.decimalOdds || instant(b.evidenceAt!) - instant(a.evidenceAt!) || compareId(a.bookmaker.id, b.bookmaker.id) || compareId(a.id, b.id));
    if (offers[0]) result.best[outcome] = offers[0]; else result.reasons.push(`Missing eligible ${outcome} price`);
  }
  if (new Set(eligible.map((q) => q.bookmaker.id)).size < 2) result.reasons.push("At least two verified bookmakers are required");
  if (result.reasons.length) return result;
  const best = result.best as Record<typeof OUTCOMES[number], OddsQuote>;
  const sum = OUTCOMES.reduce((s, o) => s + 1 / best[o].decimalOdds, 0);
  if (!Number.isFinite(sum) || sum <= 0) { result.reasons.push("Invalid inverse-odds sum"); return result; }
  result.inverseOddsSum = sum;
  if (sum >= 1) { result.status = "NO ARBITRAGE FOUND"; return result; }
  if (new Set(OUTCOMES.map((o) => best[o].bookmaker.id)).size < 2) { result.reasons.push("Best-price legs do not span multiple bookmakers"); return result; }
  const roi = 1 / sum - 1;
  if (!Number.isFinite(roi)) { result.reasons.push("Unrepresentable theoretical return"); return result; }
  result.status = "ARBITRAGE";
  result.opportunity = { fixture: f, market: m, selections: best, inverseOddsSum: sum, theoreticalGrossROI: roi,
    illustrativeFractions: { HOME: (1 / best.HOME.decimalOdds) / sum, DRAW: (1 / best.DRAW.decimalOdds) / sum, AWAY: (1 / best.AWAY.decimalOdds) / sum },
    grossPayoutPerUnit: 1 / sum, oldestEvidenceAt: new Date(Math.min(...OUTCOMES.map((o) => instant(best[o].evidenceAt!)))).toISOString() };
  return result;
}
export function rankArbitrage(opportunities: readonly ArbitrageOpportunity[]): ArbitrageOpportunity[] {
  for (const a of opportunities) { if (!Number.isFinite(a.theoreticalGrossROI) || a.theoreticalGrossROI <= 0) throw new RangeError("Only valid theoretical opportunities can be ranked."); instant(a.oldestEvidenceAt); text(a.fixture.id, "ranked event ID"); }
  return [...opportunities].sort((a, b) => b.theoreticalGrossROI - a.theoreticalGrossROI || instant(b.oldestEvidenceAt) - instant(a.oldestEvidenceAt) || compareId(a.fixture.id, b.fixture.id));
}
export function analyseSnapshot(snapshot: OddsSnapshot, now: number): ScanAnalysis {
  if (!Number.isFinite(now)) throw new RangeError("Invalid evaluation clock.");
  const ids = snapshot.markets.map((r) => r.fixture.id);
  if (new Set(ids).size !== ids.length) throw new RangeError("Duplicate fixture records cannot be joined.");
  const markets = snapshot.markets.map((row) => analyseFixtureMarket(row, snapshot, now)).sort((a, b) => compareId(a.fixture.id, b.fixture.id));
  const opportunities = rankArbitrage(markets.flatMap((r) => r.opportunity ? [r.opportunity] : []));
  return { status: opportunities.length ? "THEORETICAL ARBITRAGE" : markets.some((r) => r.status === "NO ARBITRAGE FOUND") ? "NO ARBITRAGE FOUND" : "INSUFFICIENT DATA",
    opportunities, markets, excluded: [...snapshot.excluded, ...markets.flatMap((r) => r.excluded)].sort((a, b) => compareId(a.eventId ?? "", b.eventId ?? "") || compareId(a.source, b.source) || compareId(a.reason, b.reason)), evaluatedAt: new Date(now).toISOString() };
}
