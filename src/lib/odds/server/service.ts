import { analyseSnapshot } from "../arbitrage";
import type { OddsSnapshot, ProviderUsage } from "../types";
import { APPROVAL_LIFETIME_MS, MAX_TOKENS_PER_SCAN, priceEvidenceError, text } from "../validation";
import { array, footballSport, integer, nullableTime, object, parseSportPage, parseUsage, parseVenues, scopeAllows, strings, type AccountInfo, type SportInfo, type VenueInfo } from "../providers/oddsrelay-contract";
import { canonicalRequest, OddsProviderError, requestIdentity, type OddsProvider, type ScanRequest } from "../providers/oddsrelay-http";
import { normalizeOddsRelay } from "../providers/oddsrelay-normalize";

const CACHE_LIFETIME_MS = 300_000;
export interface AvailableBookmaker extends VenueInfo { events: number; lastSeen: string | null; eligible: boolean; reason: string | null; }
export interface Discovery {
  usage: ProviderUsage;
  plan: string | null;
  bookmakers: AvailableBookmaker[];
  competitionCount: number;
  capturedAt: string;
  restrictions: string[];
}
interface DiscoveryCache { public: Discovery; venues: VenueInfo[]; sports: SportInfo[]; account: AccountInfo; at: number; }
export interface ScanQuote {
  request: ScanRequest;
  cost: number;
  usage: ProviderUsage;
  projectedRemaining: ProviderUsage["remaining"];
  approvalId: string | null;
  createdAt: string;
  expiresAt: string;
  blocked: string[];
}
interface Approval { owner: string; request: ScanRequest; cost: number; at: number; discovery: DiscoveryCache; }
interface CachedSnapshot { snapshot: OddsSnapshot; etag: string | null; at: number; }
function fail(code: string, message: string, status = 409): never { throw new OddsProviderError({ code, message, status, retryAfter: null }); }
function budgetReasons(cost: number, usage: ProviderUsage): string[] {
  const reasons: string[] = [];
  if (cost > MAX_TOKENS_PER_SCAN) reasons.push("Quote exceeds the 500-token scan maximum. Choose a narrower bookmaker subset.");
  if (usage.remaining === null) reasons.push("Remaining tokens are unknown. Refresh account usage before scanning.");
  if (typeof usage.remaining === "number" && cost > usage.remaining) reasons.push("Quoted cost exceeds remaining tokens. Narrow the filters or wait for reset.");
  return reasons;
}
/** Process-local service. No timers, startup requests, disk writes or automatic retries. */
export class OddsScannerService {
  private discoveryCache: DiscoveryCache | null = null;
  private readonly approvals = new Map<string, Approval>();
  private readonly snapshots = new Map<string, CachedSnapshot>();
  private scanning = false;
  constructor(private readonly provider: OddsProvider, private readonly clock: () => number, private readonly newId: () => string) {}
  private prune() {
    const now = this.clock();
    for (const [id, a] of this.approvals) if (now - a.at >= APPROVAL_LIFETIME_MS || now < a.at) this.approvals.delete(id);
    for (const [id, s] of this.snapshots) if (now - s.at >= CACHE_LIFETIME_MS || now < s.at) this.snapshots.delete(id);
  }
  async discover(): Promise<Discovery> {
    // Bounded sequential pagination is part of this explicit FREE action, never a poll.
    const account = parseUsage((await this.provider.free("usage")).body);
    const venues = parseVenues((await this.provider.free("bookmakers")).body);
    const coverage = object((await this.provider.free("coverage")).body);
    if (coverage.region !== "uk") fail("COVERAGE_REGION", "Provider coverage is not for UK.");
    const sports: SportInfo[] = [], cursors = new Set<string>(); let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = parseSportPage((await this.provider.free("sports", cursor)).body); sports.push(...result.sports);
      if (result.cursor === null) break;
      if (page === 19 || cursors.has(result.cursor)) fail("CATALOGUE_INCOMPLETE", "Football discovery could not finish safely. Start a new free discovery.");
      cursors.add(result.cursor); cursor = result.cursor;
    }
    if (new Set(sports.map((s) => s.key)).size !== sports.length) fail("CATALOGUE_AMBIGUOUS", "Duplicate competition identities in discovery.");
    const products = object(coverage.products), standard = products.standard === undefined ? null : object(products.standard);
    const rows = standard ? array(standard.bookmakers) : [];
    const coverageByKey = new Map(rows.map((v) => { const r = object(v); if (typeof r.key !== "string") throw new RangeError("Invalid coverage venue."); return [r.key, r] as const; }));
    if (coverageByKey.size !== rows.length) fail("COVERAGE_AMBIGUOUS", "Duplicate bookmaker coverage identities.");
    const now = this.clock(), restrictions: string[] = [];
    if (!scopeAllows(account)) restrictions.push("The current account/key scope does not permit standard UK soccer h2h requests.");
    if (!sports.some(footballSport)) restrictions.push("No unambiguous active football h2h competitions were discovered.");
    const bookmakers = venues.filter((v) => !v.isExchange && v.regions.includes("uk")).map((v): AvailableBookmaker => {
      const coverageRow = coverageByKey.get(v.id), sport = coverageRow ? object(object(coverageRow.sports).soccer ?? {}) : {};
      const events = sport.events === undefined ? 0 : integer(sport.events), lastSeen = typeof sport.last_seen === "string" ? sport.last_seen : null;
      const reason = !scopeAllows(account, v.id) ? "Outside account/key scope" : !events ? "No standard soccer coverage" : priceEvidenceError(lastSeen, now);
      return { ...v, events, lastSeen, eligible: reason === null && restrictions.length === 0, reason: reason ?? (restrictions[0] ?? null) };
    });
    if (bookmakers.filter((v) => v.eligible).length < 2) restrictions.push("Fewer than two fresh covered bookmakers. NO VERIFIED OPPORTUNITY; no raw-board fallback.");
    const publicState: Discovery = { usage: account.usage, plan: account.plan, bookmakers, competitionCount: sports.filter(footballSport).length, capturedAt: new Date(now).toISOString(), restrictions };
    this.discoveryCache = { public: publicState, venues, sports, account, at: now }; return publicState;
  }
  private discoveryFor(request: ScanRequest): DiscoveryCache {
    const discovery = this.discoveryCache;
    if (!discovery || this.clock() - discovery.at >= APPROVAL_LIFETIME_MS || this.clock() < discovery.at) fail("DISCOVERY_EXPIRED", "Refresh free authenticated discovery before requesting a quote.");
    if (discovery.public.restrictions.length) fail("INSUFFICIENT_COVERAGE", discovery.public.restrictions.join(" "));
    for (const id of request.bookmakers) {
      const v = discovery.public.bookmakers.find((b) => b.id === id);
      if (!v?.eligible || priceEvidenceError(v.lastSeen, this.clock())) fail("BOOKMAKER_UNVERIFIED", "Only freshly covered, non-exchange discovered bookmakers can be requested.");
    }
    return discovery;
  }
  async quote(owner: string, bookmakers: unknown): Promise<ScanQuote> {
    this.prune();
    for (const [previous, a] of this.approvals) if (a.owner === owner) this.approvals.delete(previous);
    const request = canonicalRequest(bookmakers), discovery = this.discoveryFor(request);
    const quoted = await this.provider.quote(request);
    const account = parseUsage((await this.provider.free("usage")).body);
    const blocked = budgetReasons(quoted.cost, account.usage);
    if (request.bookmakers.some((b) => !scopeAllows(account, b))) blocked.push("Account/key scope no longer permits this request.");
    const now = this.clock(), id = blocked.length ? null : this.newId();
    if (id) {
      // A new quote invalidates the owner's earlier approvals; bound total memory too.
      if (this.approvals.size >= 128) this.approvals.delete(this.approvals.keys().next().value!);
      this.approvals.set(id, { owner, request: structuredClone(request), cost: quoted.cost, at: now, discovery });
    }
    return { request, cost: quoted.cost, usage: account.usage, projectedRemaining: blocked.length ? null : typeof account.usage.remaining === "number" ? account.usage.remaining - quoted.cost : account.usage.remaining,
      approvalId: id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + APPROVAL_LIFETIME_MS).toISOString(), blocked };
  }
  async confirm(owner: string, approvalId: string, bookmakers: unknown) {
    this.prune();
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.owner !== owner) fail("APPROVAL_MISSING", "Approval is missing, expired or already consumed. Obtain a new free quote.");
    const request = canonicalRequest(bookmakers);
    if (requestIdentity(request) !== requestIdentity(approval.request)) fail("APPROVAL_MISMATCH", "Bookmakers do not match the exact quoted request. Obtain a new quote.");
    // Synchronous consumption occurs before the first await, including failures and double clicks.
    this.approvals.delete(approvalId);
    if (this.scanning) fail("SCAN_IN_PROGRESS", "Another scan is already in progress. Obtain a new quote when it finishes.");
    this.scanning = true;
    try {
      const account = parseUsage((await this.provider.free("usage")).body);
      const blocked = budgetReasons(approval.cost, account.usage);
      if (request.bookmakers.some((b) => !scopeAllows(account, b))) blocked.push("The account/key scope no longer permits this request.");
      if (this.clock() - approval.at >= APPROVAL_LIFETIME_MS || this.clock() < approval.at) blocked.push("Approval expired during usage verification.");
      if (blocked.length) fail("SCAN_BLOCKED", blocked.join(" "));
      const identity = requestIdentity(approval.request), entry = this.snapshots.get(identity);
      const cached = entry && this.clock() - entry.at < CACHE_LIFETIME_MS ? entry : undefined;
      // Exactly one potentially chargeable request. Never retry, including 304/cache failure.
      const response = await this.provider.scan(approval.request, cached?.etag ?? undefined);
      let snapshot: OddsSnapshot;
      if (response.unchanged) {
        if (!cached) fail("CACHE_MISSING", "304 received without a usable cached snapshot. No retry was made; obtain a new quote.", 502);
        snapshot = cached.snapshot;
      } else {
        try { snapshot = normalizeOddsRelay(response.body, approval.discovery.venues, approval.discovery.sports, approval.request.bookmakers, this.clock()); }
        catch { throw new OddsProviderError({ code: "INVALID_ODDS_DATA", status: 502, message: "Provider odds could not be verified. Actual response usage is shown; no retry or fictional fallback was made.", retryAfter: null, usage: response.usage }); }
        if (this.snapshots.size >= 8) this.snapshots.delete(this.snapshots.keys().next().value!);
        this.snapshots.set(identity, { snapshot, etag: response.etag, at: this.clock() });
      }
      return { snapshot, analysis: analyseSnapshot(snapshot, this.clock()), usage: response.usage, unchanged: response.unchanged, quotedCost: approval.cost };
    } finally { this.scanning = false; }
  }
  async events(cursor?: string) {
    const response = await this.provider.free("events", cursor), r = object(response.body), meta = object(r.meta);
    return { events: array(r.data).map((value) => { const e = object(value); return { id: text(e.id, "event ID"), competition: text(e.sport_title, "competition"), home: e.home_team === null ? null : text(e.home_team, "home team"), away: e.away_team === null ? null : text(e.away_team, "away team"), kickoff: nullableTime(e.commence_time), status: text(e.status, "event status"), coverage: strings(e.has_coverage) }; }), cursor: meta.next_cursor === null ? null : text(meta.next_cursor, "event cursor"), usage: response.usage };
  }
  async pricing() {
    const response = await this.provider.free("pricing"), r = object(response.body);
    return { rateCard: r.rate_card, regions: r.regions, usage: response.usage };
  }
}
