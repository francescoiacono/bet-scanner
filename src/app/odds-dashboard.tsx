"use client";

import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import type { demoScan } from "@/lib/odds/demo";
import { OUTCOMES, type ArbitrageOpportunity, type MarketAnalysis, type OddsMode, type ProviderError, type ProviderUsage, type ScanAnalysis } from "@/lib/odds/types";
import { scanDiagnostics } from "@/lib/odds/scan-diagnostics";
import { analyseSnapshot } from "@/lib/odds/arbitrage";
import { nextHistoryBoundary } from "@/lib/odds/history-freshness";
import type { HistoricalScan, ScanHistoryReply } from "@/lib/odds/history-types";
import type { Discovery, ScanQuote } from "@/lib/odds/server/service";
import { canConfirm, canQuote, discoveryFreshness, discoveryStatus, initialScannerState, resultStatus, scannerReducer, scannerStatus, type Scan } from "./scanner-state";
import SiteHeader from "./site-header";
import SiteFooter from "./site-footer";
import ui from "./ui.module.css";
import styles from "./odds-dashboard.module.css";

type EventPage = { events: { id: string; competition: string; home: string | null; away: string | null; kickoff: string | null; status: string; coverage: string[] }[]; cursor: string | null };
const percent = (value: number) => (value * 100).toFixed(2) + "%";
const tokens = (value: ProviderUsage["remaining"]) => value === null ? "Unknown" : value === "unlimited" ? "Unlimited" : value.toLocaleString("en-GB");
const time = (value: string | null) => typeof value !== "string" ? "Unknown" : value.replace("T", " ").replace("Z", " UTC");
const badge = (tone: string) => ui.badge + " " + ui[tone];
const elapsed = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

function TheoreticalOpportunity({ opportunity: a, rank, historical = false }: { opportunity: ArbitrageOpportunity; rank: number; historical?: boolean }) {
  return <article className={styles.opportunity + (historical ? " " + styles.historical : "")} aria-label={(historical ? "Historical theoretical result " : "Theoretical opportunity ") + rank}>
    <div className={styles.opportunityHeading}>
      <div><p className={ui.eyebrow}>{historical ? "HISTORICAL RESULT AT SCAN TIME · READ ONLY" : rank === 1 ? "BEST THEORETICAL OPPORTUNITY" : "OPPORTUNITY " + rank}</p><h3>{a.fixture.homeTeam} vs {a.fixture.awayTeam}</h3><p className={styles.fixtureMeta}>{a.fixture.competition} · <time dateTime={a.fixture.kickoff}>{time(a.fixture.kickoff)}</time></p></div>
      <div className={styles.roiBlock}><span>Theoretical gross ROI{historical && " at scan time"}</span><strong className={styles.roi}>{percent(a.theoreticalGrossROI)}</strong></div>
    </div>
    <div className={styles.legs}>{OUTCOMES.map((outcome) => <div key={outcome}><span className={ui.eyebrow}>{outcome}</span><strong>{a.selections[outcome].decimalOdds.toFixed(3)}</strong><span>{a.selections[outcome].bookmaker.name}</span></div>)}</div>
    {!historical && <><p className={styles.evidence}>Oldest supporting venue/sport evidence: <time dateTime={a.oldestEvidenceAt}>{time(a.oldestEvidenceAt)}</time>. All accepted evidence is at most 120 seconds old at evaluation.</p>
    <p className={styles.caution}>Before costs and market movement. Prices, acceptance and settlement terms need independent verification; this is not guaranteed or executable profit.</p></>}
    <details className={styles.math}><summary>Illustrative fractions &amp; calculation</summary><p>S = {a.inverseOddsSum.toFixed(8)} · gross ROI = 1/S − 1. Educational fractions: HOME {percent(a.illustrativeFractions.HOME)}, DRAW {percent(a.illustrativeFractions.DRAW)}, AWAY {percent(a.illustrativeFractions.AWAY)}. Before rounding, each fraction × odds gives the same {a.grossPayoutPerUnit.toFixed(8)} gross payout per illustrative total unit. No staking recommendation.</p></details>
  </article>;
}

