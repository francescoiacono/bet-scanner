import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Discovery, ScanQuote } from "../lib/odds/server/service";
import { demoScan } from "../lib/odds/demo";
import { NOW, USAGE } from "../lib/odds/test-helpers";
import OddsDashboard, { BookmakerSelector, ProviderErrorNotice } from "./odds-dashboard";
import type { ScannerState } from "./scanner-state";

type Effect = { setup: () => void | (() => void); deps: unknown[]; cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], pending: [] as Effect[] }));

// Exercise the actual dashboard handlers and effects without a DOM dependency.
// Hook slots retain state across explicit render/commit cycles; all HTTP is mocked.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useReducer: (reduce: (state: unknown, action: unknown) => unknown, input: unknown, init: (input: unknown) => unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.slots)) hooks.slots[slot] = init(input);
    return [hooks.slots[slot], (action: unknown) => { hooks.slots[slot] = reduce(hooks.slots[slot], action); }];
  },
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === "function" ? initial() : initial;
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = value; }];
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial };
    return hooks.slots[slot];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (setup: Effect["setup"], deps: unknown[]) => {
    const slot = hooks.cursor++, previous = hooks.slots[slot] as Effect | undefined;
    if (previous && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return;
    previous?.cleanup?.();
    const effect = { setup, deps };
    hooks.slots[slot] = effect;
    hooks.pending.push(effect);
  },
}));

