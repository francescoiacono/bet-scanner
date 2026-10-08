import { vi } from "vitest";
import type { ProviderUsage } from "./types";
import type { AccountInfo, SportInfo, VenueInfo } from "./providers/oddsrelay-contract";
import type { OddsProvider, RelayResponse } from "./providers/oddsrelay-http";

export const NOW = Date.parse("2026-10-08T12:00:00Z");
export const BOOKS: VenueInfo[] = ["a", "b", "c"].map((id) => ({ id, name: `Synthetic Book ${id.toUpperCase()}`, regions: ["uk"], isExchange: false }));
export const SPORTS: SportInfo[] = [{ key: "soccer_demo_league", title: "Synthetic League", group: "Football", active: true, regions: ["uk"], markets: ["h2h"] }];
export const USAGE: ProviderUsage = { cost: null, used: 100, remaining: 2400, limit: 2500, resetsAt: "2026-11-01T00:00:00Z" };
export function usageBody() {
  return { plan: "free", rate_card: "test", account: { status: "active", suspension_reason: null, test: false }, tokens: { used: 100, remaining: 2400 as number | string | null, limit: 2500 as number | string | null, resets_at: USAGE.resetsAt },
    key: { id: "not-a-secret", kind: "server", products: ["standard"], regions: ["uk"], token_cap: null, tokens_used: null }, regions: ["uk"], flood_cap: { per_10s: 10, per_min: 30 }, scope: null as AccountInfo["scope"], scope_version: null };
}
export function board(now = NOW) {
  return { meta: { feed_type: "standard", region: "uk", odds_format: "decimal", version: "v2", processed_at: new Date(now).toISOString(), next_cursor: null, count: 1,
    last_seen: { a: { soccer: new Date(now - 10_000).toISOString() }, b: { soccer: new Date(now - 20_000).toISOString() }, c: { soccer: new Date(now - 30_000).toISOString() } } },
    data: [{ event_id: "synthetic-event", sport_key: SPORTS[0].key, sport_title: SPORTS[0].title, home_team: "Northbridge", away_team: "Harbour", commence_time: new Date(now + 3_600_000).toISOString(), markets: [{ key: "h2h", outcomes: [
      { name: "Northbridge", back: [{ bookmaker: "a", price: 2.2, link: null }, { bookmaker: "b", price: 2.1, link: null }], lay: [{ exchange: "exchange", price: 1000, available: 1000, link: null }] },
      { name: "Draw", back: [{ bookmaker: "a", price: 3.5, link: null }, { bookmaker: "b", price: 3.8, link: null }] },
      { name: "Harbour", back: [{ bookmaker: "a", price: 4, link: null }, { bookmaker: "b", price: 3.6, link: null }] },
    ] }] }] };
}
export function relayResponse(body: unknown, extra: Partial<RelayResponse> = {}): RelayResponse { return { body, usage: { ...USAGE, cost: 0 }, etag: null, unchanged: false, ...extra }; }
export function mockProvider(now: () => number = () => NOW) {
  const state = { account: usageBody(), cost: 100, body: board(now()), coverageBooks: ["a", "b", "c"], seenAt: now() - 10000 };
  const free = vi.fn<OddsProvider["free"]>(async (endpoint) => {
    if (endpoint === "usage") return relayResponse(state.account);
    if (endpoint === "bookmakers") return relayResponse({ data: BOOKS.map((b) => ({ key: b.id, name: b.name, regions: b.regions, is_exchange: b.isExchange })) });
    if (endpoint === "sports") return relayResponse({ meta: { next_cursor: null }, data: SPORTS });
    if (endpoint === "coverage") return relayResponse({ region: "uk", products: { standard: { bookmakers: state.coverageBooks.map((id) => ({ key: id, name: id, sports: { soccer: { events: 10, last_seen: new Date(state.seenAt).toISOString() } } })), exchanges: [] } } });
    if (endpoint === "events") return relayResponse({ meta: { next_cursor: null }, data: [] });
    return relayResponse({ rate_card: "test", regions: { uk: {} } });
  });
  const quote = vi.fn<OddsProvider["quote"]>(async () => ({ cost: state.cost, remaining: 2400, rateCard: "test" }));
  const scan = vi.fn<OddsProvider["scan"]>(async () => relayResponse(state.body, { usage: { ...USAGE, cost: state.cost, remaining: 2400 - state.cost }, etag: '"synthetic-etag"' }));
  return { provider: { free, quote, scan }, state };
}