function FixtureComparisons({ markets, label, historical = false }: { markets: MarketAnalysis[]; label: string; historical?: boolean }) {
  return <div className={ui.tableScroll} role="region" aria-label={label} tabIndex={0}>
      <table className={ui.table + " " + styles.table + (historical ? " " + styles.historyTable : "")}><caption className={ui.srOnly}>{historical ? "Original HOME, DRAW and AWAY bookmaker prices at the original evaluation time. Historical odds, not live." : "Best eligible full-time HOME, DRAW and AWAY bookmaker back prices, using decimal odds."}</caption>
        <thead><tr><th scope="col">Fixture / UTC kickoff</th>{OUTCOMES.map((o) => <th key={o} scope="col">{o} / bookmaker</th>)}<th scope="col">Comparison</th></tr></thead>
        <tbody>{markets.map((r) => <tr key={r.fixture.id}>
          <th scope="row">{r.fixture.homeTeam} vs {r.fixture.awayTeam}<span>{r.fixture.competition}</span><time dateTime={r.fixture.kickoff}>{time(r.fixture.kickoff)}</time></th>
          {OUTCOMES.map((o) => <td key={o}>{r.best[o] ? <><strong>{r.best[o]!.decimalOdds.toFixed(3)}</strong><span>{r.best[o]!.bookmaker.name}</span>{!historical && <small>Evidence {time(r.best[o]!.evidenceAt)}</small>}</> : <span>Excluded / missing</span>}</td>)}
          <td><strong>{historical && "AT SCAN TIME · "}{r.status === "ARBITRAGE" ? "THEORETICAL ARBITRAGE" : r.status}</strong><span>S: {r.inverseOddsSum?.toFixed(8) ?? "—"}</span>{!historical && r.reasons.map((reason) => <small key={reason}>{reason}</small>)}</td>
        </tr>)}</tbody>
      </table>
    </div>;
}

export function Results({ analysis, mode, unchanged, historical = false }: { analysis: ScanAnalysis; mode: OddsMode; unchanged?: boolean; historical?: boolean }) {
  const status = resultStatus(analysis.status);
  const coverage = scanDiagnostics(analysis);
  return <section id={historical ? "history-results" : "scan-results"} className={styles.results} aria-labelledby={historical ? "history-results-title" : "results-title"}>
    <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>{historical ? "HISTORICAL ODDSRELAY RESULTS · READ ONLY" : mode === "DEMO" ? "SYNTHETIC RESULTS" : "ODDSRELAY RESULTS"}</p><h2 id={historical ? "history-results-title" : "results-title"}>{historical ? "Original research results" : "Scan results"}</h2></div><span className={badge(historical ? "neutral" : status.tone)}>{historical ? "AT SCAN TIME · " : ""}{status.label}</span></div>
    <p className={styles.resultMeta}>Evaluated {time(analysis.evaluatedAt)}. Coverage describes this response at evaluation time.</p>
    <dl className={styles.coverageStats} aria-label="Scan coverage">
      <div><dt>Fixtures scanned</dt><dd>{coverage.total}</dd></div>
      <div><dt>Complete comparisons</dt><dd>{coverage.comparable.length}</dd></div>
      <div><dt>Insufficient data</dt><dd>{coverage.insufficient.length}</dd></div>
      <div><dt>Theoretical opportunities</dt><dd>{analysis.opportunities.length}</dd></div>
    </dl>
    {unchanged && !historical && <p className={ui.notice}>Provider data unchanged (304). Original freshness evidence was retained and rechecked.</p>}
    {!analysis.opportunities.length && <div className={ui.emptyState}><h3>{status.label}</h3><p>{analysis.status === "INSUFFICIENT DATA" ? "No verified opportunity: missing, stale or otherwise ineligible prices prevent a complete comparison." : "Complete eligible markets were compared. No theoretical arbitrage was found in " + coverage.comparable.length + (coverage.comparable.length === 1 ? " complete fixture." : " complete fixtures.")}</p>{coverage.insufficient.length > 0 && <p>{coverage.insufficient.length} {coverage.insufficient.length === 1 ? "fixture could" : "fixtures could"} not be assessed. Missing data does not establish whether arbitrage exists.</p>}</div>}
    {analysis.opportunities.map((a, i) => <TheoreticalOpportunity key={a.fixture.id} opportunity={a} rank={i + 1} historical={historical} />)}
    {historical && coverage.total > 0 && <>
      <div className={styles.comparisonHeading}><h3>Original bookmaker comparisons ({coverage.total})</h3><span>Complete comparisons first · decimal odds</span></div>
      <FixtureComparisons markets={[...coverage.comparable, ...coverage.insufficient]} label="Original bookmaker price comparisons" historical />
    </>}
    {!historical && coverage.comparable.length > 0 && <>
      <div className={styles.comparisonHeading}><h3>Complete comparisons ({coverage.comparable.length})</h3><span>Opportunities: ROI ranking · other markets: S ↑, kickoff, event ID</span></div>
      <p className={styles.resultMeta}>Eligible HOME, DRAW and AWAY prices with evidence from at least two bookmakers. S below 1 is the theoretical arbitrage threshold.</p>
      <FixtureComparisons markets={coverage.comparable} label="Complete fixture price comparisons" />
    </>}
    {!historical && coverage.insufficient.length > 0 && <div className={ui.card + " " + styles.coverageIssues}>
      <h3>Why fixtures could not be compared</h3>
      <p className={styles.resultMeta}>Counts show affected fixtures and can overlap. Repeated exclusions within one fixture count once per reason.</p>
      <ul className={styles.reasonCounts}>{coverage.reasons.map(({ reason, fixtures }) => <li key={reason}><span>{reason}</span><strong>{fixtures} {fixtures === 1 ? "fixture" : "fixtures"}</strong></li>)}</ul>
      {mode === "LIVE" && <div className={styles.coverageGuidance}>
        <p>The matched feed can omit outcomes when a bookmaker back offer or its exchange lay counterpart is missing. Only bookmaker back prices enter this scanner. <a href="https://oddsrelay.io/docs/guides/matched-board-filters" target="_blank" rel="noreferrer">Provider filtering rules</a>.</p>
        <p>For your next scan, try a third freshly covered bookmaker or change the pair. Event counts alone do not establish overlapping, complete prices. Review a new free quote, then confirm separately if you choose to scan.</p>
      </div>}
      <details className={styles.incompleteComparisons}>
        <summary>Insufficient data ({coverage.insufficient.length}) · view prices and reasons</summary>
        <p className={styles.resultMeta}>These fixtures were excluded from complete comparisons. Ordered by kickoff, then event ID.</p>
        <FixtureComparisons markets={coverage.insufficient} label="Insufficient fixture price comparisons" />
      </details>
    </div>}
  </section>;
}