const demo = demoScan(NOW);
const discovery = (now = NOW): Discovery => ({
  capturedAt: new Date(now).toISOString(), plan: "test", usage: USAGE, competitionCount: 1, restrictions: [],
  bookmakers: ["bet365", "ladbrokes", "other"].map((id) => ({ id, name: id, eligible: true, reason: null, isExchange: false, regions: ["uk"], events: 10, lastSeen: new Date(now).toISOString() })),
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const state = () => hooks.slots[0] as ScannerState;
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function content(tree: ReactNode): string {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (isValidElement<Record<string, unknown>>(tree)) return content(tree.props.children as ReactNode);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
function render(configured = true, commit = true) {
  hooks.cursor = 0;
  const tree = OddsDashboard({ configured, initialDemo: demo });
  if (commit) for (const effect of hooks.pending.splice(0)) effect.cleanup = effect.setup();
  return tree;
}
function button(tree: ReactNode, label: string) {
  const found = nodes(tree).find((node) => node.type === "button" && content(node).startsWith(label));
  if (!found) throw new Error("Missing button: " + label);
  return found;
}
const click = (node: Node) => (node.props.onClick as () => Promise<void> | void)();
function effects() { return hooks.slots.filter((slot): slot is Effect => Boolean(slot && typeof slot === "object" && "setup" in slot)); }
function unmount() { for (const effect of effects()) effect.cleanup?.(); }

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.pending = []; vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { unmount(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("manual discovery and local expiration in the dashboard", () => {
  it.each([false, true])("opening and hydration, including effect replay and rerenders, make no requests (configured=%s)", async (configured) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No automatic I/O"));
    const tree = render(configured, false);
    expect(state().mode).toBe(configured ? "LIVE" : "DEMO");
    expect(content(tree)).toContain(configured ? "Configured but unverified" : "Not configured");
    render(configured);
    for (const effect of effects()) { effect.cleanup?.(); effect.cleanup = effect.setup(); }
    render(configured); render(configured);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("switching Live to Demo and returning to Live never discovers", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No automatic I/O"));
    await click(button(render(), "Demo"));
    expect(state().mode).toBe("DEMO");
    await click(button(render(), "Live Source"));
    expect(state().mode).toBe("LIVE"); expect(content(render())).toContain("Configured but unverified");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("manual Refresh submits one discovery action and prevents duplicate submission while loading", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const refresh = button(render(), "Refresh discovery");
    const first = click(refresh), duplicate = click(refresh);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ action: "discover", mode: "LIVE" });
    const loading = render();
    expect(content(loading)).toContain("Verifying…"); expect(button(loading, "Checking coverage").props.disabled).toBe(true);
    finish(response(discovery())); await first; await duplicate;
    expect(content(render())).toContain("Verified"); expect(state().usage).toEqual(USAGE);
    expect(state().selected).toEqual(["bet365", "ladbrokes"]); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires at 60 seconds without network activity and preserves historical coverage through mode changes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(discovery()));
    await click(button(render(), "Refresh discovery")); render();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(button(render(), "Get quote").props.disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const expired = render();
    expect(content(expired)).toContain("Discovery expired — refresh required");
    expect(content(expired)).toContain("Bookmaker availability was verified earlier. Refresh the free discovery before requesting another quote.");
    expect(content(expired)).toContain("checked 2026-10-08 12:00:00.000 UTC");
    expect(button(expired, "Get quote").props.disabled).toBe(true);
    const selector = nodes(expired).find((node) => node.type === BookmakerSelector)!;
    expect(selector.props.verified).toBe(false); expect(selector.props.selected).toEqual(["bet365", "ladbrokes"]);
    await click(button(expired, "Demo")); render();
    await click(button(render(), "Live Source"));
    expect(content(render())).toContain("Discovery expired — refresh required");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it("checks current time on quote and selection clicks even if the local expiry timer has not fired", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(discovery()));
    await click(button(render(), "Refresh discovery"));
    const fresh = render(), requestQuote = button(fresh, "Get quote");
    const selector = nodes(fresh).find((node) => node.type === BookmakerSelector)!;
    vi.setSystemTime(NOW + 60_000);
    await click(requestQuote);
    (selector.props.onToggle as (id: string) => void)("other");
    expect(state().selected).toEqual(["bet365", "ladbrokes"]);
    expect(content(render())).toContain("Discovery expired — refresh required"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refresh replaces coverage, drops unavailable preferences and cleans up the previous timer", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(discovery()));
    await click(button(render(), "Refresh discovery")); render();
    await vi.advanceTimersByTimeAsync(30_000);
    const refreshed = discovery(NOW + 30_000);
    refreshed.bookmakers[1].eligible = false; refreshed.bookmakers[1].reason = "No coverage";
    fetch.mockResolvedValueOnce(response(refreshed));
    await click(button(render(), "Refresh discovery")); render();
    expect(state().selected).toEqual(["bet365"]); expect(state().discovery).toEqual(refreshed);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(content(render())).not.toContain("Discovery expired — refresh required");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(content(render())).toContain("Discovery expired — refresh required"); expect(fetch).toHaveBeenCalledTimes(2);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps an approved quote confirmable after discovery expires, then prevents submission at approval expiry", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(discovery()));
    await click(button(render(), "Refresh discovery")); render();
    await vi.advanceTimersByTimeAsync(30_000);
    const quote: ScanQuote = { approvalId: "test-approval", cost: 100, usage: USAGE, projectedRemaining: 2300, blocked: [], createdAt: new Date(NOW + 30_000).toISOString(), expiresAt: new Date(NOW + 90_000).toISOString(), request: { region: "uk", sports: "soccer", markets: "h2h", bookmakers: ["bet365", "ladbrokes"] } };
    fetch.mockResolvedValueOnce(response(quote)); await click(button(render(), "Get quote"));
    const checkbox = nodes(render()).find((node) => node.type === "input" && node.props.type === "checkbox")!;
    (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    render(); await vi.advanceTimersByTimeAsync(30_000);
    const expiredDiscovery = render(), confirm = button(expiredDiscovery, "Confirm Scan");
    expect(button(expiredDiscovery, "Get quote").props.disabled).toBe(true); expect(confirm.props.disabled).toBe(false);
    expect(state().quote).toEqual(quote); expect(state().acknowledged).toBe(true);
    expect(content(expiredDiscovery)).toContain("An existing approved quote keeps its own expiry");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(button(render(), "Confirm Scan").props.disabled).toBe(true);
    await click(confirm); // The earlier closure must also reject an expired approval.
    expect(fetch).toHaveBeenCalledTimes(2); expect(state().quoteExpired).toBe(true);
  });

  it("shows discovery errors without fabricating availability or retrying", async () => {
    const error = { code: "TEST_PROVIDER_ERROR", message: "Test provider unavailable", status: 503, retryAfter: null };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error }, 503));
    await click(button(render(), "Refresh discovery"));
    const failed = render(); expect(nodes(failed).find((node) => node.type === ProviderErrorNotice)?.props.error).toEqual(error); expect(content(failed)).toContain("Provider error");
    expect(button(failed, "Get quote").props.disabled).toBe(true); expect(state().discovery).toBeNull(); expect(state().selected).toEqual([]);
    await vi.advanceTimersByTimeAsync(120_000); render();
    expect(fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it("unmount and effect replay clean up local timers without issuing requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(discovery()));
    await click(button(render(), "Refresh discovery")); render();
    for (const effect of effects()) { effect.cleanup?.(); effect.cleanup = effect.setup(); }
    expect(vi.getTimerCount()).toBe(1);
    unmount(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
