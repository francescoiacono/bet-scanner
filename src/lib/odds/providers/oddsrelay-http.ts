import type { ProviderError, ProviderUsage } from "../types";
import { balance, integer, nullableTime, object } from "./oddsrelay-contract";
import { text } from "../validation";

export class OddsProviderError extends Error {
  constructor(readonly detail: ProviderError) { super(detail.message); this.name = "OddsProviderError"; }
}
export function tokenHeaders(headers: Headers): ProviderUsage {
  const count = (key: string) => { const value = headers.get(key); if (value === null) return null; if (!/^\d+$/.test(value)) throw new RangeError("Malformed token header."); return integer(Number(value)); };
  const tokens = (key: string) => { const value = headers.get(key); return value === "unlimited" ? value : count(key); };
  return { cost: count("X-Tokens-Cost"), used: count("X-Tokens-Used"), remaining: tokens("X-Tokens-Remaining"), limit: tokens("X-Tokens-Limit"), resetsAt: nullableTime(headers.get("X-Tokens-Reset")) };
}
export interface ScanRequest { region: "uk"; sports: "soccer"; markets: "h2h"; bookmakers: string[]; }
export function canonicalRequest(bookmakers: unknown): ScanRequest {
  if (!Array.isArray(bookmakers) || bookmakers.length < 2 || bookmakers.length > 3 || bookmakers.some((b) => typeof b !== "string" || !/^[a-z0-9_]+$/.test(b)) || new Set(bookmakers).size !== bookmakers.length) throw new RangeError("Select exactly two or three distinct discovered bookmakers.");
  return { region: "uk", sports: "soccer", markets: "h2h", bookmakers: [...bookmakers].sort() };
}
export function requestIdentity(request: ScanRequest): string { return JSON.stringify(canonicalRequest(request.bookmakers)); }
export type FreeEndpoint = "usage" | "bookmakers" | "sports" | "events" | "coverage" | "pricing";
export interface RelayResponse { body: unknown; usage: ProviderUsage; etag: string | null; unchanged: boolean; }
export interface OddsProvider {
  free(endpoint: FreeEndpoint, cursor?: string): Promise<RelayResponse>;
  quote(request: ScanRequest): Promise<{ cost: number; remaining: ReturnType<typeof balance>; rateCard: string }>;
  scan(request: ScanRequest, etag?: string): Promise<RelayResponse>;
}
const FREE_ENDPOINTS = ["usage", "bookmakers", "sports", "events", "coverage", "pricing"];
const messages: Record<number, string> = {
  400: "Provider rejected the filters. Refresh discovery and narrow the request.",
  401: "OddsRelay key is invalid, expired, paused or revoked. Check server configuration.",
  402: "Insufficient provider tokens. Narrow the filters or wait for the allowance reset; no automatic retry.",
  403: "This key or plan does not permit the requested product, region, market or bookmaker.",
  429: "Provider rate limit reached. Wait for Retry-After, then start a new manual action.",
  500: "Provider error. No automatic retry; a scan may need a new quote.",
  502: "Provider gateway error. Request outcome may be ambiguous; no automatic retry.",
  503: "Provider data is unavailable. Wait for Retry-After, then start a new manual action.",
};
/** No constructor I/O. Authentication never appears in URLs, logs or returned errors. */
export class OddsRelayProvider implements OddsProvider {
  private readonly freeCache = new Map<string, { body: unknown; etag: string; at: number }>();
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = fetch, private readonly clock = Date.now) {}
  private async get(path: string, params: URLSearchParams, etag?: string): Promise<RelayResponse> {
    const url = new URL(path, "https://api.oddsrelay.io"); url.search = params.toString();
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${this.key}`, "Accept-Encoding": "gzip", Accept: "application/json", ...(etag ? { "If-None-Match": etag } : {}) }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch { throw new OddsProviderError({ code: "NETWORK_UNCERTAIN", status: 502, message: "Network failure or timeout. Token use may be uncertain. Do not retry confirmation; obtain a new free quote.", retryAfter: null }); }
    let usage: ProviderUsage;
    try { usage = tokenHeaders(response.headers); } catch { throw new OddsProviderError({ code: "INVALID_USAGE", status: 502, message: "Provider returned invalid token headers; token use is uncertain. Obtain a new quote.", retryAfter: null }); }
    if (response.status === 304) return { body: null, usage, etag: response.headers.get("ETag"), unchanged: true };
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      try { const candidate = object(object(body).error).code; if (typeof candidate === "string" && /^[a-z0-9_]+$/.test(candidate)) code = candidate; } catch { /* empty gateway errors are documented */ }
      throw new OddsProviderError({ code, status: response.status, message: messages[response.status] ?? "Provider request failed. No automatic retry.", retryAfter: response.headers.get("Retry-After"), usage });
    }
    if (body === null) throw new OddsProviderError({ code: "INVALID_RESPONSE", status: 502, message: "Provider returned invalid JSON. No automatic retry.", retryAfter: null, usage });
    return { body, usage, etag: response.headers.get("ETag"), unchanged: false };
  }
  async free(endpoint: FreeEndpoint, cursor?: string): Promise<RelayResponse> {
    if (!FREE_ENDPOINTS.includes(endpoint)) throw new RangeError("Unsupported free endpoint.");
    if (cursor !== undefined && endpoint !== "sports" && endpoint !== "events") throw new RangeError("This endpoint does not accept a cursor.");
    const params = new URLSearchParams();
    if (["sports", "events", "coverage"].includes(endpoint)) params.set("region", "uk");
    if (endpoint === "events") params.set("sport", "soccer");
    if (cursor !== undefined) params.set("cursor", cursor);
    const cacheKey = `${endpoint}?${params}`, entry = this.freeCache.get(cacheKey);
    const cached = entry && this.clock() - entry.at < 120_000 ? entry : undefined;
    const response = await this.get(`/v2/${endpoint}`, params, cached?.etag);
    if (response.unchanged) {
      if (!cached) throw new RangeError("304 without a usable discovery cache.");
      return { ...response, body: cached.body };
    }
    if (response.etag) {
      if (this.freeCache.size >= 32) this.freeCache.delete(this.freeCache.keys().next().value!);
      this.freeCache.set(cacheKey, { body: response.body, etag: response.etag, at: this.clock() });
    }
    return response;
  }
  private parameters(request: ScanRequest) {
    const r = canonicalRequest(request.bookmakers);
    if (request.region !== r.region || request.sports !== r.sports || request.markets !== r.markets) throw new RangeError("Only UK football full-time h2h requests are supported.");
    return new URLSearchParams({ region: r.region, sports: r.sports, markets: r.markets, bookmakers: r.bookmakers.join(",") });
  }
  async quote(request: ScanRequest) {
    const params = this.parameters(request); params.set("quote", "true");
    const response = await this.get("/v2/odds/standard", params);
    if (response.unchanged) throw new RangeError("A free quote cannot be a 304.");
    const body = object(response.body);
    if (response.usage.cost !== null && response.usage.cost !== 0) throw new RangeError("Unexpected nonzero token cost on free quote.");
    return { cost: integer(body.cost), remaining: balance(body.remaining), rateCard: text(body.rate_card, "quote rate card") };
  }
  scan(request: ScanRequest, etag?: string) { return this.get("/v2/odds/standard", this.parameters(request), etag); }
}
