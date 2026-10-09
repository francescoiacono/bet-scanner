import type { demoScan } from "@/lib/odds/demo";
import type { OddsMode, ProviderError, ProviderUsage } from "@/lib/odds/types";
import type { Discovery, ScanQuote } from "@/lib/odds/server/service";
import { APPROVAL_LIFETIME_MS, instant } from "@/lib/odds/validation";

export type Scan = ReturnType<typeof demoScan> & { usage?: ProviderUsage; unchanged?: boolean };
export interface ScannerState {
  mode: OddsMode;
  scan: Scan | null;
  discovery: Discovery | null;
  discoveryExpired: boolean;
  selected: string[];
  quote: ScanQuote | null;
  quoteExpired: boolean;
  acknowledged: boolean;
  usage: ProviderUsage | null;
  error: ProviderError | null;
  busy: string;
}
export type ScannerAction =
  | { type: "mode"; mode: OddsMode; demo: Scan }
  | { type: "bookmaker"; id: string }
  | { type: "acknowledge"; value: boolean }
  | { type: "begin"; action: string }
  | { type: "finish" }
  | { type: "discovery"; discovery: Discovery; now: number }
  | { type: "discovery-expire"; capturedAt: string }
  | { type: "quote"; quote: ScanQuote }
  | { type: "expire"; approvalId: string }
  | { type: "scan"; scan: Scan }
  | { type: "usage"; usage: ProviderUsage }
  | { type: "error"; error: ProviderError };

export function initialScannerState(demo: Scan, configured = false): ScannerState {
  return { mode: configured ? "LIVE" : "DEMO", scan: configured ? null : demo, discovery: null, discoveryExpired: false, selected: [], quote: null, quoteExpired: false, acknowledged: false, usage: null, error: null, busy: "" };
}

/** UI transitions only. Token authorization remains entirely in the existing server. */
export function scannerReducer(state: ScannerState, action: ScannerAction): ScannerState {
  switch (action.type) {
    case "mode": return { ...state, mode: action.mode, scan: action.mode === "DEMO" ? action.demo : null, quote: null, quoteExpired: false, acknowledged: false, error: null };
    case "bookmaker": return { ...state, selected: state.selected.includes(action.id) ? state.selected.filter((id) => id !== action.id) : [...state.selected, action.id], quote: null, quoteExpired: false, acknowledged: false };
    case "acknowledge": return { ...state, acknowledged: action.value };
    case "begin": return { ...state, busy: action.action, error: null,
      ...(action.action === "discover" ? { discovery: null, discoveryExpired: false, selected: [], quote: null, quoteExpired: false, acknowledged: false } : {}),
      ...(action.action === "quote" || action.action === "confirm" ? { quote: null, quoteExpired: false, acknowledged: false } : {}),
      ...(action.action === "confirm" ? { scan: null } : {}) };
    case "finish": return { ...state, busy: "" };
    case "discovery": return { ...state, discovery: action.discovery, discoveryExpired: !discoveryFreshness(action.discovery, action.now).fresh, usage: action.discovery.usage, selected: ["bet365", "ladbrokes"].filter((id) => action.discovery.bookmakers.some((b) => b.id === id && b.eligible)) };
    case "discovery-expire": return state.discovery?.capturedAt === action.capturedAt ? { ...state, discoveryExpired: true } : state;
    case "quote": return { ...state, quote: action.quote, quoteExpired: false, acknowledged: false, usage: action.quote.usage };
    case "expire": return state.quote?.approvalId === action.approvalId ? { ...state, quoteExpired: true, acknowledged: false } : state;
    case "scan": return { ...state, scan: action.scan, usage: action.scan.usage ?? null };
    case "usage": return { ...state, usage: action.usage };
    case "error": return { ...state, error: action.error, usage: action.error.usage ?? state.usage, ...(state.mode === "LIVE" ? { scan: null } : {}) };
  }
}

export function canConfirm(state: ScannerState, now: number): boolean {
  return state.mode === "LIVE" && !state.busy && state.acknowledged && !state.quoteExpired && Boolean(state.quote?.approvalId) && state.quote!.blocked.length === 0 && now >= Date.parse(state.quote!.createdAt) && now < Date.parse(state.quote!.expiresAt);
}

