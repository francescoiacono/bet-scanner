import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import ResearchPage from "./research/page";
import { BookmakerSelector, ProviderErrorNotice, Results, SavedScanView } from "./odds-dashboard";
import { demoScan } from "../lib/odds/demo";
import { NOW } from "../lib/odds/test-helpers";
import { analyseSnapshot } from "../lib/odds/arbitrage";
import type { HistoricalScan } from "../lib/odds/history-types";
import index from "../data/generated/research-index.json";
import config from "../../next.config";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const read = (path: string) => readFileSync(path, "utf8");

describe("consolidated product rendering and routes", () => {
  it("homepage renders the real scanner in DEMO without a key or any request", () => {
    vi.stubEnv("ODDSRELAY_KEY", "");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Requests forbidden during rendering"));
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("Odds Scanner"); expect(html).toContain("Compare bookmaker prices and identify theoretical arbitrage.");
    expect(html).toContain("Not configured"); expect(html).toContain("THEORETICAL ARBITRAGE"); expect(html).toContain("3.34%");
    expect(html).not.toContain("modelProbability"); expect(html).not.toContain("Minimum edge"); expect(fetch).not.toHaveBeenCalled();
  });
  it("configured server key never becomes HTML or dashboard props", () => {
    const secret = "test-only-secret-not-a-real-provider-key";
    vi.stubEnv("ODDSRELAY_KEY", secret);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Requests forbidden"));
    const element = Home(); expect(element.props.configured).toBe(true);
    expect(JSON.stringify(element.props)).not.toContain(secret);
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Configured but unverified"); expect(html).toContain("Choose bookmakers");
    expect(html).toContain("Refresh discovery is free and manual"); expect(html).toContain("No provider requests run automatically"); expect(html).not.toContain("SYNTHETIC RESULTS");
    expect(html).not.toContain(secret); expect(fetch).not.toHaveBeenCalled();
    expect(html).toContain("Scan history"); expect(html).toContain("View previous scan · 0 tokens");
    expect(html).not.toContain("Original research results"); expect(html).not.toContain("history-0000");
  });
  it("original research opportunities are explicitly historical and use neutral styling", () => {
    const html = renderToStaticMarkup(createElement(Results, { analysis: demoScan(NOW).analysis, mode: "LIVE", historical: true }));
    expect(html).toContain('id="history-results"'); expect(html).not.toContain('id="scan-results"');
    for (const label of ["Original research results", "HISTORICAL ODDSRELAY RESULTS · READ ONLY", "HISTORICAL RESULT AT SCAN TIME · READ ONLY", "AT SCAN TIME · THEORETICAL ARBITRAGE"]) expect(text(html)).toContain(label);
    expect(html).not.toContain("BEST THEORETICAL OPPORTUNITY");
    expect(html).not.toMatch(/class="[^"]*positive/);
  });
  it("both destinations render exactly two primary links with the correct active page", () => {
    for (const [element, active] of [[Home(), "/"], [createElement(ResearchPage), "/research"]] as const) {
      const html = renderToStaticMarkup(element), nav = html.match(/<nav[^>]+aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/)![1];
      expect(nav.match(/<a\b/g)).toHaveLength(2); expect(nav).toContain('href="/"'); expect(nav).toContain('href="/research"');
      const activeLink = nav.match(/<a\b[^>]*aria-current="page"[^>]*>/)![0];
      expect(activeLink).toContain('href="' + active + '"');
    }
  });
  it("archive renders five anchored research families and the recorded negative findings", () => {
    const html = renderToStaticMarkup(createElement(ResearchPage));
    for (const id of ["early-poisson", "dixon-coles", "corners", "historical-value", "calibration"]) expect(html).toContain('id="' + id + '"');
    for (const finding of ["0.6096214837100087", "0.5760293595563422", "NONE / INCONCLUSIVE", "INCONCLUSIVE", "−4.74%", "−7.44%", "IDENTITY_RETAINED", "0%", "No calibrated research model was promoted."]) expect(text(html)).toContain(finding);
    expect(html).toContain("Data provenance"); expect(html).toContain("Method, definitions");
  });
  it("rendering and navigation destinations do not request provider data", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider request allowed"));
    renderToStaticMarkup(Home()); renderToStaticMarkup(createElement(ResearchPage)); renderToStaticMarkup(Home());
    expect(fetch).not.toHaveBeenCalled();
  });
  it("legacy URLs use permanent Next redirects to existing section anchors", async () => {
    const redirects = await config.redirects!();
    const expected = { "/odds": "/", "/backtest": "/research#early-poisson", "/diagnostics": "/research#early-poisson", "/models": "/research#dixon-coles", "/corners": "/research#corners", "/value": "/research#historical-value", "/calibration": "/research#calibration" };
    expect(redirects).toHaveLength(7);
    for (const [source, destination] of Object.entries(expected)) expect(redirects).toContainEqual({ source, destination, permanent: true });
  });
  it("private datasets and history are excluded from production file tracing", () => {
    expect(config.outputFileTracingExcludes).toEqual({ "/*": ["./data/private/**/*"] });
    const page = read("src/app/page.tsx"); expect(page).not.toContain("scanHistory"); expect(page).not.toContain("FileScanHistory");
  });
  it("complete no-arbitrage and insufficient evidence have distinct empty states", () => {
    const demo = demoScan(NOW);
    const ordinary = demo.analysis.markets.find((m) => m.status === "NO ARBITRAGE FOUND")!;
    const missing = demo.analysis.markets.find((m) => m.status === "INSUFFICIENT DATA")!;
    const rendered = (market: typeof ordinary, status: "NO ARBITRAGE FOUND" | "INSUFFICIENT DATA") => text(renderToStaticMarkup(createElement(Results, { analysis: { ...demo.analysis, status, opportunities: [], markets: [market] }, mode: "LIVE" })));
    expect(rendered(ordinary, "NO ARBITRAGE FOUND")).toContain("Complete eligible markets were compared.");
    expect(rendered(ordinary, "NO ARBITRAGE FOUND")).not.toContain("No verified opportunity");
    expect(rendered(missing, "INSUFFICIENT DATA")).toContain("INSUFFICIENT VALID DATA");
    expect(rendered(missing, "INSUFFICIENT DATA")).toContain("No verified opportunity");
  });
  it("shows the evaluated subset before insufficient fixtures and keeps missing-data reasons available", () => {
    const demo = demoScan(NOW);
    const html = renderToStaticMarkup(createElement(Results, { analysis: demo.analysis, mode: "LIVE" }));
    const coverage = html.match(/<dl[^>]+aria-label="Scan coverage"[^>]*>([\s\S]*?)<\/dl>/)![1];
    expect(text(coverage)).toContain("Fixtures scanned 4 Complete comparisons 2 Insufficient data 2 Theoretical opportunities 1");
    expect(html.indexOf("Complete comparisons (2)")).toBeLessThan(html.indexOf("Why fixtures could not be compared"));
    const details = html.match(/<details[^>]*><summary>Insufficient data \(2\)[\s\S]*?<\/details>/)![0];
    expect(details).not.toMatch(/<details[^>]+\bopen\b/);
    expect(details).toContain("Brookfield Rovers"); expect(details).toContain("Missing eligible DRAW price");
    const completeTable = html.match(/aria-label="Complete fixture price comparisons"[\s\S]*?<\/table>/)![0];
    expect(completeTable).toContain("Northbridge FC"); expect(completeTable).toContain("Meadow United");
    expect(completeTable).not.toContain("Brookfield Rovers"); expect(completeTable).not.toContain("INSUFFICIENT DATA");
  });
  it("limits a no-arbitrage finding to the complete subset rather than claiming all returned fixtures were assessed", () => {
    const demo = demoScan(NOW);
    const analysis = { ...demo.analysis, status: "NO ARBITRAGE FOUND" as const, opportunities: [], markets: demo.analysis.markets.filter((m) => m.status !== "ARBITRAGE") };
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No request allowed"));
    const rendered = text(renderToStaticMarkup(createElement(Results, { analysis, mode: "LIVE" })));
    expect(rendered).toContain("No theoretical arbitrage was found in 1 complete fixture.");
    expect(rendered).toContain("2 fixtures could not be assessed.");
    expect(rendered).toContain("Missing data does not establish whether arbitrage exists.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("technical details start collapsed, while prices, books, ROI and evidence stay visible", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("Advanced details"); expect(html).toContain("Illustrative fractions");
    expect(html).not.toMatch(/<details[^>]+\bopen\b/); expect(html).toContain("Oldest supporting venue/sport evidence");
    for (const price of ["2.200", "3.800", "4.000"]) expect(html).toContain(price);
  });
  it("expired bookmaker coverage is historical context with disabled selection and removal controls", () => {
    const bookmaker = { id: "test-book", name: "Synthetic Test Book", isExchange: false, regions: ["uk"], events: 10, lastSeen: new Date(NOW).toISOString(), eligible: true, reason: null };
    const onToggle = vi.fn();
    const html = renderToStaticMarkup(createElement(BookmakerSelector, { bookmakers: [bookmaker], selected: [bookmaker.id], verified: false, busy: false, onToggle }));
    expect(text(html)).toContain("Previous bookmaker coverage is shown for context");
    expect(text(html)).toContain("10 football events at previous check");
    expect(html.match(/<input[^>]+type="checkbox"[^>]*>/)![0]).toContain("disabled");
    expect(html.match(/<button[^>]+aria-label="Remove Synthetic Test Book"[^>]*>/)![0]).toContain("disabled");
    expect(onToggle).not.toHaveBeenCalled();
  });
  it("shows the full sanitized error beside the source status before the quote workflow", () => {
    const html = renderToStaticMarkup(createElement(ProviderErrorNotice, { error: { code: "INVALID_ACTION_OR_DATA", message: "Invalid competition title.", status: 400, retryAfter: null } }));
    expect(html).toContain('role="alert"'); expect(html).toContain("INVALID_ACTION_OR_DATA"); expect(html).toContain("Invalid competition title.");
    const client = read("src/app/odds-dashboard.tsx");
    expect(client.indexOf("{error && <ProviderErrorNotice")).toBeLessThan(client.indexOf('id="bookmaker-title"'));
  });
  it("active page imports exclude retired presentation and full/private research artifacts", () => {
    const sources = ["src/app/page.tsx", "src/app/odds-dashboard.tsx", "src/app/site-header.tsx", "src/app/research/page.tsx"].map(read).join("\n");
    for (const retired of ["scanner-dashboard", "research-header", "data/mock-", "model-comparison-v06.json", "data/private", "calibration-summary", "value-summary"]) expect(sources).not.toContain(retired);
    expect(read("src/app/research/page.tsx")).toContain("research-index.json");
    for (const file of ["src/app/scanner-dashboard.tsx", "src/app/scanner-dashboard.module.css", "src/app/research-header.tsx", "src/app/odds/page.tsx", "src/data/value-summary.ts", "src/data/calibration-summary.ts", ...["backtest", "diagnostics", "models", "corners", "value", "calibration"].map((route) => "src/app/" + route + "/page.tsx"), ...["file", "globe", "next", "vercel", "window"].map((asset) => "public/" + asset + ".svg")]) expect(existsSync(file)).toBe(false);
  });
});

