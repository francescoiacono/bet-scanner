import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { board, mockProvider, NOW, relayResponse, USAGE } from "../test-helpers";
import { canonicalRequest } from "../providers/oddsrelay-http";
import { createOddsHandler } from "./handler";
import { OddsScannerService } from "./service";
import { FileScanHistory } from "./scan-history";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function harness() {
  const root = await mkdtemp(join(tmpdir(), "bet-scanner-integration-")); roots.push(root);
  let now = NOW; const clock = () => now, mock = mockProvider(clock), store = new FileScanHistory(root, clock);
  const newService = () => new OddsScannerService(mock.provider, clock, randomUUID, new FileScanHistory(root, clock));
  return { ...mock, root, store, clock, service: newService(), newService, advance: (ms: number) => { now += ms; mock.state.seenAt = now; } };
}
async function approve(service: OddsScannerService, books = ["a", "b"]) { await service.discover(); return service.quote("browser", books); }
async function firstScan(h: Awaited<ReturnType<typeof harness>>) { const q = await approve(h.service); return h.service.confirm("browser", q.approvalId!, q.request.bookmakers); }
function localRequest(body: unknown, origin = "http://127.0.0.1:3000") {
  return new Request("http://127.0.0.1:3000/api/odds", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("provider-isolated local history and approved refresh", () => {
  it.each(["LIVE", "DEMO"])("history in %s works without a key, cookie, discovery or any provider call", async (mode) => {
    const h = await harness(), first = await firstScan(h);
    h.provider.free.mockClear(); h.provider.quote.mockClear(); h.provider.scan.mockClear();
    const getService = vi.fn(() => { throw new Error("Provider must not be constructed"); });
    const session = vi.fn(() => { throw new Error("No session needed"); });
    const handle = createOddsHandler(getService, h.clock, session, () => new FileScanHistory(h.root, h.clock));
    const r = await handle(localRequest({ action: "history", mode, id: first.historyId })), result = await r.json();
    expect(r.status).toBe(200); expect(r.headers.get("Set-Cookie")).toBeNull(); expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(result).toMatchObject({ readCost: 0, view: { readOnly: true, originalUsage: { cost: 100 } } });
    expect(result.usage).toBeUndefined(); expect(JSON.stringify(result)).not.toContain('"etag"');
    expect(getService).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
    expect(h.provider.free).not.toHaveBeenCalled(); expect(h.provider.quote).not.toHaveBeenCalled(); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("local history keeps loopback, same-origin and strict field guards", async () => {
    const h = await harness(), browse = vi.spyOn(h.store, "browse"), getService = vi.fn(() => h.service);
    const handle = createOddsHandler(getService, h.clock, randomUUID, () => h.store);
    expect((await handle(localRequest({ action: "history", mode: "LIVE" }, "https://example.test"))).status).toBe(403);
    expect((await handle(localRequest({ action: "history", mode: "LIVE", path: "../../file" }))).status).toBe(400);
    expect((await handle(localRequest({ action: "history", mode: "LIVE", id: "../../file" }))).status).toBe(409);
    const get = await handle(new Request("http://127.0.0.1:3000/api/odds")); expect(get.status).toBe(405);
    expect(browse).toHaveBeenCalledTimes(1); expect(getService).not.toHaveBeenCalled(); expect(h.provider.free).not.toHaveBeenCalled();
  });
  it("a restarted approved refresh sends the exact saved weak ETag and 304 preserves stale evidence", async () => {
    const h = await harness(); h.provider.scan.mockResolvedValueOnce(relayResponse(h.state.body, { etag: 'W/"exact-saved-tag"', usage: { ...USAGE, cost: 97 } }));
    const first = await firstScan(h); expect(first.historyWarning).toBeNull(); h.advance(301_000);
    const service = h.newService(), quote = await approve(service);
    expect(h.provider.scan).toHaveBeenCalledTimes(1);
    h.provider.scan.mockResolvedValueOnce(relayResponse(null, { unchanged: true, usage: { ...USAGE, cost: 0 } }));
    const second = await service.confirm("browser", quote.approvalId!, quote.request.bookmakers);
    expect(h.provider.scan).toHaveBeenLastCalledWith(quote.request, 'W/"exact-saved-tag"');
    expect(second.snapshot.receivedAt).toBe(first.snapshot.receivedAt); expect(second.snapshot.processedAt).toBe(first.snapshot.processedAt);
    expect(second.snapshot.markets[0].quotes.map((q) => q.evidenceAt)).toEqual(first.snapshot.markets[0].quotes.map((q) => q.evidenceAt));
    expect(second.analysis.opportunities).toEqual([]); expect(second.usage.cost).toBe(0);
    const history = await h.store.browse(); expect(history.entries).toHaveLength(2);
    expect(history.entries[0]).toMatchObject({ id: second.historyId, unchanged: true, originalUsage: { cost: 0 } });
    expect(history.entries[1].originalUsage.cost).toBe(97);
    expect((await h.store.browse(first.historyId!)).view!.originalAnalysis.opportunities).toHaveLength(1);
  });
  it("304 with missing actual headers stays unknown, never substitutes zero or quoted cost", async () => {
    const h = await harness(); await firstScan(h); const service = h.newService(), q = await approve(service);
    h.provider.scan.mockResolvedValueOnce(relayResponse(null, { unchanged: true, usage: { cost: null, used: null, remaining: null, limit: null, resetsAt: null } }));
    const r = await service.confirm("browser", q.approvalId!, q.request.bookmakers);
    expect(r.usage.cost).toBeNull(); expect((await h.store.browse()).view!.originalUsage.cost).toBeNull();
  });
  it("200 updated data creates a new snapshot and records the actual receipt rather than the quote", async () => {
    const h = await harness(), first = await firstScan(h); h.advance(301_000); const service = h.newService(), q = await approve(service);
    h.provider.scan.mockResolvedValueOnce(relayResponse(board(h.clock()), { etag: '"updated"', usage: { ...USAGE, cost: 83, remaining: 2217 } }));
    const r = await service.confirm("browser", q.approvalId!, q.request.bookmakers);
    expect(h.provider.scan).toHaveBeenLastCalledWith(q.request, '"synthetic-etag"'); expect(r.quotedCost).toBe(100); expect(r.usage.cost).toBe(83);
    expect(r.historyId).not.toBe(first.historyId); expect(r.snapshot.receivedAt).toBe(new Date(h.clock()).toISOString());
    expect((await h.store.browse()).entries[0].originalUsage).toEqual(r.usage);
    expect((await h.store.latestForRequest(q.request))!.etag).toBe('"updated"');
  });
  it("different bookmaker filters cannot reuse another request's persisted ETag", async () => {
    const h = await harness(); await firstScan(h); const service = h.newService(), q = await approve(service, ["a", "c"]);
    await service.confirm("browser", q.approvalId!, q.request.bookmakers);
    expect(h.provider.scan).toHaveBeenLastCalledWith(canonicalRequest(["a", "c"]), undefined);
  });
  it("old approvals cannot survive a restart; duplicate approved confirmations charge at most once", async () => {
    const h = await harness(), old = await approve(h.service), service = h.newService();
    await expect(service.confirm("browser", old.approvalId!, old.request.bookmakers)).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled();
    const q = await approve(service), results = await Promise.allSettled([service.confirm("browser", q.approvalId!, q.request.bookmakers), service.confirm("browser", q.approvalId!, q.request.bookmakers)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect(h.provider.scan).toHaveBeenCalledTimes(1); expect((await h.store.browse()).entries).toHaveLength(1);
  });
  it("disk delay cannot extend an approval, including while duplicate confirmation races it", async () => {
    const h = await harness();
    const lookup = vi.spyOn(h.store, "latestForRequest").mockImplementation(async () => { h.advance(60_000); return undefined; });
    const service = new OddsScannerService(h.provider, h.clock, randomUUID, h.store), q = await approve(service);
    await expect(service.confirm("browser", q.approvalId!, q.request.bookmakers)).rejects.toMatchObject({ detail: { code: "SCAN_BLOCKED" } });
    await expect(service.confirm("browser", q.approvalId!, q.request.bookmakers)).rejects.toMatchObject({ detail: { code: "APPROVAL_MISSING" } });
    expect(lookup).toHaveBeenCalledTimes(1); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("corrupt history cannot cause an automatic unconditional refresh or provider fallback", async () => {
    const h = await harness(); await firstScan(h); await writeFile(join(h.root, "data/private/odds-history/history.json"), "corrupt");
    const service = h.newService(), q = await approve(service); h.provider.scan.mockClear();
    await expect(service.confirm("browser", q.approvalId!, q.request.bookmakers)).rejects.toThrow(); expect(h.provider.scan).not.toHaveBeenCalled();
    h.provider.free.mockClear(); const handle = createOddsHandler(() => service, h.clock, randomUUID, () => h.store);
    const r = await handle(localRequest({ action: "history", mode: "LIVE" })); expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("HISTORY_UNAVAILABLE"); expect(h.provider.free).not.toHaveBeenCalled();
  });
  it("a persistence failure after a charge keeps live results and actual receipt, with no retry", async () => {
    const h = await harness(); vi.spyOn(h.store, "save").mockRejectedValue(new Error("Disk failure"));
    const service = new OddsScannerService(h.provider, h.clock, randomUUID, h.store), q = await approve(service);
    const r = await service.confirm("browser", q.approvalId!, q.request.bookmakers);
    expect(r.historyId).toBeNull(); expect(r.historyWarning).toContain("completed scan"); expect(r.usage.cost).toBe(100);
    expect(r.analysis.opportunities).toHaveLength(1); expect(h.provider.scan).toHaveBeenCalledTimes(1);
    await expect(service.confirm("browser", q.approvalId!, q.request.bookmakers)).rejects.toThrow(); expect(h.provider.scan).toHaveBeenCalledTimes(1);
  });
  it("new conditional refreshes remain subject to fresh discovery and the 500-token ceiling", async () => {
    const h = await harness(); await firstScan(h); const service = h.newService();
    await expect(service.quote("browser", ["a", "b"])).rejects.toThrow();
    h.state.cost = 501; const q = await approve(service); expect(q.approvalId).toBeNull();
    expect(h.provider.scan).toHaveBeenCalledTimes(1);
    const raw = await readFile(join(h.root, "data/private/odds-history/history.json"), "utf8"); expect(raw).not.toContain("approvalId"); expect(raw).not.toContain("browser");
  });
});
