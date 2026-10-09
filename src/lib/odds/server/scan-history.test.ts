import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { analyseSnapshot } from "../arbitrage";
import { canonicalRequest } from "../providers/oddsrelay-http";
import { normalizeOddsRelay } from "../providers/oddsrelay-normalize";
import { board, BOOKS, NOW, SPORTS, USAGE } from "../test-helpers";
import { FileScanHistory, HISTORY_LIMITS, type NewSavedScan } from "./scan-history";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function harness() {
  const root = await mkdtemp(join(tmpdir(), "bet-scanner-history-")); roots.push(root);
  let now = NOW;
  const clock = () => now, store = new FileScanHistory(root, clock);
  return { root, store, clock, advance: (ms: number) => { now += ms; }, path: join(root, "data/private/odds-history/history.json") };
}
function scan(at = NOW): NewSavedScan {
  return { scannedAt: new Date(at).toISOString(), request: canonicalRequest(["b", "a"]), etag: 'W/"exact-v1"',
    snapshot: normalizeOddsRelay(board(at), BOOKS, SPORTS, ["a", "b"], at), originalUsage: { ...USAGE, cost: 97 }, unchanged: false };
}
function math(snapshot: NewSavedScan["snapshot"], now: number) {
  const analysis = analyseSnapshot(snapshot, now);
  return { status: analysis.status, excluded: analysis.excluded, markets: analysis.markets.map((m) => ({ status: m.status, reasons: m.reasons, s: m.inverseOddsSum })), opportunities: analysis.opportunities.map((a) => ({ id: a.fixture.id, roi: a.theoreticalGrossROI, s: a.inverseOddsSum, fractions: a.illustrativeFractions, payout: a.grossPayoutPerUnit, evidence: a.oldestEvidenceAt })) };
}
async function replaceEnvelope(path: string, update: (records: Record<string, unknown>[]) => void) {
  const envelope = JSON.parse(await readFile(path, "utf8")); update(envelope.records);
  envelope.checksum = createHash("sha256").update(JSON.stringify(envelope.records)).digest("hex");
  await writeFile(path, JSON.stringify(envelope));
}