/** The discovery policy shares the server's lifetime, but never extends quote approvals. */
export function discoveryFreshness(discovery: Pick<Discovery, "capturedAt"> | null, now: number): { fresh: boolean; expiresAt: number | null } {
  if (!discovery || !Number.isFinite(now)) return { fresh: false, expiresAt: null };
  let capturedAt: number;
  try { capturedAt = instant(discovery.capturedAt); } catch { return { fresh: false, expiresAt: null }; }
  if (capturedAt > now) return { fresh: false, expiresAt: null };
  const expiresAt = capturedAt + APPROVAL_LIFETIME_MS;
  return { fresh: now < expiresAt, expiresAt };
}

type Status = { label: string; tone: "neutral" | "positive" | "warning" | "error" };
export type DiscoveryStatus = Status & {
  kind: "NOT CONFIGURED" | "CONFIGURED BUT UNVERIFIED" | "VERIFYING" | "VERIFIED" | "DISCOVERY EXPIRED" | "INSUFFICIENT COVERAGE" | "PROVIDER ERROR";
  ready: boolean;
  guidance: string;
};

export function discoveryStatus(state: ScannerState, configured: boolean, now: number): DiscoveryStatus {
  if (!configured) return { kind: "NOT CONFIGURED", label: "Not configured", tone: "warning", ready: false, guidance: "Configure a server API key to load available bookmakers." };
  if (state.busy === "discover") return { kind: "VERIFYING", label: "Verifying…", tone: "neutral", ready: false, guidance: "Loading bookmakers and verifying free coverage…" };
  if (state.error) return { kind: "PROVIDER ERROR", label: "Provider error", tone: "error", ready: false, guidance: "Discovery is not ready. Use Refresh discovery · free to verify availability again." };
  if (!state.discovery) return { kind: "CONFIGURED BUT UNVERIFIED", label: "Configured but unverified", tone: "warning", ready: false, guidance: "Press Refresh discovery · free to verify the account and load bookmakers. No provider requests run automatically." };
  if (state.discoveryExpired || !discoveryFreshness(state.discovery, now).fresh) return { kind: "DISCOVERY EXPIRED", label: "Discovery expired — refresh required", tone: "warning", ready: false, guidance: "Bookmaker availability was verified earlier. Refresh the free discovery before requesting another quote." };
  if (state.discovery.restrictions.length || state.discovery.bookmakers.filter((b) => b.eligible).length < 2) return { kind: "INSUFFICIENT COVERAGE", label: "Insufficient coverage", tone: "warning", ready: false, guidance: "Fewer than two eligible bookmakers or account restrictions prevent a quote. Refresh discovery · free to check again." };
  return { kind: "VERIFIED", label: "Verified", tone: "positive", ready: true, guidance: "Discovery is valid for 60 seconds from its checked timestamp. Choose two or three eligible bookmakers before requesting a free quote." };
}

export function canQuote(state: ScannerState, configured: boolean, now: number): boolean {
  return state.mode === "LIVE" && !state.busy && discoveryStatus(state, configured, now).ready && state.selected.length >= 2 && state.selected.length <= 3 && state.selected.every((id) => state.discovery!.bookmakers.some((b) => b.id === id && b.eligible));
}

export function scannerStatus(state: ScannerState, configured: boolean, now: number): Status {
  if (state.busy) return { label: state.busy === "confirm" ? "SCAN IN PROGRESS" : state.busy === "discover" ? "VERIFYING" : "PROCESSING FREE ACTION", tone: "neutral" };
  if (state.mode === "DEMO") return { label: "DEMO", tone: "neutral" };
  if (!configured) return { label: "NOT CONFIGURED", tone: "warning" };
  if (state.error) return { label: "PROVIDER ERROR", tone: "error" };
  if (state.quoteExpired) return { label: "QUOTE EXPIRED", tone: "warning" };
  if (state.quote) return { label: state.quote.blocked.length ? "QUOTE BLOCKED" : "QUOTE AVAILABLE", tone: state.quote.blocked.length ? "warning" : "positive" };
  const readiness = discoveryStatus(state, configured, now);
  if (!readiness.ready) return { label: readiness.kind, tone: readiness.tone };
  if (state.scan) return resultStatus(state.scan.analysis.status);
  return { label: "READY FOR FREE QUOTE", tone: "neutral" };
}

export function resultStatus(status: Scan["analysis"]["status"]): { label: string; tone: "neutral" | "positive" | "warning" } {
  return status === "THEORETICAL ARBITRAGE" ? { label: status, tone: "positive" } : status === "INSUFFICIENT DATA" ? { label: "INSUFFICIENT VALID DATA", tone: "warning" } : { label: status, tone: "neutral" };
}
