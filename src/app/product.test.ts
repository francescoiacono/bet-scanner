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
import { ProviderErrorNotice, Results } from "./odds-dashboard";
import { demoScan } from "../lib/odds/demo";
import { NOW } from "../lib/odds/test-helpers";
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
    expect(html).toContain("Discovery loads automatically for free"); expect(html).not.toContain("SYNTHETIC RESULTS");
    expect(html).not.toContain(secret); expect(fetch).not.toHaveBeenCalled();
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