function ValidationDetails({ analysis }: { analysis: ScanAnalysis }) {
  return <div className={styles.excluded}>
    {analysis.excluded.length > 0 && <ul>{analysis.excluded.map((item, i) => <li key={i}><strong>{item.eventId ?? "Unknown event"}</strong>: {item.reason}<small>Source: {item.source}</small></li>)}</ul>}
    {analysis.markets.some((market) => market.reasons.length) && <ul>{analysis.markets.filter((market) => market.reasons.length).map((market) => <li key={market.fixture.id}><strong>{market.fixture.homeTeam} vs {market.fixture.awayTeam}</strong>: {market.reasons.join("; ")}</li>)}</ul>}
    {!analysis.excluded.length && !analysis.markets.some((market) => market.reasons.length) && <p>No data-validation exclusions.</p>}
  </div>;
}

export function SavedScanView({ scan, currentAnalysis, disabled, onRefresh, error }: {
  scan: HistoricalScan;
  currentAnalysis: ScanAnalysis;
  disabled: boolean;
  onRefresh: () => void;
  error: ProviderError | null;
}) {
  const original = scanDiagnostics(scan.originalAnalysis), current = scanDiagnostics(currentAnalysis);
  return <div className={styles.historyView}>
    <div className={styles.historySummary}>
      <span className={badge("neutral") + " " + styles.historyLabel}>HISTORICAL ODDS — NOT LIVE</span>
      <dl className={styles.meta}>
        <div><dt>Original scan</dt><dd><time dateTime={scan.scannedAt}>{time(scan.scannedAt)}</time></dd></div>
        <div><dt>Source bookmakers</dt><dd>{scan.bookmakers.join(", ")}</dd></div>
        <div><dt>Original token cost</dt><dd>{scan.originalUsage.cost ?? "Unknown"}</dd></div>
        <div><dt>Snapshot age</dt><dd>{elapsed(Date.parse(currentAnalysis.evaluatedAt) - Date.parse(scan.snapshot.receivedAt))} at last freshness check</dd></div>
      </dl>
    </div>
    <Results analysis={scan.originalAnalysis} mode="LIVE" historical />
    <div className={ui.notice + " " + styles.historyWarning}>
      <strong>Recorded prices may be stale or unavailable.</strong>
      <p>Prices were recorded at the original scan time and are not guaranteed to remain available. Historical arbitrage findings are theoretical, before costs, and never current verified opportunities.</p>
      {!current.comparable.length && <p>These saved prices no longer provide a currently eligible complete comparison.</p>}
      {(original.insufficient.length > 0 || scan.originalAnalysis.excluded.length > 0) && <p>Data quality at scan time: {original.insufficient.length} of {original.total} fixtures had insufficient data; {scan.originalAnalysis.excluded.length} source or price records were excluded. See Technical details for reasons.</p>}
    </div>
    <div>
      <button type="button" className={ui.secondaryButton} disabled={disabled} onClick={onRefresh}>Check for updated odds</button>
      <p className={styles.resultMeta}>Starts the manual discovery → free quote → explicit confirmation workflow below. An ETag does not guarantee a free refresh. Only documented response headers establish actual token cost.</p>
    </div>
    <details className={ui.details + " " + styles.historyTechnical}>
      <summary>Technical details</summary>
      {error && <div className={ui.notice + " " + ui.warning}>LOCAL HISTORY · {error.code}: {error.message}</div>}
      <section><h3>Provider response metadata</h3><dl className={styles.sourceMeta}>
        <dt>Provider</dt><dd>{scan.snapshot.provider}</dd><dt>Response</dt><dd>{scan.unchanged ? "Unchanged (304); original evidence retained" : "Updated snapshot"}</dd>
        <dt>Processed</dt><dd>{time(scan.snapshot.processedAt)}</dd><dt>Received</dt><dd>{time(scan.snapshot.receivedAt)}</dd>
        <dt>Original evaluation</dt><dd>{time(scan.originalAnalysis.evaluatedAt)}</dd>
      </dl></section>
      <section><h3>Full original token receipt</h3><p>This receipt records the original response. Its balance is historical and does not update the current budget.</p><UsageReceipt usage={scan.originalUsage} /></section>
      <section><h3>Original data-validation details</h3><ValidationDetails analysis={scan.originalAnalysis} /></section>
      <section><h3>Current freshness diagnostics</h3><p>Checked {time(currentAnalysis.evaluatedAt)} · {current.comparable.length} complete, {current.insufficient.length} insufficient. The unchanged 120-second freshness rule applies. Cached results remain read-only; stale evidence never verifies a current opportunity.</p><ValidationDetails analysis={currentAnalysis} /></section>
    </details>
  </div>;
}

