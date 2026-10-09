import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScan } from "../lib/odds/demo";
import { NOW, mockProvider } from "../lib/odds/test-helpers";
import { OddsScannerService } from "../lib/odds/server/service";
import { canConfirm, initialScannerState, resultStatus, scannerReducer, scannerStatus, type ScannerState } from "./scanner-state";

const demo = demoScan(NOW);
const initial = () => initialScannerState(demo);
const live = () => scannerReducer(initial(), { type: "mode", mode: "LIVE", demo });
async function quoted() {
  const mock = mockProvider();
  const service = new OddsScannerService(mock.provider, () => NOW, () => "approval");
  const discovery = await service.discover();
  const quote = await service.quote("owner", ["a", "b"]);
  const discovered = scannerReducer(live(), { type: "discovery", discovery });
  const selected = ["a", "b"].reduce((state, id) => scannerReducer(state, { type: "bookmaker", id }), discovered);
  const state = scannerReducer(selected, { type: "quote", quote });
  return { mock, state, quote };
}
afterEach(() => vi.restoreAllMocks());

describe("scanner workflow presentation", () => {
  it("initial demo has results but no account discovery or approval", () => {
    const state = initial();
    expect(state.scan).toBe(demo); expect(state.discovery).toBeNull(); expect(state.quote).toBeNull();
    expect(scannerStatus(state, false).label).toBe("DEMO"); expect(canConfirm(state, NOW)).toBe(false);
  });
  it("configured pages start in LIVE without synthetic results, approvals or server rendering I/O", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const state = initialScannerState(demo, true);
    expect(state.mode).toBe("LIVE"); expect(state.scan).toBeNull(); expect(state.discovery).toBeNull(); expect(state.quote).toBeNull();
    expect(canConfirm(state, NOW)).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it("defaults to eligible bet365 and Ladbrokes regardless of catalogue order", async () => {
    const { state } = await quoted();
    const template = state.discovery!.bookmakers[0];
    const bookmakers = [{ ...template, id: "other", name: "Other" }, { ...template, id: "ladbrokes", name: "Ladbrokes" }, { ...template, id: "bet365", name: "Bet365" }];
    const discovered = scannerReducer(live(), { type: "discovery", discovery: { ...state.discovery!, bookmakers } });
    expect(discovered.selected).toEqual(["bet365", "ladbrokes"]);
  });
  it("never selects unavailable defaults or substitutes other bookmakers", async () => {
    const { state } = await quoted();
    const template = state.discovery!.bookmakers[0];
    const bookmakers = [{ ...template, id: "bet365", name: "Bet365" }, { ...template, id: "ladbrokes", name: "Ladbrokes", eligible: false, reason: "No standard soccer coverage" }, { ...template, id: "other", name: "Ladbrokes" }];
    const discovered = scannerReducer(live(), { type: "discovery", discovery: { ...state.discovery!, bookmakers } });
    expect(discovered.selected).toEqual(["bet365"]);
    const missing = scannerReducer(live(), { type: "discovery", discovery: state.discovery! });
    expect(missing.selected).toEqual([]);
  });
  it("switching to LIVE removes all synthetic results and approvals", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const state = live(); expect(state.scan).toBeNull(); expect(state.quote).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    expect(scannerStatus(state, false).label).toBe("LIVE NOT CONFIGURED");
    expect(scannerStatus(state, true).label).toBe("ACCOUNT NOT VERIFIED");
  });
  it.each(["a", "c"])("changing bookmaker %s invalidates quote and acknowledgment", async (id) => {
    const { state, mock } = await quoted();
    const changed = scannerReducer({ ...state, acknowledged: true }, { type: "bookmaker", id });
    expect(changed.quote).toBeNull(); expect(changed.acknowledged).toBe(false); expect(canConfirm(changed, NOW)).toBe(false);
    expect(changed.selected.includes(id)).toBe(!state.selected.includes(id)); expect(mock.provider.scan).not.toHaveBeenCalled();
  });
  it("requires separate acknowledgment and a current matching local approval", async () => {
    const { state } = await quoted();
    expect(scannerStatus(state, true).label).toBe("QUOTE AVAILABLE");
    expect(canConfirm(state, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true }, NOW)).toBe(true);
    expect(canConfirm({ ...state, acknowledged: true, busy: "confirm" }, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true, quote: null }, NOW)).toBe(false);
    expect(canConfirm({ ...state, acknowledged: true, mode: "DEMO" }, NOW)).toBe(false);
  });
  it("shows blocked quotes separately and disables confirmation", async () => {
    const { state, quote } = await quoted();
    const blocked = { ...state, acknowledged: true, quote: { ...quote, approvalId: null, blocked: ["Insufficient tokens"] } };
    expect(scannerStatus(blocked, true).label).toBe("QUOTE BLOCKED"); expect(canConfirm(blocked, NOW)).toBe(false);
  });
  it("expires at exactly 60 seconds and cannot confirm even before the timer fires", async () => {
    const { state } = await quoted(), acknowledged = { ...state, acknowledged: true };
    expect(canConfirm(acknowledged, NOW + 59_999)).toBe(true);
    expect(canConfirm(acknowledged, NOW + 60_000)).toBe(false);
    const expired = scannerReducer(acknowledged, { type: "expire", approvalId: state.quote!.approvalId! });
    expect(expired.acknowledged).toBe(false); expect(scannerStatus(expired, true).label).toBe("QUOTE EXPIRED");
    expect(canConfirm(expired, NOW)).toBe(false);
    expect(scannerReducer(state, { type: "expire", approvalId: "older-approval" })).toBe(state);
  });
  it("consumes displayed confirmation before awaiting and removes previous results", async () => {
    const { state } = await quoted();
    const started = scannerReducer({ ...state, acknowledged: true, scan: demo }, { type: "begin", action: "confirm" });
    expect(started.quote).toBeNull(); expect(started.scan).toBeNull(); expect(started.acknowledged).toBe(false);
    expect(scannerStatus(started, true).label).toBe("SCAN IN PROGRESS"); expect(canConfirm(started, NOW)).toBe(false);
  });
  it("discovery resets expired approvals and shows loading independently", async () => {
    const { state } = await quoted();
    const started = scannerReducer({ ...state, quoteExpired: true }, { type: "begin", action: "discover" });
    expect(started.quoteExpired).toBe(false); expect(started.selected).toEqual([]); expect(started.discovery).toBeNull();
    expect(scannerStatus(started, true).label).toBe("DISCOVERY LOADING");
  });
  it("insufficient verified venues cannot be presented as no arbitrage", async () => {
    const { state } = await quoted();
    const restricted: ScannerState = { ...state, quote: null, discovery: { ...state.discovery!, bookmakers: [], restrictions: ["No coverage"] } };
    expect(scannerStatus(restricted, true).label).toBe("INSUFFICIENT BOOKMAKER COVERAGE");
  });
  it("LIVE errors clear results and retain actual error receipts without synthetic fallback", () => {
    const error = { code: "UNAVAILABLE", message: "No data", status: 503, retryAfter: "30", usage: { cost: 12, used: 12, remaining: null, limit: null, resetsAt: null } };
    const state = scannerReducer({ ...live(), scan: demo }, { type: "error", error });
    expect(state.scan).toBeNull(); expect(state.usage).toEqual(error.usage); expect(scannerStatus(state, true).label).toBe("PROVIDER ERROR");
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
