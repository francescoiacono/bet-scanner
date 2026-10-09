import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScan } from "../lib/odds/demo";
import { NOW, mockProvider } from "../lib/odds/test-helpers";
import { OddsScannerService } from "../lib/odds/server/service";
import { canConfirm, canQuote, discoveryFreshness, discoveryStatus, initialScannerState, resultStatus, scannerReducer, scannerStatus, type ScannerState } from "./scanner-state";

const demo = demoScan(NOW);
const initial = () => initialScannerState(demo);
const live = () => scannerReducer(initial(), { type: "mode", mode: "LIVE", demo });
async function quoted() {
  const mock = mockProvider();
  const service = new OddsScannerService(mock.provider, () => NOW, () => "approval");
  const discovery = await service.discover();
  const quote = await service.quote("owner", ["a", "b"]);
  const discovered = scannerReducer(live(), { type: "discovery", discovery, now: NOW });
  const selected = ["a", "b"].reduce((state, id) => scannerReducer(state, { type: "bookmaker", id }), discovered);
  const state = scannerReducer(selected, { type: "quote", quote });
  return { mock, state, quote };
}
afterEach(() => vi.restoreAllMocks());

describe("scanner workflow presentation", () => {
  it("initial demo has results but no account discovery or approval", () => {
    const state = initial();
    expect(state.scan).toBe(demo); expect(state.discovery).toBeNull(); expect(state.quote).toBeNull();
    expect(scannerStatus(state, false, NOW).label).toBe("DEMO"); expect(canConfirm(state, NOW)).toBe(false);
  });
  it("configured pages start in LIVE without synthetic results, approvals or server rendering I/O", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const state = initialScannerState(demo, true);
    expect(state.mode).toBe("LIVE"); expect(state.scan).toBeNull(); expect(state.discovery).toBeNull(); expect(state.quote).toBeNull();
    expect(canConfirm(state, NOW)).toBe(false); expect(fetch).not.toHaveBeenCalled();
    expect(discoveryStatus(state, true, NOW).kind).toBe("CONFIGURED BUT UNVERIFIED");
  });
  it("defaults to eligible bet365 and Ladbrokes regardless of catalogue order", async () => {
    const { state } = await quoted();
    const template = state.discovery!.bookmakers[0];
    const bookmakers = [{ ...template, id: "other", name: "Other" }, { ...template, id: "ladbrokes", name: "Ladbrokes" }, { ...template, id: "bet365", name: "Bet365" }];
    const discovered = scannerReducer(live(), { type: "discovery", discovery: { ...state.discovery!, bookmakers }, now: NOW });
    expect(discovered.selected).toEqual(["bet365", "ladbrokes"]);
  });
  it("never selects unavailable defaults or substitutes other bookmakers", async () => {
    const { state } = await quoted();
    const template = state.discovery!.bookmakers[0];
    const bookmakers = [{ ...template, id: "bet365", name: "Bet365" }, { ...template, id: "ladbrokes", name: "Ladbrokes", eligible: false, reason: "No standard soccer coverage" }, { ...template, id: "other", name: "Ladbrokes" }];
    const discovered = scannerReducer(live(), { type: "discovery", discovery: { ...state.discovery!, bookmakers }, now: NOW });
    expect(discovered.selected).toEqual(["bet365"]);
    const missing = scannerReducer(live(), { type: "discovery", discovery: state.discovery!, now: NOW });
    expect(missing.selected).toEqual([]);
  });
  it("switching to LIVE removes all synthetic results and approvals", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const state = live(); expect(state.scan).toBeNull(); expect(state.quote).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    expect(scannerStatus(state, false, NOW).label).toBe("NOT CONFIGURED");
    expect(scannerStatus(state, true, NOW).label).toBe("CONFIGURED BUT UNVERIFIED");
  });
  it.each(["a", "c"])("changing bookmaker %s invalidates quote and acknowledgment", async (id) => {
    const { state, mock } = await quoted();
    const changed = scannerReducer({ ...state, acknowledged: true }, { type: "bookmaker", id });
    expect(changed.quote).toBeNull(); expect(changed.acknowledged).toBe(false); expect(canConfirm(changed, NOW)).toBe(false);
    expect(changed.selected.includes(id)).toBe(!state.selected.includes(id)); expect(mock.provider.scan).not.toHaveBeenCalled();
  });
  it("requires separate acknowledgment and a current matching local approval", async () => {
    const { state } = await quoted();
    expect(scannerStatus(state, true, NOW).label).toBe("QUOTE AVAILABLE");
    expect(canConfirm(state, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true }, NOW)).toBe(true);
    expect(canConfirm({ ...state, acknowledged: true, busy: "confirm" }, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true, quote: null }, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true, mode: "DEMO" }, NOW)).toBe(false);
  });
  it("shows blocked quotes separately and disables confirmation", async () => {
    const { state, quote } = await quoted();
    const blocked = { ...state, acknowledged: true, quote: { ...quote, approvalId: null, blocked: ["Insufficient tokens"] } };
    expect(scannerStatus(blocked, true, NOW).label).toBe("QUOTE BLOCKED"); expect(canConfirm(blocked, NOW)).toBe(false);
  });
  it("expires at exactly 60 seconds and cannot confirm even before the timer fires", async () => {
    const { state } = await quoted(), acknowledged = { ...state, acknowledged: true };
    expect(canConfirm(acknowledged, NOW + 59_999)).toBe(true);
    expect(canConfirm(acknowledged, NOW + 60_000)).toBe(false);
    const expired = scannerReducer(acknowledged, { type: "expire", approvalId: state.quote!.approvalId! });
    expect(expired.acknowledged).toBe(false); expect(scannerStatus(expired, true, NOW).label).toBe("QUOTE EXPIRED");
    expect(canConfirm(expired, NOW)).toBe(false);
    expect(scannerReducer(state, { type: "expire", approvalId: "older-approval" })).toBe(state);
  });
  it("consumes displayed confirmation before awaiting and removes previous results", async () => {
    const { state } = await quoted();
    const started = scannerReducer({ ...state, acknowledged: true, scan: demo }, { type: "begin", action: "confirm" });
    expect(started.quote).toBeNull(); expect(started.scan).toBeNull(); expect(started.acknowledged).toBe(false);
    expect(scannerStatus(started, true, NOW).label).toBe("SCAN IN PROGRESS"); expect(canConfirm(started, NOW)).toBe(false);
  });
  it("discovery resets expired approvals and shows loading independently", async () => {
    const { state } = await quoted();
    const started = scannerReducer({ ...state, quoteExpired: true }, { type: "begin", action: "discover" });
    expect(started.quoteExpired).toBe(false); expect(started.selected).toEqual([]); expect(started.discovery).toBeNull();
    expect(scannerStatus(started, true, NOW).label).toBe("VERIFYING");
  });
  it("insufficient verified venues cannot be presented as no arbitrage", async () => {
    const { state } = await quoted();
    const restricted: ScannerState = { ...state, quote: null, discovery: { ...state.discovery!, bookmakers: [], restrictions: ["No coverage"] } };
    expect(scannerStatus(restricted, true, NOW).label).toBe("INSUFFICIENT COVERAGE");
  });
  it("LIVE errors clear results and retain actual error receipts without synthetic fallback", () => {
    const error = { code: "UNAVAILABLE", message: "No data", status: 503, retryAfter: "30", usage: { cost: 12, used: 12, remaining: null, limit: null, resetsAt: null } };
    const state = scannerReducer({ ...live(), scan: demo }, { type: "error", error });
    expect(state.scan).toBeNull(); expect(state.usage).toEqual(error.usage); expect(scannerStatus(state, true, NOW).label).toBe("PROVIDER ERROR");
    expect(scannerReducer(state, { type: "finish" }).scan).toBeNull();
  });
  it("an actual receipt never substitutes the earlier quoted cost", async () => {
    const { state } = await quoted();
    const receipt = { cost: null, used: null, remaining: null, limit: null, resetsAt: null };
    const updated = scannerReducer(state, { type: "scan", scan: { ...demo, usage: receipt } });
    expect(updated.usage?.cost).toBeNull(); expect(updated.usage?.remaining).toBeNull();
  });
  it("distinguishes theoretical arbitrage, complete no arbitrage and unverifiable data", () => {
    expect(resultStatus("THEORETICAL ARBITRAGE")).toEqual({ label: "THEORETICAL ARBITRAGE", tone: "positive" });
    expect(resultStatus("NO ARBITRAGE FOUND")).toEqual({ label: "NO ARBITRAGE FOUND", tone: "neutral" });
    expect(resultStatus("INSUFFICIENT DATA")).toEqual({ label: "INSUFFICIENT VALID DATA", tone: "warning" });
  });
});