function UsageReceipt({ usage }: { usage: ProviderUsage }) {
  return <dl className={styles.meta}>
    <div><dt>Actual token cost</dt><dd>{usage.cost ?? "Unknown"}</dd></div>
    <div><dt>Tokens used</dt><dd>{usage.used ?? "Unknown"}</dd></div>
    <div><dt>Remaining</dt><dd>{tokens(usage.remaining)}</dd></div>
    <div><dt>Limit</dt><dd>{tokens(usage.limit)}</dd></div>
    <div><dt>Reset</dt><dd>{time(usage.resetsAt)}</dd></div>
  </dl>;
}

export function ProviderErrorNotice({ error }: { error: ProviderError }) {
  return <div className={ui.notice + " " + ui.error + " " + styles.errorNotice} role="alert"><strong>PROVIDER ERROR · {error.code}</strong><p>{error.message}</p>{error.retryAfter && <p>Retry-After: {error.retryAfter}. No automatic retry.</p>}{error.usage && <UsageReceipt usage={error.usage} />}</div>;
}

export function BookmakerSelector({ bookmakers, selected, busy, verified, onToggle }: {
  bookmakers: Discovery["bookmakers"];
  selected: string[];
  busy: boolean;
  verified: boolean;
  onToggle: (id: string) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = bookmakers.filter((b) => (b.name + " " + b.id).toLowerCase().includes(query));

  return <div className={styles.bookmakerSelector}>
    <div className={styles.bookmakerToolbar}>
      <div className={styles.bookmakerSearch}>
        <label htmlFor={id + "-search"}>Search bookmakers</label>
        <input id={id + "-search"} type="search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className={styles.bookmakerCount}>
        <strong role="status" aria-live="polite">{selected.length} of 3 selected</strong>
        <span>{visible.length} of {bookmakers.length} shown</span>
      </div>
    </div>
    {selected.length > 0 && <div className={styles.selectedBookmakers} role="group" aria-label="Selected bookmakers">
      {selected.map((bookmakerId) => {
        const name = bookmakers.find((b) => b.id === bookmakerId)?.name ?? bookmakerId;
        return <button key={bookmakerId} type="button" className={styles.bookmakerChip} disabled={busy || !verified} aria-label={"Remove " + name} onClick={() => onToggle(bookmakerId)}>{name}<span aria-hidden="true">×</span></button>;
      })}
    </div>}
    <p id={id + "-limit"} className={styles.bookmakerHint}>{!verified ? "Previous bookmaker coverage is shown for context. Refresh discovery · free before changing selection or requesting a new quote." : selected.length >= 3 ? "Three selected. Remove one to choose another." : "Choose at least two bookmakers to compare prices. Maximum three per scan."}</p>
    <fieldset className={styles.bookmakers} aria-describedby={id + "-limit"}>
      <legend className={ui.srOnly}>Select two or three eligible bookmakers</legend>
      <div className={styles.bookmakerViewport} role="region" aria-label="Bookmaker list" tabIndex={0}>
        {visible.length ? <ul className={styles.bookmakerList}>{visible.map((b) => {
          const checked = selected.includes(b.id);
          return <li key={b.id}>
            <label className={styles.bookmakerRow + (!b.eligible ? " " + styles.unavailable : "")} data-selected={checked || undefined}>
              <input type="checkbox" checked={checked} disabled={busy || !verified || !b.eligible || (!checked && selected.length >= 3)} onChange={() => onToggle(b.id)} />
              <span className={styles.bookmakerDetails}>
                <strong>{b.name}</strong>
                <span className={styles.bookmakerInfo}>{b.eligible ? <><span>{b.events} football events{!verified && " at previous check"}</span><span>Evidence <time dateTime={b.lastSeen ?? undefined}>{time(b.lastSeen)}</time></span></> : <span>Unavailable{!verified && " at previous check"}: {b.reason}</span>}</span>
              </span>
            </label>
          </li>;
        })}</ul> : <p className={styles.bookmakerEmpty}>No bookmakers match your search.</p>}
      </div>
    </fieldset>
  </div>;
}

export default function OddsDashboard({ configured, initialDemo }: { configured: boolean; initialDemo: ReturnType<typeof demoScan> }) {
  const [state, dispatch] = useReducer(scannerReducer, initialDemo, (demo) => initialScannerState(demo, configured));
  const { mode, scan, discovery, selected, quote, usage, error, busy, acknowledged, quoteExpired } = state;
  const [events, setEvents] = useState<EventPage | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const inFlight = useRef(false);
  const status = scannerStatus(state, configured, clock);
  const readiness = discoveryStatus(state, configured, clock);

  // One local expiry update per discovery. This never calls the API or clears an approved quote.
  useEffect(() => {
    if (!discovery) return;
    const now = Date.now();
    const freshness = discoveryFreshness(discovery, now);
    const timer = setTimeout(() => {
      setClock(Date.now());
      dispatch({ type: "discovery-expire", capturedAt: discovery.capturedAt });
    }, freshness.fresh ? freshness.expiresAt! - now : 0);
    return () => clearTimeout(timer);
  }, [discovery]);

  // This timer only expires local presentation. It never requests provider data.
  useEffect(() => {
    if (!quote?.approvalId) return;
    const approvalId = quote.approvalId;
    const timer = setTimeout(() => { setClock(Date.now()); dispatch({ type: "expire", approvalId }); }, Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);

  // Local evidence/kickoff boundaries only. No polling or network work.
  useEffect(() => {
    const now = Date.now();
    const snapshots = [state.history?.view?.snapshot, mode === "LIVE" ? scan?.snapshot : undefined];
    const boundaries = snapshots.flatMap((snapshot) => { const boundary = snapshot ? nextHistoryBoundary(snapshot, now) : null; return boundary === null ? [] : [boundary]; });
    if (!boundaries.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(...boundaries) - now);
    return () => clearTimeout(timer);
  }, [state.history, scan, mode, clock]);

  const action = useCallback(async function action<T>(name: string, extra: Record<string, unknown> = {}): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setClock(Date.now());
    dispatch({ type: "begin", action: name });
    try {
      const response = await fetch("/api/odds", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ action: name, mode, ...extra }) });
      const result = await response.json();
      if (!response.ok) { dispatch({ type: name === "history" ? "history-error" : "error", error: result.error }); return null; }
      if (result.usage) dispatch({ type: "usage", usage: result.usage });
      return result as T;
    } catch {
      dispatch({ type: name === "history" ? "history-error" : "error", error: { code: "LOCAL_NETWORK_ERROR", status: 502, retryAfter: null, message: name === "history" ? "The local history read failed. This action requests no provider data and spends no tokens." : "The local request failed. Do not retry confirmation; obtain a new free quote. Token use may be uncertain." } satisfies ProviderError });
      return null;
    } finally { inFlight.current = false; setClock(Date.now()); dispatch({ type: "finish" }); }
  }, [mode]);
  function changeMode(next: OddsMode) {
    setClock(Date.now()); dispatch({ type: "mode", mode: next, demo: initialDemo }); setEvents(null); setPricing(null);
  }
  async function discover() {
    if (!configured || mode !== "LIVE") return;
    const result = await action<Discovery>("discover");
    if (result) dispatch({ type: "discovery", discovery: result, now: Date.now() });
  }
  function toggleBookmaker(id: string) {
    const now = Date.now(); setClock(now);
    if (!busy && discoveryStatus(state, configured, now).ready) dispatch({ type: "bookmaker", id });
  }
  async function getQuote() {
    const now = Date.now(); setClock(now);
    if (!canQuote(state, configured, now)) return;
    const result = await action<ScanQuote>("quote", { bookmakers: selected });
    if (result) dispatch({ type: "quote", quote: result });
  }
  async function confirm() {
    if (inFlight.current || !canConfirm(state, Date.now())) return;
    const approval = quote!;
    const result = await action<Scan>("confirm", { approvalId: approval.approvalId, bookmakers: approval.request.bookmakers });
    if (result) dispatch({ type: "scan", scan: result });
  }
  async function viewHistory(id?: string) {
    const result = await action<ScanHistoryReply>("history", id ? { id } : {});
    if (result) dispatch({ type: "history", history: result });
  }
  const historical = state.history?.view;
  const historicalNow = historical ? analyseSnapshot(historical.snapshot, Math.max(clock, Date.parse(historical.viewedAt))) : null;
  const displayAnalysis = scan ? mode === "LIVE" ? analyseSnapshot(scan.snapshot, clock) : scan.analysis : null;

  return <div className={ui.shell}>
    <a href="#main-content" className={ui.skipLink}>Skip to scanner</a>
    <SiteHeader activePage="scanner" mode={mode} />
    <main id="main-content" className={ui.container}>
      <div className={ui.pageHeading}><div><p className={ui.eyebrow}>FOOTBALL · FULL-TIME 1X2</p><h1>Odds Scanner</h1><p className={ui.intro}>Compare bookmaker prices and identify theoretical arbitrage.</p></div></div>
      <section className={ui.card + " " + styles.source} aria-labelledby="source-title">
        <div className={ui.sectionHeading}><h2 id="source-title">Source &amp; budget</h2><div className={styles.modeSwitch} role="group" aria-label="Odds source"><button type="button" aria-pressed={mode === "DEMO"} disabled={Boolean(busy)} onClick={() => changeMode("DEMO")}>Demo</button><button type="button" aria-pressed={mode === "LIVE"} disabled={Boolean(busy)} onClick={() => changeMode("LIVE")}>Live Source</button></div></div>
        <dl className={styles.meta}><div><dt>API status</dt><dd>{readiness.label}</dd></div><div><dt>Remaining tokens</dt><dd>{usage ? tokens(usage.remaining) : "Unknown"}</dd></div><div><dt>Maximum per scan</dt><dd>500 quoted tokens</dd></div></dl>
        <div className={styles.workflowStatus} role="status" aria-live="polite" aria-atomic="true"><span className={badge(status.tone)}>{status.label}</span><span>{mode === "DEMO" ? "All teams, bookmakers and prices are synthetic. Zero API tokens." : "Refresh discovery is free and manual. No provider requests run automatically. Only Confirm Scan can request charged odds."}</span></div>
        {error && <ProviderErrorNotice error={error} />}
        {mode === "DEMO" ? <div className={styles.demoActions}><p>Four examples: theoretical arbitrage, ordinary prices, missing DRAW and stale evidence.</p><button className={ui.secondaryButton} type="button" disabled={Boolean(busy)} onClick={async () => { const result = await action<Scan>("demo"); if (result) dispatch({ type: "scan", scan: result }); }}>Re-run demo · zero tokens</button></div> :
          !configured && <p className={ui.notice + " " + ui.warning}>Add ODDSRELAY_KEY in your gitignored .env.local and restart the app. The key stays on the server; never enter it in this page.</p>}
      </section>

      <section className={ui.card + " " + styles.history} aria-labelledby="history-title">
        <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>LOCAL · READ ONLY</p><h2 id="history-title">Scan history</h2></div><button type="button" className={ui.secondaryButton} disabled={Boolean(busy)} onClick={() => viewHistory()}>{busy === "history" ? "Reading local history…" : "View previous scan · 0 tokens"}</button></div>
        <p className={styles.resultMeta}>Read saved results from this computer. No usage check, discovery or OddsRelay request. Up to 20 scans are retained locally.</p>
        {state.historyError && <p className={ui.notice + " " + ui.warning} role="alert">Could not open the saved scan. Current results and approvals are unchanged. See Technical details for the error.</p>}
        {state.history && !state.history.entries.length && <p className={ui.notice}>No saved scans yet. A confirmed live scan will be saved locally.</p>}
        {Boolean(state.history?.entries.length) && <div className={styles.historySelector}>
          <label htmlFor="saved-scan">Saved scan ({state.history!.entries.length})</label>
          <select id="saved-scan" disabled={Boolean(busy)} value={state.history!.entries.some((entry) => entry.id === historical?.id) ? historical!.id : ""} onChange={(event) => viewHistory(event.target.value)} aria-describedby="history-read-cost">
            <option value="" disabled>Choose a saved scan…</option>
            {state.history!.entries.map((entry) => <option key={entry.id} value={entry.id}>{time(entry.scannedAt)} · {entry.bookmakers.join(", ")} · {entry.originalUsage.cost ?? "unknown"} original tokens</option>)}
          </select>
          <span id="history-read-cost">Local read · 0 OddsRelay tokens</span>
        </div>}
        {historical && <SavedScanView key={historical.id} scan={historical} currentAnalysis={historicalNow!} error={state.historyError} disabled={!configured || Boolean(busy)} onRefresh={() => { setClock(Date.now()); dispatch({ type: "prepare-refresh", bookmakers: historical.bookmakers }); setEvents(null); setPricing(null); }} />}
        {!historical && state.historyError && <details className={ui.details}><summary>Technical details</summary><p>LOCAL HISTORY · {state.historyError.code}: {state.historyError.message}</p></details>}
      </section>

      {mode === "LIVE" && <div className={styles.workflow}>
        {state.refreshBookmakers && <p className={ui.notice}>Checking for updated odds for exactly: {state.refreshBookmakers.join(", ")}. Refresh discovery, review a new quote and confirm separately. All original bookmakers must be eligible; changing selection starts a different request.</p>}
        <section className={ui.card} aria-labelledby="bookmaker-title">
          <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>1 · FREE DISCOVERY</p><h2 id="bookmaker-title">Choose bookmakers</h2></div><button className={ui.secondaryButton} type="button" disabled={!configured || Boolean(busy)} onClick={discover}>{busy === "discover" ? "Checking coverage…" : "Refresh discovery · free"}</button></div>
          <p className={ui.muted}>Select two or three bookmakers to compare prices across the same match. Fresh coverage is required.</p>
          <p className={styles.resultMeta}>Football-event counts describe each bookmaker separately; they do not guarantee overlapping fixtures or complete 1X2 prices.</p>
          <div id="discovery-readiness" className={ui.notice + (readiness.tone === "warning" ? " " + ui.warning : "")} role="status" aria-live="polite"><strong>{readiness.label}</strong><p>{readiness.guidance}</p></div>
          {discovery ? <>
            <p className={styles.resultMeta}>{discovery.competitionCount} football competitions · plan {discovery.plan ?? "unknown"} · checked {time(discovery.capturedAt)}. Discovery expires 60 seconds after this timestamp.</p>
            {discovery.restrictions.map((reason) => <p key={reason} className={ui.notice + " " + ui.warning}>{reason}</p>)}
            {discovery.bookmakers.length ? <BookmakerSelector bookmakers={discovery.bookmakers} selected={selected} busy={Boolean(busy)} verified={readiness.ready} onToggle={toggleBookmaker} /> : <p className={ui.notice + " " + ui.warning}>No UK bookmakers were verified for this account.</p>}
          </> : null}
        </section>
        <section className={ui.card} aria-labelledby="quote-title">
          <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>2 · FREE COST QUOTE</p><h2 id="quote-title">Review the request</h2></div><button className={ui.button} type="button" disabled={!canQuote(state, configured, clock)} aria-describedby={!readiness.ready ? "quote-readiness" : undefined} onClick={getQuote}>{busy === "quote" ? "Quoting…" : "Get quote · free"}</button></div>
          <p className={ui.muted}>UK · football · full-time 1X2 · {selected.length ? selected.map((id) => discovery?.bookmakers.find((b) => b.id === id)?.name ?? id).join(", ") : "Choose bookmakers first"}</p>
          {!readiness.ready && <p id="quote-readiness" className={ui.notice}>New quotes are disabled. {readiness.guidance}{quote?.approvalId && !quoteExpired && " An existing approved quote keeps its own expiry; discovery expiration does not cancel it."}</p>}
          {quote ? <>
            <dl className={styles.meta}><div><dt>Quoted cost</dt><dd>{quote.cost} tokens</dd></div><div><dt>Remaining before scan</dt><dd>{tokens(quote.usage.remaining)}</dd></div><div><dt>Projected remaining</dt><dd>{tokens(quote.projectedRemaining)}</dd></div><div><dt>Allowance reset</dt><dd>{time(quote.usage.resetsAt)}</dd></div></dl>
            <p className={styles.resultMeta}>Exact requested bookmakers: {quote.request.bookmakers.join(", ")} · approval expires {time(quote.expiresAt)}</p>
            {quote.blocked.map((reason) => <p key={reason} className={ui.notice + " " + ui.warning}>{reason}</p>)}
            {quoteExpired && <p className={ui.notice + " " + ui.warning}>QUOTE EXPIRED — obtain a new free quote before confirming.</p>}
          </> : <p className={ui.notice}>Get Quote is free and retrieves no paid odds. A quote is required before every scan.</p>}
        </section>
        <section className={ui.card} aria-labelledby="approval-title">
          <p className={ui.eyebrow}>3 · EXPLICIT APPROVAL</p><h2 id="approval-title">Confirm one scan</h2>
          <label className={styles.acknowledgement}><input type="checkbox" checked={acknowledged} disabled={Boolean(busy) || !quote?.approvalId || quoteExpired} onChange={(e) => dispatch({ type: "acknowledge", value: e.target.checked })} /><span>I understand this single scan can spend {quote?.cost ?? "the quoted number of"} API tokens. Prices may move or be unavailable. Theoretical arbitrage is not guaranteed profit.</span></label>
          <button className={ui.button} type="button" disabled={!canConfirm(state, clock)} onClick={confirm}>{busy === "confirm" ? "Scan in progress…" : "Confirm Scan" + (quote?.approvalId ? " · " + quote.cost + " tokens" : "")}</button>
          <p className={styles.resultMeta}>One-time approval · 60-second expiry · no automatic charged retry</p>
        </section>
      </div>}

      {mode === "LIVE" && scan?.usage && <section className={ui.card + " " + styles.receipt} aria-label="Actual scan token receipt"><h2>Actual response usage</h2><UsageReceipt usage={scan.usage} /><p className={styles.resultMeta}>Missing headers remain unknown. Quoted cost is not substituted for an actual charge.</p></section>}
      {scan?.historyWarning && <p className={ui.notice + " " + ui.warning} role="alert">{scan.historyWarning}</p>}
      {mode === "LIVE" && scan?.historyId && <p className={styles.resultMeta}>Scan and actual token receipt saved locally. Reopen it through Scan history · 0 tokens.</p>}
      {scan ? <Results analysis={displayAnalysis!} mode={mode} unchanged={scan.unchanged} /> : <section id="scan-results" className={styles.results} aria-labelledby="results-title"><h2 id="results-title">Scan results</h2><div className={ui.emptyState}><h3>{busy === "confirm" ? "SCAN IN PROGRESS" : error ? "DATA NOT VERIFIED" : "No live scan requested"}</h3><p>{error ? "The request failed. No synthetic prices were substituted for live results." : "Verify free discovery, choose bookmakers, get a free quote, and confirm separately."}</p></div></section>}

      <details className={ui.details + " " + styles.advanced}><summary>Advanced details</summary>
        <div className={styles.advancedGrid}><section><h2>Method &amp; source</h2><p>Full-time 1X2 bookmaker BACK offers only. Exact fixture, competition and settlement identities; no exchange LAY prices or fuzzy joining. Evidence must be no older than 120 seconds. A recent upstream snapshot does not establish individual bookmaker execution.</p><p>Best HOME, DRAW and AWAY prices form S = 1/H + 1/D + 1/A. S &lt; 1 gives theoretical gross ROI = 1/S − 1. No probability model, value betting, staking or bet placement.</p>
          {scan && <dl className={styles.sourceMeta}><dt>Provider</dt><dd>{scan.snapshot.provider}</dd><dt>Processed</dt><dd>{time(scan.snapshot.processedAt)}</dd><dt>Received</dt><dd>{time(scan.snapshot.receivedAt)}</dd><dt>Evaluated</dt><dd>{time(scan.analysis.evaluatedAt)}</dd></dl>}
        </section>
        <section><h2>Excluded records ({scan?.analysis.excluded.length ?? 0})</h2>{scan?.analysis.excluded.length ? <ul className={styles.excluded}>{scan.analysis.excluded.map((r, i) => <li key={r.source + ":" + i}><strong>{r.eventId ?? "Unknown event"}</strong>: {r.reason}<small>Source: {r.source}</small></li>)}</ul> : <p>No excluded source records to show.</p>}</section></div>
        {mode === "LIVE" && <section className={styles.providerDetails}><h2>Free provider information</h2><div className={styles.actions}><button className={ui.secondaryButton} type="button" disabled={!configured || Boolean(busy)} onClick={async () => { const result = await action<{ rateCard: string; regions: unknown; usage: ProviderUsage }>("pricing"); if (result) setPricing(JSON.stringify({ rateCard: result.rateCard, regions: result.regions }, null, 2)); }}>View pricing · free</button><button className={ui.secondaryButton} type="button" disabled={!configured || Boolean(busy)} onClick={async () => { const result = await action<EventPage>("events"); if (result) setEvents(result); }}>List football events · free</button></div>
          {pricing && <details className={ui.details}><summary>Provider pricing response</summary><pre className={styles.pricing}>{pricing}</pre></details>}
          {events && <details className={ui.details}><summary>Discovered events ({events.events.length})</summary><ul>{events.events.map((e, i) => <li key={e.id + ":" + i}>{e.home ?? "Unsplit fixture"} vs {e.away ?? "Unknown"} · {e.competition} · {time(e.kickoff)} · {e.status} · coverage {e.coverage.join(", ")}</li>)}</ul>{events.cursor && <button className={ui.secondaryButton} type="button" disabled={Boolean(busy)} onClick={async () => { const result = await action<EventPage>("events", { cursor: events.cursor }); if (result) setEvents(result); }}>Next event page · free</button>}<p>This event list is discovery only, not offered-price evidence.</p></details>}
        </section>}
      </details>
    </main>
    <SiteFooter />
  </div>;
}