describe("saved scan presentation", () => {
  function saved() {
    const demo = demoScan(NOW), currentAnalysis = analyseSnapshot(demo.snapshot, NOW + 121_000);
    const scan: HistoricalScan = { id: "history-00000000-0000-4000-8000-000000000000", readOnly: true, scannedAt: demo.analysis.evaluatedAt, bookmakers: ["synthetic-a", "synthetic-b"], originalUsage: { cost: 97, used: 100, remaining: 2400, limit: 2500, resetsAt: null }, unchanged: false,
      snapshotReceivedAt: demo.snapshot.receivedAt, ageMs: 121_000, snapshot: demo.snapshot, originalAnalysis: demo.analysis, currentAnalysis, viewedAt: currentAnalysis.evaluatedAt };
    scan.originalAnalysis = { ...scan.originalAnalysis, excluded: [...scan.originalAnalysis.excluded, { eventId: null, source: "/synthetic", reason: "ORIGINAL_VALIDATION_DETAIL" }] };
    return { scan, currentAnalysis };
  }
  it("shows original opportunities, all original price comparisons and counts immediately for stale scans", () => {
    const { scan, currentAnalysis } = saved();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider request"));
    expect(currentAnalysis.opportunities).toEqual([]);
    const html = renderToStaticMarkup(createElement(SavedScanView, { scan, currentAnalysis, error: null, disabled: false, onRefresh: vi.fn() }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
    expect(text(visible)).toContain("HISTORICAL ODDS — NOT LIVE");
    expect(text(visible)).toContain("Fixtures scanned 4 Complete comparisons 2 Insufficient data 2 Theoretical opportunities 1");
    expect(text(visible)).toContain("Original scan 2026-10-08 12:00:00.000 UTC");
    expect(text(visible)).toContain("synthetic-a, synthetic-b"); expect(text(visible)).toContain("Snapshot age 2m 1s");
    expect(text(visible)).toContain("Evaluated 2026-10-08 12:00:00.000 UTC");
    expect(text(visible)).not.toContain("Evaluated 2026-10-08 12:02:01.000 UTC");
    for (const price of ["2.200", "3.800", "4.000"]) expect(visible).toContain(price);
    expect(visible).toContain("Original bookmaker comparisons (4)"); expect(visible).toContain("Northbridge FC"); expect(visible).toContain("Brookfield Rovers");
    expect(visible).toContain('aria-label="Original bookmaker price comparisons"');
    expect(text(visible)).toContain("AT SCAN TIME · THEORETICAL ARBITRAGE");
    expect(text(visible)).toContain("never current verified opportunities"); expect(text(visible)).toContain("no longer provide a currently eligible complete comparison");
    expect(html).not.toMatch(/class="[^"]*positive/); expect(visible).not.toContain("BEST THEORETICAL OPPORTUNITY");
    expect(html.indexOf("Original scan")).toBeLessThan(html.indexOf("Original research results"));
    expect(html.indexOf("Original bookmaker comparisons")).toBeLessThan(html.indexOf("Recorded prices may be stale"));
    expect(html.indexOf("Recorded prices may be stale")).toBeLessThan(html.indexOf("Check for updated odds"));
    expect(html.indexOf("Check for updated odds")).toBeLessThan(html.indexOf("<summary>Technical details</summary>"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("collapses metadata, full receipts, individual exclusions, current diagnostics and validation errors initially", () => {
    const { scan, currentAnalysis } = saved(), error = { code: "HISTORY_INVALID", message: "SYNTHETIC_CACHE_ERROR_DETAIL", status: 409, retryAfter: null };
    const html = renderToStaticMarkup(createElement(SavedScanView, { scan, currentAnalysis, error, disabled: false, onRefresh: vi.fn() }));
    const technical = html.match(/<details\b[^>]*><summary>Technical details<\/summary>[\s\S]*?<\/details>/)![0];
    expect(technical).not.toMatch(/<details[^>]+\bopen\b/);
    for (const label of ["Provider response metadata", "Full original token receipt", "Tokens used", "Current freshness diagnostics", "Stale price evidence", "ORIGINAL_VALIDATION_DETAIL", "SYNTHETIC_CACHE_ERROR_DETAIL"]) expect(technical).toContain(label);
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
    for (const label of ["Provider response metadata", "Tokens used", "Current freshness diagnostics", "Stale price evidence", "ORIGINAL_VALIDATION_DETAIL", "SYNTHETIC_CACHE_ERROR_DETAIL", "Missing eligible DRAW price"]) expect(visible).not.toContain(label);
    expect(text(visible)).toContain("Data quality at scan time: 2 of 4 fixtures had insufficient data");
    expect(text(visible)).toContain("Original token cost 97");
  });
});

describe("compact archive projection", () => {
  it("retains exact fixed values and source hashes in a small aggregate-only index", () => {
    expect(index.dixonColes.recentBrier).toBe(0.6096214837100087); expect(index.historicalValue.recentMarketBrier).toBe(0.5760293595563422);
    expect(index.historicalValue.recentROI).toBeCloseTo(-0.04737162162162161, 14); expect(index.historicalValue.olderROI).toBeCloseTo(-0.07438755670771229, 14);
    expect(index.corners.status).toBe("NONE / INCONCLUSIVE"); expect(index.historicalValue.status).toBe("INCONCLUSIVE");
    expect(index.calibration).toEqual({ status: "IDENTITY_RETAINED", selectedFamily: "identity", researchModelVersion: null, gapClosedFraction: 0 });
    expect(read("src/data/generated/research-index.json").length).toBeLessThan(5000);
    for (const [file, hash] of Object.entries(index.artifactHashes)) expect(createHash("sha256").update(readFileSync("src/data/generated/" + file)).digest("hex")).toBe(hash);
    expect(JSON.stringify(index)).not.toMatch(/"records"|"fits"|"homeTeam"|"awayTeam"|"prices"|"audit"/);
  });
  it("reproduces the compact index byte-for-byte without provider calls or private sources", () => {
    const dir = mkdtempSync(join(tmpdir(), "bet-scanner-index-"));
    try { const path = join(dir, "index.json"); execFileSync(process.execPath, ["scripts/build-research-index.mjs", path]); expect(read(path)).toBe(read("src/data/generated/research-index.json")); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