describe("discovery validity and independent quote approval", () => {
  it("matches the 60-second server boundary, including its exact expiry", async () => {
    const { state } = await quoted();
    for (const [elapsed, fresh] of [[0, true], [59_999, true], [60_000, false], [60_001, false]] as const) {
      expect(discoveryFreshness(state.discovery, NOW + elapsed)).toEqual({ fresh, expiresAt: NOW + 60_000 });
      expect(discoveryStatus(state, true, NOW + elapsed).kind).toBe(fresh ? "VERIFIED" : "DISCOVERY EXPIRED");
      expect(canQuote(state, true, NOW + elapsed)).toBe(fresh);
    }
  });

  it("never verifies missing, malformed, invalid-calendar or future timestamps, or invalid clocks", async () => {
    const { state } = await quoted();
    for (const capturedAt of [undefined, null, "", "not-a-date", "2026-02-30T12:00:00Z", "2026-10-08T12:00:00+00:00", new Date(NOW + 1).toISOString()]) {
      const discovery = { ...state.discovery!, capturedAt } as typeof state.discovery;
      expect(discoveryFreshness(discovery, NOW).fresh).toBe(false);
      expect(discoveryStatus({ ...state, discovery }, true, NOW).ready).toBe(false);
      expect(canQuote({ ...state, discovery }, true, NOW)).toBe(false);
    }
    for (const now of [NaN, Infinity, -Infinity]) expect(discoveryFreshness(state.discovery, now).fresh).toBe(false);
    expect(discoveryFreshness(null, NOW)).toEqual({ fresh: false, expiresAt: null });
  });

  it("keeps expired discovery and its timestamp through mode transitions without I/O", async () => {
    const { state } = await quoted();
    const fetch = vi.spyOn(globalThis, "fetch");
    const expired = scannerReducer(state, { type: "discovery-expire", capturedAt: state.discovery!.capturedAt });
    const demoMode = scannerReducer(expired, { type: "mode", mode: "DEMO", demo });
    const liveMode = scannerReducer(demoMode, { type: "mode", mode: "LIVE", demo });
    expect(liveMode.discovery).toBe(state.discovery);
    expect(discoveryStatus(liveMode, true, NOW + 60_000)).toMatchObject({ kind: "DISCOVERY EXPIRED", label: "Discovery expired — refresh required", ready: false });
    expect(discoveryStatus(liveMode, true, NOW + 60_000).guidance).toBe("Bookmaker availability was verified earlier. Refresh the free discovery before requesting another quote.");
    expect(scannerStatus(liveMode, true, NOW + 60_000).label).toBe("DISCOVERY EXPIRED");
    expect(canQuote(liveMode, true, NOW + 60_000)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("local discovery expiry leaves an independently issued approval and acknowledgment intact", async () => {
    const { state } = await quoted();
    const issuedLater = { ...state.quote!, createdAt: new Date(NOW + 30_000).toISOString(), expiresAt: new Date(NOW + 90_000).toISOString() };
    const acknowledged = { ...state, quote: issuedLater, acknowledged: true };
    const expired = scannerReducer(acknowledged, { type: "discovery-expire", capturedAt: state.discovery!.capturedAt });
    expect(expired.quote).toBe(issuedLater); expect(expired.acknowledged).toBe(true); expect(expired.quoteExpired).toBe(false);
    expect(canQuote(expired, true, NOW + 60_000)).toBe(false);
    expect(canConfirm(expired, NOW + 60_000)).toBe(true);
    expect(canConfirm(expired, NOW + 89_999)).toBe(true);
    expect(canConfirm(expired, NOW + 90_000)).toBe(false);
    expect(scannerStatus(expired, true, NOW + 60_000).label).toBe("QUOTE AVAILABLE");
    expect(discoveryStatus(expired, true, NOW + 60_000).kind).toBe("DISCOVERY EXPIRED");
  });

  it("refresh replaces old coverage and drops unavailable selections without substituting preferences", async () => {
    const { state } = await quoted();
    const template = state.discovery!.bookmakers[0];
    const discovery = { ...state.discovery!, capturedAt: new Date(NOW + 60_000).toISOString(), bookmakers: [
      { ...template, id: "bet365", name: "Bet365" },
      { ...template, id: "ladbrokes", name: "Ladbrokes", eligible: false, reason: "No standard soccer coverage" },
      { ...template, id: "other", name: "Other" },
    ] };
    const expired = { ...state, selected: ["ladbrokes", "old"], discoveryExpired: true, acknowledged: true };
    const started = scannerReducer(expired, { type: "begin", action: "discover" });
    const refreshed = scannerReducer(scannerReducer(started, { type: "discovery", discovery, now: NOW + 60_000 }), { type: "finish" });
    expect(refreshed.discovery).toBe(discovery); expect(refreshed.discoveryExpired).toBe(false);
    expect(refreshed.selected).toEqual(["bet365"]); expect(refreshed.quote).toBeNull(); expect(refreshed.acknowledged).toBe(false);
    expect(discoveryStatus(refreshed, true, NOW + 60_000).kind).toBe("VERIFIED");
    expect(scannerReducer(refreshed, { type: "discovery-expire", capturedAt: state.discovery!.capturedAt })).toBe(refreshed);
  });

  it("rejects newly returned future discovery even if a later clock would otherwise make it fresh", async () => {
    const { state } = await quoted();
    const discovery = { ...state.discovery!, capturedAt: new Date(NOW + 1_000).toISOString() };
    const invalid = scannerReducer(state, { type: "discovery", discovery, now: NOW });
    expect(invalid.discoveryExpired).toBe(true);
    expect(discoveryStatus(invalid, true, NOW + 2_000).ready).toBe(false);
  });

  it("requires eligible selected IDs and keeps all verification states distinct", async () => {
    const { state } = await quoted();
    expect(canQuote({ ...state, selected: ["a", "missing"] }, true, NOW)).toBe(false);
    expect(canQuote({ ...state, mode: "DEMO" }, true, NOW)).toBe(false);
    expect(canQuote({ ...state, busy: "quote" }, true, NOW)).toBe(false);
    expect(discoveryStatus(state, false, NOW).kind).toBe("NOT CONFIGURED");
    expect(discoveryStatus({ ...state, busy: "discover" }, true, NOW).kind).toBe("VERIFYING");
    expect(discoveryStatus({ ...state, discovery: null }, true, NOW).kind).toBe("CONFIGURED BUT UNVERIFIED");
    expect(discoveryStatus({ ...state, discovery: { ...state.discovery!, restrictions: ["No coverage"] } }, true, NOW).kind).toBe("INSUFFICIENT COVERAGE");
    expect(discoveryStatus({ ...state, error: { code: "FAILED", message: "Failed", status: 503, retryAfter: null } }, true, NOW).kind).toBe("PROVIDER ERROR");
  });
});
