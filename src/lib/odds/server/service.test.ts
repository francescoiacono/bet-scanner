import { describe, expect, it } from "vitest";
import { mockProvider, NOW, relayResponse, USAGE } from "../test-helpers";
import { OddsProviderError } from "../providers/oddsrelay-http";
import { OddsScannerService } from "./service";

function harness() {
  let now = NOW, counter = 0; const mock = mockProvider(() => now);
  const service = new OddsScannerService(mock.provider, () => now, () => `approval-${++counter}`);
  return { ...mock, service, advance: (ms: number) => { now += ms; }, now: () => now };
}
async function approved(h: ReturnType<typeof harness>, owner = "browser") { await h.service.discover(); return h.service.quote(owner, ["a", "b"]); }
describe("manual quote/confirmation and budget gate", () => {
  it("startup and all free discovery actions spend no odds tokens", async () => {
    const h = harness(); expect(h.provider.free).not.toHaveBeenCalled(); await h.service.discover(); await h.service.events(); await h.service.pricing();
    expect(h.provider.scan).not.toHaveBeenCalled(); expect(h.provider.quote).not.toHaveBeenCalled(); expect(h.provider.free.mock.calls.map(([name]) => name)).toEqual(["usage", "bookmakers", "coverage", "sports", "events", "pricing"]);
  });
  it("quote binds exact canonical request and gets remaining allowance from real usage", async () => {
    const h = harness(), q = await approved(h); expect(q).toMatchObject({ cost: 100, usage: { remaining: 2400 }, projectedRemaining: 2300, createdAt: "2026-10-08T12:00:00.000Z", expiresAt: "2026-10-08T12:01:00.000Z" });
    expect(h.provider.quote).toHaveBeenCalledWith({ region: "uk", sports: "soccer", markets: "h2h", bookmakers: ["a", "b"] }); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("only a matching confirmation performs one odds request and shows actual header usage", async () => {
    const h = harness(), q = await approved(h); h.provider.scan.mockResolvedValueOnce(relayResponse(h.state.body, { usage: { ...USAGE, cost: 97, remaining: 2303 } }));
    const r = await h.service.confirm("browser", q.approvalId!, ["b", "a"]); expect(h.provider.scan).toHaveBeenCalledTimes(1); expect(r.quotedCost).toBe(100); expect(r.usage.cost).toBe(97); expect(r.analysis.opportunities).toHaveLength(1);
  });
  it("missing approval, foreign browser and mismatching request cannot spend", async () => {
    const h = harness(), q = await approved(h);
    await expect(h.service.confirm("browser", "absent", ["a", "b"])).rejects.toMatchObject({ detail: { code: "APPROVAL_MISSING" } });
    await expect(h.service.confirm("other", q.approvalId!, ["a", "b"])).rejects.toThrow();
    await expect(h.service.confirm("browser", q.approvalId!, ["a", "c"])).rejects.toMatchObject({ detail: { code: "APPROVAL_MISMATCH" } }); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("changing the returned request object cannot change the stored approval", async () => {
    const h = harness(), q = await approved(h); q.request.bookmakers[0] = "c";
    await expect(h.service.confirm("browser", q.approvalId!, q.request.bookmakers)).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("exactly 60 seconds expires the approval; 59999 ms remains valid", async () => {
    const a = harness(), qa = await approved(a); a.advance(60000); await expect(a.service.confirm("browser", qa.approvalId!, ["a", "b"])).rejects.toThrow(); expect(a.provider.scan).not.toHaveBeenCalled();
    const b = harness(), qb = await approved(b); b.advance(59999); await b.service.confirm("browser", qb.approvalId!, ["a", "b"]); expect(b.provider.scan).toHaveBeenCalledTimes(1);
  });
  it("parallel duplicate confirmations consume the approval before any await", async () => {
    const h = harness(), q = await approved(h), r = await Promise.allSettled([h.service.confirm("browser", q.approvalId!, ["a", "b"]), h.service.confirm("browser", q.approvalId!, ["a", "b"])]);
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1); expect(h.provider.scan).toHaveBeenCalledTimes(1); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow();
  });
  it("different-browser concurrent spending is serialized and not retried", async () => {
    const h = harness(), a = await approved(h, "a"), b = await h.service.quote("b", ["a", "b"]);
    const r = await Promise.allSettled([h.service.confirm("a", a.approvalId!, ["a", "b"]), h.service.confirm("b", b.approvalId!, ["a", "b"])]);
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1); expect(h.provider.scan).toHaveBeenCalledTimes(1);
  });
  it("new quotes invalidate all earlier approvals for that browser", async () => { const h = harness(), q = await approved(h); await h.service.quote("browser", ["a", "c"]); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it("a blocked new quote also invalidates earlier approvals", async () => { const h = harness(), q = await approved(h); h.state.cost = 501; await h.service.quote("browser", ["a", "b"]); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); });
  it.each([501, 1000, 999999])("blocks a %s-token quote before spending", async (cost) => { const h = harness(); h.state.cost = cost; const q = await approved(h); expect(q.approvalId).toBeNull(); expect(q.blocked[0]).toContain("500-token"); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it("allows exactly the 500-token ceiling", async () => { const h = harness(); h.state.cost = 500; const q = await approved(h); expect(q.approvalId).not.toBeNull(); await h.service.confirm("browser", q.approvalId!, ["a", "b"]); expect(h.provider.scan).toHaveBeenCalledTimes(1); });
  it("blocks exhausted/unknown quota and never trusts quote.remaining", async () => {
    for (const remaining of [0, 99, null]) { const h = harness(); h.state.account.tokens.remaining = remaining; const q = await approved(h); expect(q.approvalId).toBeNull(); expect(q.projectedRemaining).toBeNull(); expect(h.provider.scan).not.toHaveBeenCalled(); }
  });
  it("supports unlimited account limits without substituting a numeric balance", async () => { const h = harness(); h.state.account.tokens.remaining = "unlimited"; const q = await approved(h); expect(q.projectedRemaining).toBe("unlimited"); expect(q.usage.remaining).toBe("unlimited"); });
  it("rechecks usage immediately before spending and consumes failed approval", async () => { const h = harness(), q = await approved(h); h.state.account.tokens.remaining = 0; await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); h.state.account.tokens.remaining = 2400; await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it("usage-check delay cannot extend approval lifetime", async () => { const h = harness(), q = await approved(h); h.provider.free.mockImplementationOnce(async () => { h.advance(60000); return relayResponse(h.state.account); }); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it("plan/scope changes at confirmation block spending", async () => { const h = harness(), q = await approved(h); h.state.account.key.products = ["raw"]; await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it("network uncertainty and quota errors never retry or allow approval reuse", async () => {
    for (const code of ["NETWORK_UNCERTAIN", "insufficient_tokens"]) { const h = harness(), q = await approved(h); h.provider.scan.mockRejectedValueOnce(new OddsProviderError({ code, status: 402, retryAfter: null, message: "No retry" })); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).toHaveBeenCalledTimes(1); }
  });
  it("missing actual token headers remain unknown rather than using quote estimates", async () => { const h = harness(), q = await approved(h); h.provider.scan.mockResolvedValueOnce(relayResponse(h.state.body, { usage: { cost: null, used: null, remaining: null, limit: null, resetsAt: null } })); const r = await h.service.confirm("browser", q.approvalId!, ["a", "b"]); expect(r.usage.cost).toBeNull(); expect(r.usage.remaining).toBeNull(); });
  it("invalid paid response retains actual token headers in the error", async () => { const h = harness(), q = await approved(h); h.provider.scan.mockResolvedValueOnce(relayResponse({}, { usage: { ...USAGE, cost: 100 } })); await expect(h.service.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toMatchObject({ detail: { code: "INVALID_ODDS_DATA", usage: { cost: 100 } } }); expect(h.provider.scan).toHaveBeenCalledTimes(1); });
  it("restart cannot redeem an approval from a previous service instance", async () => { const h = harness(), q = await approved(h), restarted = new OddsScannerService(h.provider, h.now, () => "new"); await expect(restarted.confirm("browser", q.approvalId!, ["a", "b"])).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled(); });
});
describe("fresh authenticated discovery and coverage", () => {
  it("no discovery means no quote request", async () => { const h = harness(); await expect(h.service.quote("browser", ["a", "b"])).rejects.toThrow(); expect(h.provider.quote).not.toHaveBeenCalled(); });
  it("discovery expires at 60 seconds", async () => { const h = harness(); await h.service.discover(); h.advance(60000); await expect(h.service.quote("browser", ["a", "b"])).rejects.toThrow(); expect(h.provider.quote).not.toHaveBeenCalled(); });
  it("one covered venue is insufficient despite three global catalogue entries", async () => { const h = harness(); h.state.coverageBooks = ["a"]; const d = await h.service.discover(); expect(d.restrictions.join(" ")).toContain("Fewer than two"); await expect(h.service.quote("browser", ["a", "b"])).rejects.toThrow(); expect(h.provider.quote).not.toHaveBeenCalled(); });
  it("stale coverage cannot be selected", async () => { const h = harness(); h.state.seenAt = NOW - 120001; const d = await h.service.discover(); expect(d.bookmakers.every((b) => !b.eligible)).toBe(true); await expect(h.service.quote("browser", ["a", "b"])).rejects.toThrow(); });
  it("scope restrictions prohibit market/bookmaker selections before quote", async () => { const h = harness(); h.state.account.scope = { products: { standard: { sports: ["soccer"], markets: ["totals"], bookmakers: null } } }; const d = await h.service.discover(); expect(d.restrictions).not.toHaveLength(0); await expect(h.service.quote("browser", ["a", "b"])).rejects.toThrow(); expect(h.provider.quote).not.toHaveBeenCalled(); });
  it("bookmaker-specific scope is enforced", async () => { const h = harness(); h.state.account.scope = { products: { standard: { sports: null, markets: null, bookmakers: ["a", "b"] } } }; await h.service.discover(); await expect(h.service.quote("browser", ["a", "c"])).rejects.toThrow(); expect(h.provider.quote).not.toHaveBeenCalled(); });
  it("sports discovery walks free pages only as part of explicit discovery", async () => {
    const h = harness(), original = h.provider.free.getMockImplementation()!;
    h.provider.free.mockImplementation(async (endpoint, cursor) => endpoint === "sports" && !cursor ? relayResponse({ meta: { next_cursor: "next" }, data: [] }) : original(endpoint, cursor));
    const d = await h.service.discover(); expect(d.competitionCount).toBe(1); expect(h.provider.free).toHaveBeenCalledWith("sports", "next"); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("an unrelated catalogue title with a trailing tab cannot block football discovery on a later page", async () => {
    const h = harness(), original = h.provider.free.getMockImplementation()!;
    h.state.account.key.regions = [];
    h.provider.free.mockImplementation(async (endpoint, cursor) => endpoint === "sports" && !cursor
      ? relayResponse({ meta: { next_cursor: "next" }, data: [{ key: "basketball_lega_a", title: "Lega A\t", group: "Basketball", active: true, regions: ["uk"], markets: ["h2h"] }] })
      : original(endpoint, cursor));
    const discovery = await h.service.discover();
    expect(discovery.competitionCount).toBe(1); expect(discovery.bookmakers.filter((b) => b.eligible)).toHaveLength(3);
    expect(h.provider.free).toHaveBeenCalledWith("sports", "next");
    expect(h.provider.quote).not.toHaveBeenCalled(); expect(h.provider.scan).not.toHaveBeenCalled();
  });
});
describe("approved conditional odds requests and cache", () => {
  it("ETag never bypasses quote and confirmation; 304 retains original snapshot", async () => {
    const h = harness(), q = await approved(h), first = await h.service.confirm("browser", q.approvalId!, ["a", "b"]);
    const quoted = await h.service.quote("browser", ["a", "b"]); expect(h.provider.scan).toHaveBeenCalledTimes(1);
    h.provider.scan.mockResolvedValueOnce(relayResponse(null, { unchanged: true, usage: { ...USAGE, cost: 0 } }));
    const second = await h.service.confirm("browser", quoted.approvalId!, ["a", "b"]); expect(h.provider.scan).toHaveBeenLastCalledWith(quoted.request, '"synthetic-etag"'); expect(second.unchanged).toBe(true); expect(second.snapshot).toEqual(first.snapshot); expect(second.usage.cost).toBe(0);
  });
  it("unchanged 304 cannot refresh stale price evidence", async () => {
    const h = harness(), q = await approved(h); await h.service.confirm("browser", q.approvalId!, ["a", "b"]); h.advance(121000); h.state.seenAt = h.now();
    await h.service.discover(); const second = await h.service.quote("browser", ["a", "b"]); h.provider.scan.mockResolvedValueOnce(relayResponse(null, { unchanged: true }));
    const result = await h.service.confirm("browser", second.approvalId!, ["a", "b"]); expect(result.analysis.status).toBe("INSUFFICIENT DATA"); expect(result.analysis.opportunities).toHaveLength(0); expect(result.snapshot.receivedAt).toBe(new Date(NOW).toISOString());
  });
  it("expired cache does not send ETag and a 304 without cache never causes a second call", async () => {
    const h = harness(), q = await approved(h); await h.service.confirm("browser", q.approvalId!, ["a", "b"]); h.advance(300000); h.state.seenAt = h.now(); await h.service.discover(); const second = await h.service.quote("browser", ["a", "b"]);
    h.provider.scan.mockResolvedValueOnce(relayResponse(null, { unchanged: true })); await expect(h.service.confirm("browser", second.approvalId!, ["a", "b"])).rejects.toMatchObject({ detail: { code: "CACHE_MISSING" } }); expect(h.provider.scan).toHaveBeenLastCalledWith(second.request, undefined); expect(h.provider.scan).toHaveBeenCalledTimes(2);
  });
  it("cached snapshots are isolated by exact bookmaker request", async () => { const h = harness(), q = await approved(h); await h.service.confirm("browser", q.approvalId!, ["a", "b"]); const other = await h.service.quote("browser", ["a", "c"]); await h.service.confirm("browser", other.approvalId!, ["a", "c"]); expect(h.provider.scan).toHaveBeenLastCalledWith(other.request, undefined); });
});
