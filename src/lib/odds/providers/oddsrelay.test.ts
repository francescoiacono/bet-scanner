import { describe, expect, it, vi } from "vitest";
import { analyseSnapshot } from "../arbitrage";
import { BOOKS, board, NOW, SPORTS, usageBody } from "../test-helpers";
import { parseSportPage, parseUsage, parseVenues, scopeAllows } from "./oddsrelay-contract";
import { canonicalRequest, OddsProviderError, OddsRelayProvider, requestIdentity, tokenHeaders } from "./oddsrelay-http";
import { normalizeOddsRelay } from "./oddsrelay-normalize";

const request = canonicalRequest(["b", "a"]);
const normalize = (body: unknown = board()) => normalizeOddsRelay(body, BOOKS, SPORTS, ["a", "b"], NOW);
describe("official OddsRelay normalization", () => {
  it("maps exact teams/Draw, bookmaker identities, price and source references", () => {
    const b = board(), original = structuredClone(b), s = normalize(b), row = s.markets[0];
    expect(row.quotes).toHaveLength(6); expect(row.quotes.map((q) => q.outcome)).toEqual(["HOME", "HOME", "DRAW", "DRAW", "AWAY", "AWAY"]);
    expect(row.quotes[0]).toMatchObject({ decimalOdds: 2.2, bookmaker: { id: "a", isExchange: false }, evidenceAt: b.meta.last_seen.a.soccer, snapshotAt: b.meta.processed_at, side: "BACK", source: { eventId: "synthetic-event", pointer: "/data/0/markets/0/outcomes/0/back/0", marketKey: "h2h", outcomeName: "Northbridge" } });
    expect(analyseSnapshot(s, NOW).opportunities).toHaveLength(1); expect(b).toEqual(original);
  });
  it("never maps lay odds even when vastly better", () => { const b = board(); b.data[0].markets[0].outcomes[0].back = []; const s = normalize(b); expect(s.markets[0].quotes.some((q) => q.outcome === "HOME")).toBe(false); expect(analyseSnapshot(s, NOW).opportunities).toHaveLength(0); });
  it.each(["h2h_1st_half", "moneyline", "draw_no_bet", "double_chance", "asian_handicap", "h2h_extra_time"])("rejects nonstandard market %s", (key) => { const b = board(); b.data[0].markets[0].key = key; expect(normalize(b).markets).toHaveLength(0); });
  it("two-way/incomplete h2h cannot qualify as verified three-way arbitrage", () => { const b = board(); b.data[0].markets[0].outcomes = b.data[0].markets[0].outcomes.filter((o) => o.name !== "Draw"); const r = analyseSnapshot(normalize(b), NOW); expect(r.status).toBe("INSUFFICIENT DATA"); expect(r.markets[0].reasons).toContain("Missing eligible DRAW price"); });
  it.each(["HOME", "draw", "X", "Other Team"])("does not guess outcome identity %s", (name) => { const b = board(); b.data[0].markets[0].outcomes[0].name = name; expect(normalize(b).markets).toHaveLength(0); });
  it("does not fuzzy match team names or competition titles", () => {
    const b = board(); b.data[0].home_team = "Northbridge FC"; expect(normalize(b).markets).toHaveLength(0);
    const c = board(); c.data[0].sport_title = "Similar League"; expect(normalize(c).markets).toHaveLength(0);
  });
  it("unknown competitions and non-football records are excluded", () => { const b = board(); b.data[0].sport_key = "tennis_demo"; expect(normalize(b).markets).toHaveLength(0); expect(normalizeOddsRelay(board(), BOOKS, [{ ...SPORTS[0], group: "Tennis" }], ["a", "b"], NOW).markets).toHaveLength(0); });
  it("exchange venues appearing in back offers are excluded", () => { const s = normalizeOddsRelay(board(), BOOKS.map((b) => ({ ...b, isExchange: true })), SPORTS, ["a", "b"], NOW); expect(s.markets[0].quotes).toHaveLength(0); expect(s.excluded).toHaveLength(6); });
  it("unrequested/unknown/foreign-region bookmakers cannot supply prices", () => {
    const s = normalizeOddsRelay(board(), BOOKS.map((b) => ({ ...b, regions: ["us"] })), SPORTS, ["a", "b"], NOW); expect(s.markets[0].quotes).toHaveLength(0);
    const b = board(); b.data[0].markets[0].outcomes[0].back[0].bookmaker = "unknown"; expect(normalize(b).excluded[0].reason).toContain("Unverified");
    expect(normalizeOddsRelay(board(), BOOKS, SPORTS, ["c"], NOW).markets[0].quotes).toHaveLength(0);
  });
  it("null prices indicate unavailable offers rather than invented prices", () => { const b = board(); b.data[0].markets[0].outcomes[0].back.forEach((o) => o.price = null as unknown as number); expect(analyseSnapshot(normalize(b), NOW).status).toBe("INSUFFICIENT DATA"); });
  it("missing freshness never substitutes board or receipt time", () => { const b = board(); b.meta.last_seen = {} as typeof b.meta.last_seen; const s = normalize(b); expect(s.markets[0].quotes.every((q) => q.evidenceAt === null)).toBe(true); expect(analyseSnapshot(s, NOW).opportunities).toHaveLength(0); });
  it("uses soccer venue freshness, not full competition key", () => { const b = board(); b.meta.last_seen.a = { [SPORTS[0].key]: new Date(NOW).toISOString() } as typeof b.meta.last_seen.a; expect(normalize(b).markets[0].quotes.find((q) => q.bookmaker.id === "a")!.evidenceAt).toBeNull(); });
  it("duplicate fixture IDs invalidate all copies", () => { const b = board(); b.data.push(structuredClone(b.data[0])); b.meta.count = 2; expect(normalize(b).markets).toHaveLength(0); });
  it("duplicate outcomes, markets and line-bearing h2h are ambiguous", () => {
    const b = board(); b.data[0].markets[0].outcomes.push(b.data[0].markets[0].outcomes[0]); expect(normalize(b).markets).toHaveLength(0);
    const c = board(); c.data[0].markets.push(c.data[0].markets[0]); expect(normalize(c).markets).toHaveLength(0);
    const d = board(); Object.assign(d.data[0].markets[0].outcomes[0], { point: 0 }); expect(normalize(d).markets).toHaveLength(0);
  });
  it("rejects offer-specific incompatible settlement terms", () => { const b = board(); Object.assign(b.data[0].markets[0].outcomes[0].back[0], { places: 2 }); expect(normalize(b).excluded[0].reason).toContain("settlement"); });
  it("unrecognized market and availability metadata fail closed", () => { const b = board(); Object.assign(b.data[0].markets[0], { period: "FIRST_HALF" }); expect(normalize(b).markets).toHaveLength(0); const c = board(); Object.assign(c.data[0].markets[0].outcomes[0].back[0], { available: false }); expect(normalize(c).excluded[0].reason).toContain("availability"); });
  it.each(["feed_type", "region", "version", "odds_format", "processed_at", "count", "next_cursor"])("rejects inconsistent metadata %s", (key) => { const b = board(); Object.assign(b.meta, { [key]: "invalid" }); expect(() => normalize(b)).toThrow(); });
  it("rejects future processed_at and excludes already-started matches", () => { const b = board(NOW + 1); expect(() => normalize(b)).toThrow(); const c = board(); c.data[0].commence_time = new Date(NOW).toISOString(); expect(analyseSnapshot(normalize(c), NOW).opportunities).toHaveLength(0); });
});
describe("provider discovery and exact request shape", () => {
  it("reads account allowance without hardcoding 2500", () => { const u = usageBody(); u.tokens.limit = 777; u.tokens.remaining = 321; expect(parseUsage(u).usage).toMatchObject({ remaining: 321, limit: 777 }); });
  it("supports unlimited and unknown allowance without manufacturing numbers", () => { const u = usageBody(); u.tokens.remaining = "unlimited"; expect(parseUsage(u).usage.remaining).toBe("unlimited"); u.tokens.remaining = null; expect(parseUsage(u).usage.remaining).toBeNull(); });
  it("reads explicit venue kind and sport pagination", () => { expect(parseVenues({ data: [{ key: "x", name: "Exchange", is_exchange: true, regions: ["uk"] }] })[0].isExchange).toBe(true); expect(parseSportPage({ meta: { next_cursor: "next" }, data: SPORTS }).cursor).toBe("next"); });
  it("rejects missing/duplicate venue identity and kind", () => { const b = { key: "x", name: "X", is_exchange: false, regions: ["uk"] }; expect(() => parseVenues({ data: [b, b] })).toThrow(); expect(() => parseVenues({ data: [{ ...b, is_exchange: undefined }] })).toThrow(); });
  it("restricts products, regions, sports, markets and bookmakers by authenticated scope", () => {
    const account = parseUsage(usageBody()); expect(scopeAllows(account, "a")).toBe(true);
    account.scope = { products: { standard: { sports: ["soccer"], markets: ["h2h"], bookmakers: ["a"], exchanges: null } } };
    expect(scopeAllows(account, "a")).toBe(true); expect(scopeAllows(account, "b")).toBe(false);
    account.scope = { products: { standard: { sports: ["soccer_epl"], markets: ["h2h"], bookmakers: null } } }; expect(scopeAllows(account)).toBe(false);
    account.scope = null; account.products = ["raw"]; expect(scopeAllows(account)).toBe(false); account.products = ["standard"]; account.regions = ["us"]; expect(scopeAllows(account)).toBe(false);
  });
  it("canonicalizes bookmaker order and fixes product scope", () => { expect(requestIdentity(canonicalRequest(["a", "b"]))).toBe(requestIdentity(request)); expect(request).toEqual({ region: "uk", sports: "soccer", markets: "h2h", bookmakers: ["a", "b"] }); });
  it.each([[], ["a"], ["a", "a"], ["a", "b", "c", "d"], ["a", "bad&quote=false"], "a,b", null])("rejects unsafe/broad filter %s", (books) => expect(() => canonicalRequest(books)).toThrow());
});
describe("mocked HTTP only: OddsRelay wrappers", () => {
  function http(body: unknown = { cost: 100, remaining: 2400, rate_card: "test" }, status = 200, headers: Record<string, string> = {}) {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(status === 304 ? null : JSON.stringify(body), { status, headers }));
    return { fetcher, provider: new OddsRelayProvider("or_live_mock_only", fetcher, () => NOW) };
  }
  it("constructing provider performs no request", () => { const { fetcher } = http(); expect(fetcher).not.toHaveBeenCalled(); });
  it("Get quote always includes literal quote=true and never retrieves odds", async () => {
    const { provider, fetcher } = http(); await provider.quote(request); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0], u = new URL(String(url)); expect(u.pathname).toBe("/v2/odds/standard"); expect(u.searchParams.get("quote")).toBe("true");
    expect(u.searchParams.get("bookmakers")).toBe("a,b"); expect(u.toString()).not.toContain("or_live"); expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", headers: { Authorization: "Bearer or_live_mock_only", "Accept-Encoding": "gzip" } }); expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(["usage", "bookmakers", "sports", "events", "coverage", "pricing"] as const)("free %s wrapper uses only documented parameters", async (endpoint) => {
    const { provider, fetcher } = http({ data: [] }); await provider.free(endpoint); const u = new URL(String(fetcher.mock.calls[0][0]));
    expect(u.pathname).toBe(`/v2/${endpoint}`);
    expect([...u.searchParams.keys()]).toEqual(endpoint === "events" ? ["region", "sport"] : ["sports", "coverage"].includes(endpoint) ? ["region"] : []);
  });
  it("passes documented pagination cursor and rejects cursor on usage", async () => { const { provider, fetcher } = http({ data: [] }); await provider.free("events", "cursor"); expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("cursor")).toBe("cursor"); await expect(provider.free("usage", "cursor")).rejects.toThrow(); });
  it("one scan sends decimal-default envelope request and conditional ETag exactly", async () => { const { provider, fetcher } = http(board()); await provider.scan(request, '"etag"'); const [url, opts] = fetcher.mock.calls[0]; expect(new URL(String(url)).searchParams.has("quote")).toBe(false); expect(opts?.headers).toMatchObject({ "If-None-Match": '"etag"' }); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("rejects unsupported sports/markets instead of extending the paid request", async () => { const { provider, fetcher } = http(); await expect(provider.quote({ ...request, sports: "tennis" as "soccer" })).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled(); });
  it.each([401, 402, 403, 429, 500, 503])("surfaces %s and Retry-After without retries or secret messages", async (status) => {
    const { provider, fetcher } = http({ error: { code: "provider_error", message: "or_live_mock_only" } }, status, { "Retry-After": "30", "X-Tokens-Cost": "0" });
    try { await provider.scan(request); expect.fail("Expected refusal"); } catch (e) { expect(e).toBeInstanceOf(OddsProviderError); const d = (e as OddsProviderError).detail; expect(d.status).toBe(status); expect(d.retryAfter).toBe("30"); expect(JSON.stringify(d)).not.toContain("or_live_mock_only"); } expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles empty gateway/rate-limit bodies", async () => { const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 429, headers: { "Retry-After": "10" } })); await expect(new OddsRelayProvider("mock", fetcher).scan(request)).rejects.toMatchObject({ detail: { code: "HTTP_429", retryAfter: "10" } }); });
  it("ambiguous network failure never retries", async () => { const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("secret"); }); await expect(new OddsRelayProvider("secret", fetcher).scan(request)).rejects.toMatchObject({ detail: { code: "NETWORK_UNCERTAIN" } }); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("optional token headers remain null, while all five actual headers are captured", () => {
    expect(tokenHeaders(new Headers())).toEqual({ cost: null, used: null, remaining: null, limit: null, resetsAt: null });
    expect(tokenHeaders(new Headers({ "X-Tokens-Cost": "123", "X-Tokens-Used": "223", "X-Tokens-Remaining": "2277", "X-Tokens-Limit": "2500", "X-Tokens-Reset": "2026-11-01T00:00:00Z" }))).toMatchObject({ cost: 123, used: 223, remaining: 2277, limit: 2500 });
    expect(tokenHeaders(new Headers({ "X-Tokens-Remaining": "unlimited" })).remaining).toBe("unlimited"); expect(() => tokenHeaders(new Headers({ "X-Tokens-Cost": "-1" }))).toThrow();
  });
  it("free discovery reuses ETag/304 only with valid cached body", async () => {
    const { provider, fetcher } = http({ data: [] }, 200, { ETag: '"catalogue"' }); await provider.free("bookmakers"); fetcher.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const r = await provider.free("bookmakers"); expect(r.body).toEqual({ data: [] }); expect(r.unchanged).toBe(true); expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "If-None-Match": '"catalogue"' });
  });
  it("expired discovery cache is not conditionally reused", async () => {
    let now = NOW; const fetcher = vi.fn<typeof fetch>(async () => new Response('{"data":[]}', { headers: { ETag: '"catalogue"' } })), p = new OddsRelayProvider("mock", fetcher, () => now);
    await p.free("bookmakers"); now += 120000; await p.free("bookmakers"); expect(fetcher.mock.calls[1][1]?.headers).not.toHaveProperty("If-None-Match");
  });
  it("304 without discovery cache fails instead of fetching again", async () => { const { provider, fetcher } = http(null, 304); await expect(provider.free("bookmakers")).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("free quote rejects odds-shaped responses, 304 and unexpected token spending", async () => {
    await expect(http(board()).provider.quote(request)).rejects.toThrow(); await expect(http(null, 304).provider.quote(request)).rejects.toThrow(); await expect(http({ cost: 100, remaining: 2400 }, 200, { "X-Tokens-Cost": "100" }).provider.quote(request)).rejects.toThrow();
  });
});