describe("bounded private scan history", () => {
  it("construction and empty local reads make no requests or files", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    const h = await harness(); expect(await readdir(h.root)).toEqual([]);
    expect(await h.store.browse()).toEqual({ readCost: 0, entries: [], view: null });
    expect(await readdir(h.root)).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it("survives a new store instance and preserves exact ETag, odds, timestamps and math", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")), h = await harness(), input = scan();
    const saved = await h.store.save(input), restarted = new FileScanHistory(h.root, h.clock);
    const read = await restarted.browse(saved.id), latest = await restarted.latestForRequest(canonicalRequest(["a", "b"]));
    expect(read.readCost).toBe(0); expect(read.view).toMatchObject({ readOnly: true, scannedAt: input.scannedAt, originalUsage: { cost: 97 }, snapshot: { receivedAt: input.snapshot.receivedAt, processedAt: input.snapshot.processedAt } });
    expect(latest!.etag).toBe('W/"exact-v1"'); expect(math(read.view!.snapshot, NOW)).toEqual(math(input.snapshot, NOW));
    expect(await restarted.latestForRequest(canonicalRequest(["a", "c"]))).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });
  it("re-evaluates stale and started fixtures without changing original research or evidence", async () => {
    const h = await harness(), saved = await h.store.save(scan()), initial = (await h.store.browse(saved.id)).view!;
    h.advance(120_001); const stale = (await h.store.browse(saved.id)).view!;
    expect(stale.originalAnalysis).toEqual(initial.originalAnalysis); expect(stale.currentAnalysis.opportunities).toEqual([]);
    expect(stale.currentAnalysis.excluded.some((e) => e.reason.startsWith("Stale"))).toBe(true);
    expect(stale.snapshot).toEqual(initial.snapshot); expect(stale.ageMs).toBe(120_001);
    h.advance(3_600_000); expect((await h.store.browse()).view!.currentAnalysis.markets[0].reasons).toContain("Fixture has already started");
  });
  it("uses the unchanged inclusive 120-second evidence boundary", async () => {
    const h = await harness(), input = scan();
    for (const q of input.snapshot.markets[0].quotes) q.evidenceAt = input.scannedAt;
    await h.store.save(input); h.advance(120_000);
    expect((await h.store.browse()).view!.currentAnalysis.opportunities).toHaveLength(1);
    h.advance(1); expect((await h.store.browse()).view!.currentAnalysis.opportunities).toHaveLength(0);
  });
  it("retains at most 20 receipts, newest first, and expired history remains readable", async () => {
    const h = await harness(), ids: string[] = [];
    for (let i = 0; i < 23; i++) { h.advance(1); ids.push((await h.store.save(scan(h.clock()))).id); }
    h.advance(30 * 86_400_000); const read = await h.store.browse();
    expect(read.entries.map((r) => r.id)).toEqual(ids.slice(-20).reverse());
    expect(read.view!.currentAnalysis.opportunities).toEqual([]);
    await expect(h.store.browse(ids[0])).rejects.toMatchObject({ code: "HISTORY_NOT_FOUND" });
    expect(await readdir(join(h.root, "data/private/odds-history"))).toEqual(["history.json"]);
  });
  it("projects only necessary fields and strips provider URLs and secrets", async () => {
    const h = await harness(), input = scan();
    input.snapshot.markets[0].quotes[0].source.link = "https://example.test/?key=URL_SECRET";
    Object.assign(input, { approvalId: "APPROVAL_SECRET", authorization: "Bearer AUTH_SECRET", sessionCookie: "COOKIE_SECRET", apiKey: "KEY_SECRET" });
    Object.assign(input.originalUsage, { authorization: "USAGE_SECRET" });
    await h.store.save(input); const raw = await readFile(h.path, "utf8");
    for (const secret of ["URL_SECRET", "APPROVAL_SECRET", "AUTH_SECRET", "COOKIE_SECRET", "KEY_SECRET", "USAGE_SECRET"]) expect(raw).not.toContain(secret);
    expect((await h.store.browse()).view!.snapshot.markets[0].quotes[0].source.link).toBeNull();
    expect(input.snapshot.markets[0].quotes[0].source.link).toContain("URL_SECRET");
    expect((await lstat(h.path)).mode & 0o777).toBe(0o600);
    expect((await lstat(join(h.root, "data/private/odds-history"))).mode & 0o777).toBe(0o700);
    expect(execFileSync("git", ["check-ignore", "data/private/odds-history/history.json"], { encoding: "utf8" }).trim()).toBe("data/private/odds-history/history.json");
  });
  it.each(["broken JSON", "checksum mismatch", "extra secret field", "invalid odds", "invalid receipt", "duplicate ids", "wrong request", "future scan"])("fails explicitly for %s without network fallback", async (kind) => {
    const h = await harness(); await h.store.save(scan());
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    if (kind === "broken JSON") await writeFile(h.path, "{");
    else if (kind === "checksum mismatch") { const raw = await readFile(h.path, "utf8"); await writeFile(h.path, raw.replace('"cost":97', '"cost":98')); }
    else await replaceEnvelope(h.path, (records) => {
      const r = records[0];
      if (kind === "extra secret field") r.authorization = "SECRET";
      if (kind === "invalid odds") (r.snapshot as NewSavedScan["snapshot"]).markets[0].quotes[0].decimalOdds = 1;
      if (kind === "invalid receipt") (r.originalUsage as typeof USAGE).cost = -1;
      if (kind === "duplicate ids") records.push(r);
      if (kind === "wrong request") (r.request as NewSavedScan["request"]).bookmakers = ["a", "c"];
      if (kind === "future scan") r.scannedAt = new Date(NOW + 1000).toISOString();
    });
    await expect(h.store.browse()).rejects.toBeInstanceOf(Error); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["../../outside", "history-../../outside", ""])("never interprets an id as a path: %s", async (id) => { const h = await harness(); await expect(h.store.browse(id)).rejects.toMatchObject({ code: "HISTORY_INVALID" }); });
  it("refuses symlinks, hard links and broadly readable files", async () => {
    const h = await harness(); await h.store.save(scan()); await chmod(h.path, 0o644);
    await expect(h.store.browse()).rejects.toMatchObject({ code: "HISTORY_INVALID" });
    await chmod(h.path, 0o600); const outside = join(h.root, "outside.json"); await writeFile(outside, "untouched");
    const hardLink = join(h.root, "hard-link.json"); await link(h.path, hardLink);
    await expect(h.store.browse()).rejects.toMatchObject({ code: "HISTORY_INVALID" }); await rm(hardLink);
    await rm(h.path); await symlink(outside, h.path);
    await expect(h.store.browse()).rejects.toMatchObject({ code: "HISTORY_UNAVAILABLE" });
    await expect(h.store.save(scan())).rejects.toThrow(); expect(await readFile(outside, "utf8")).toBe("untouched");
    const h2 = await harness(); await mkdir(join(h2.root, "other")); await symlink(join(h2.root, "other"), join(h2.root, "data"));
    await expect(h2.store.save(scan())).rejects.toMatchObject({ code: "HISTORY_INVALID" });
  });
  it("refuses a corrupt existing file rather than silently replacing it", async () => {
    const h = await harness(); await h.store.save(scan()); await writeFile(h.path, "broken");
    await expect(h.store.save(scan())).rejects.toThrow(); expect(await readFile(h.path, "utf8")).toBe("broken");
    expect(await readdir(join(h.root, "data/private/odds-history"))).toEqual(["history.json"]);
  });
  it("enforces total read size before parsing and rejects oversized records", async () => {
    const h = await harness(); await h.store.save(scan()); await truncate(h.path, HISTORY_LIMITS.fileBytes + 1);
    await expect(h.store.browse()).rejects.toMatchObject({ code: "HISTORY_INVALID" });
    const h2 = await harness(), input = scan(); input.snapshot.excluded = Array.from({ length: 2100 }, () => ({ eventId: null, source: "/source", reason: "x".repeat(4096) }));
    await expect(h2.store.save(input)).rejects.toMatchObject({ code: "HISTORY_TOO_LARGE" }); expect(await readdir(h2.root)).toEqual([]);
  });
  it("evicts oldest receipts to enforce the file byte limit as well as the count limit", async () => {
    const h = await harness();
    for (let i = 0; i < 5; i++) {
      h.advance(1); const input = scan(h.clock()); input.snapshot.excluded = Array.from({ length: 1900 }, () => ({ eventId: null, source: "/source", reason: "x".repeat(4096) }));
      await h.store.save(input);
    }
    expect((await lstat(h.path)).size).toBeLessThanOrEqual(HISTORY_LIMITS.fileBytes);
    expect((await h.store.browse()).entries).toHaveLength(4);
  }, 15_000);
  it("an exclusive lock prevents overwriting another writer and does not retry", async () => {
    const h = await harness(); await h.store.save(scan()); const raw = await readFile(h.path, "utf8");
    await writeFile(join(h.root, "data/private/odds-history/write.lock"), "", { mode: 0o600 });
    await expect(h.store.save(scan())).rejects.toMatchObject({ code: "HISTORY_BUSY" });
    expect(await readFile(h.path, "utf8")).toBe(raw); expect((await h.store.browse()).entries).toHaveLength(1);
  });
  it("removes only owned orphan temporary filenames on the next locked write", async () => {
    const h = await harness(); await h.store.save(scan()); const directory = join(h.root, "data/private/odds-history");
    const orphan = ".history-00000000-0000-4000-8000-000000000000.tmp";
    await writeFile(join(directory, orphan), "incomplete odds", { mode: 0o600 });
    await writeFile(join(directory, "other-file"), "keep"); await h.store.save(scan());
    expect(await readdir(directory)).toEqual(["history.json", "other-file"]);
  });
});
