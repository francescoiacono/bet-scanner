import type { demoScan } from "@/lib/odds/demo";
import type { OddsMode, ProviderError, ProviderUsage } from "@/lib/odds/types";
import type { Discovery, ScanQuote } from "@/lib/odds/server/service";

export type Scan = ReturnType<typeof demoScan> & { usage?: ProviderUsage; unchanged?: boolean };
export interface ScannerState {
  mode: OddsMode;
  scan: Scan | null;
  discovery: Discovery | null;
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
  | { type: "discovery"; discovery: Discovery }
  | { type: "quote"; quote: ScanQuote }
  | { type: "expire"; approvalId: string }
  | { type: "scan"; scan: Scan }
  | { type: "usage"; usage: ProviderUsage }
  | { type: "error"; error: ProviderError };

export function initialScannerState(demo: Scan, configured = false): ScannerState {
  return { mode: configured ? "LIVE" : "DEMO", scan: configured ? null : demo, discovery: null, selected: [], quote: null, quoteExpired: false, acknowledged: false, usage: null, error: null, busy: "" };
}

/** UI transitions only. Token authorization remains entirely in the existing server. */
export function scannerReducer(state: ScannerState, action: ScannerAction): ScannerState {
  switch (action.type) {
    case "mode": return { ...state, mode: action.mode, scan: action.mode === "DEMO" ? action.demo : null, quote: null, quoteExpired: false, acknowledged: false, error: null };
    case "bookmaker": return { ...state, selected: state.selected.includes(action.id) ? state.selected.filter((id) => id !== action.id) : [...state.selected, action.id], quote: null, quoteExpired: false, acknowledged: false };
    case "acknowledge": return { ...state, acknowledged: action.value };
    case "begin": return { ...state, busy: action.action, error: null,
      ...(action.action === "discover" ? { discovery: null, selected: [], quote: null, quoteExpired: false, acknowledged: false } : {}),
      ...(action.action === "quote" || action.action === "confirm" ? { quote: null, quoteExpired: false, acknowledged: false } : {}),
      ...(action.action === "confirm" ? { scan: null } : {}) };
    case "finish": return { ...state, busy: "" };
    case "discovery": return { ...state, discovery: action.discovery, usage: action.discovery.usage, selected: ["bet365", "ladbrokes"].filter((id) => action.discovery.bookmakers.some((b) => b.id === id && b.eligible)) };
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

export function scannerStatus(state: ScannerState, configured: boolean): { label: string; tone: "neutral" | "positive" | "warning" | "error" } {
  if (state.busy) return { label: state.busy === "confirm" ? "SCAN IN PROGRESS" : state.busy === "discover" ? "DISCOVERY LOADING" : "PROCESSING FREE ACTION", tone: "neutral" };
  if (state.mode === "DEMO") return { label: "DEMO", tone: "neutral" };
  if (!configured) return { label: "LIVE NOT CONFIGURED", tone: "warning" };
  if (state.error) return { label: "PROVIDER ERROR", tone: "error" };
  if (state.quoteExpired) return { label: "QUOTE EXPIRED", tone: "warning" };
  if (state.quote) return { label: state.quote.blocked.length ? "QUOTE BLOCKED" : "QUOTE AVAILABLE", tone: state.quote.blocked.length ? "warning" : "positive" };
  if (!state.discovery) return { label: "ACCOUNT NOT VERIFIED", tone: "warning" };
  if (state.discovery.restrictions.length || state.discovery.bookmakers.filter((b) => b.eligible).length < 2) return { label: "INSUFFICIENT BOOKMAKER COVERAGE", tone: "warning" };
  if (state.scan) return resultStatus(state.scan.analysis.status);
  return { label: "READY FOR FREE QUOTE", tone: "neutral" };
}

export function resultStatus(status: Scan["analysis"]["status"]): { label: string; tone: "neutral" | "positive" | "warning" } {
  return status === "THEORETICAL ARBITRAGE" ? { label: status, tone: "positive" } : status === "INSUFFICIENT DATA" ? { label: "INSUFFICIENT VALID DATA", tone: "warning" } : { label: status, tone: "neutral" };
}
