import type { Bookmaker, ProviderUsage, TokenBalance } from "../types";
import { instant, text } from "../validation";

// Official /v2 OpenAPI 2026-07-08, verified 2026-10-08. Parse only consumed fields.
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RangeError("Invalid OddsRelay response object.");
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new RangeError("Invalid OddsRelay response array."); return value; }
export function strings(value: unknown): string[] { return array(value).map((v) => text(v, "catalogue value")); }
export function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid token/count value."); return value; }
export function balance(value: unknown): TokenBalance { return value === null || value === "unlimited" ? value : integer(value); }
export function nullableTime(value: unknown): string | null { if (value === null || value === undefined) return null; instant(value); return value as string; }
export interface SportInfo { key: string; title: string; group: string; active: boolean; markets: string[]; regions: string[]; }
export interface VenueInfo extends Bookmaker { regions: string[]; }
export interface AccountInfo {
  usage: ProviderUsage;
  plan: string | null;
  active: boolean;
  products: string[];
  regions: string[];
  scope: Record<string, unknown> | null;
}
export function parseUsage(value: unknown): AccountInfo {
  const r = object(value), tokens = object(r.tokens), key = object(r.key), account = object(r.account);
  // An empty key region list inherits the account regions; it does not deny all regions.
  // Keep an explicit key restriction intersected with the account's authorized regions.
  const accountRegions = strings(r.regions), keyRegions = strings(key.regions);
  const regions = accountRegions.filter((region) => keyRegions.length === 0 || keyRegions.includes(region));
  return { usage: { cost: null, used: tokens.used === null ? null : integer(tokens.used), remaining: balance(tokens.remaining), limit: balance(tokens.limit), resetsAt: nullableTime(tokens.resets_at) },
    plan: r.plan === null ? null : text(r.plan, "plan"), active: account.status === "active" && key.kind === "server", products: strings(key.products), regions, scope: r.scope === null ? null : object(r.scope) };
}
export function parseVenues(value: unknown): VenueInfo[] {
  const rows = array(object(value).data).map((v) => {
    const r = object(v); if (typeof r.is_exchange !== "boolean") throw new RangeError("Missing venue kind.");
    return { id: text(r.key, "venue key"), name: text(r.name, "venue name"), isExchange: r.is_exchange, regions: strings(r.regions) };
  });
  if (new Set(rows.map((v) => v.id)).size !== rows.length) throw new RangeError("Duplicate venue identities.");
  return rows;
}
export function parseSportPage(value: unknown): { sports: SportInfo[]; cursor: string | null } {
  const r = object(value), meta = object(r.meta);
  // Catalogue display labels can contain surrounding whitespace (e.g. "Lega A\t").
  // Normalize that label only; identifiers, group, markets and board matching stay strict.
  const sports = array(r.data).map((v) => { const s = object(v); return { key: text(s.key, "sport key"), title: text(typeof s.title === "string" ? s.title.trim() : s.title, "competition title"), group: text(s.group, "sport group"), active: s.active === true, markets: strings(s.markets), regions: strings(s.regions) }; });
  return { sports, cursor: meta.next_cursor === null ? null : text(meta.next_cursor, "sport cursor") };
}
export function footballSport(s: SportInfo): boolean { return s.key.startsWith("soccer_") && ["Soccer", "Football"].includes(s.group) && s.active && s.regions.includes("uk") && s.markets.includes("h2h"); }
export function scopeAllows(account: AccountInfo, bookmaker?: string): boolean {
  if (!account.active || !account.products.includes("standard") || !account.regions.includes("uk")) return false;
  if (account.scope === null) return true;
  const products = object(account.scope.products); if (!("standard" in products)) return false;
  const scope = object(products.standard);
  const permits = (axis: string, value: string, prefix = false) => scope[axis] === null || strings(scope[axis]).some((s) => prefix ? value.startsWith(s) : value === s);
  return permits("sports", "soccer", true) && permits("markets", "h2h") && (!bookmaker || permits("bookmakers", bookmaker));
}
