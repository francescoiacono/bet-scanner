"use client";

import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import type { demoScan } from "@/lib/odds/demo";
import { OUTCOMES, type ArbitrageOpportunity, type MarketAnalysis, type OddsMode, type ProviderError, type ProviderUsage, type ScanAnalysis } from "@/lib/odds/types";
import { scanDiagnostics } from "@/lib/odds/scan-diagnostics";
import type { Discovery, ScanQuote } from "@/lib/odds/server/service";
import { canConfirm, initialScannerState, resultStatus, scannerReducer, scannerStatus, type Scan } from "./scanner-state";
import { useFreeDiscovery } from "./use-free-discovery";
import SiteHeader from "./site-header";
import SiteFooter from "./site-footer";
import ui from "./ui.module.css";
import styles from "./odds-dashboard.module.css";

type EventPage = { events: { id: string; competition: string; home: string | null; away: string | null; kickoff: string | null; status: string; coverage: string[] }[]; cursor: string | null };
const percent = (value: number) => (value * 100).toFixed(2) + "%";
const tokens = (value: ProviderUsage["remaining"]) => value === null ? "Unknown" : value === "unlimited" ? "Unlimited" : value.toLocaleString("en-GB");
const time = (value: string | null) => value === null ? "Unknown" : value.replace("T", " ").replace("Z", " UTC");
const badge = (tone: string) => ui.badge + " " + ui[tone];

function TheoreticalOpportunity({ opportunity: a, rank }: { opportunity: ArbitrageOpportunity; rank: number }) {
  return <article className={styles.opportunity} aria-label={"Theoretical opportunity " + rank}>
    <div className={styles.opportunityHeading}>
      <div><p className={ui.eyebrow}>{rank === 1 ? "BEST THEORETICAL OPPORTUNITY" : "OPPORTUNITY " + rank}</p><h3>{a.fixture.homeTeam} vs {a.fixture.awayTeam}</h3><p className={styles.fixtureMeta}>{a.fixture.competition} · <time dateTime={a.fixture.kickoff}>{time(a.fixture.kickoff)}</time></p></div>
      <div className={styles.roiBlock}><span>Theoretical gross ROI</span><strong className={styles.roi}>{percent(a.theoreticalGrossROI)}</strong></div>
    </div>
    <div className={styles.legs}>{OUTCOMES.map((outcome) => <div key={outcome}><span className={ui.eyebrow}>{outcome}</span><strong>{a.selections[outcome].decimalOdds.toFixed(3)}</strong><span>{a.selections[outcome].bookmaker.name}</span></div>)}</div>
    <p className={styles.evidence}>Oldest supporting venue/sport evidence: <time dateTime={a.oldestEvidenceAt}>{time(a.oldestEvidenceAt)}</time>. All accepted evidence is at most 120 seconds old at evaluation.</p>
    <p className={styles.caution}>Before costs and market movement. Prices, acceptance and settlement terms need independent verification; this is not guaranteed or executable profit.</p>
    <details className={styles.math}><summary>Illustrative fractions &amp; calculation</summary><p>S = {a.inverseOddsSum.toFixed(8)} · gross ROI = 1/S − 1. Educational fractions: HOME {percent(a.illustrativeFractions.HOME)}, DRAW {percent(a.illustrativeFractions.DRAW)}, AWAY {percent(a.illustrativeFractions.AWAY)}. Before rounding, each fraction × odds gives the same {a.grossPayoutPerUnit.toFixed(8)} gross payout per illustrative total unit. No staking recommendation.</p></details>
  </article>;
}

function FixtureComparisons({ markets, label }: { markets: MarketAnalysis[]; label: string }) {
  return <div className={ui.tableScroll} role="region" aria-label={label} tabIndex={0}>
      <table className={ui.table + " " + styles.table}><caption className={ui.srOnly}>Best eligible full-time HOME, DRAW and AWAY bookmaker back prices, using decimal odds.</caption>
        <thead><tr><th scope="col">Fixture / UTC kickoff</th>{OUTCOMES.map((o) => <th key={o} scope="col">{o} / bookmaker</th>)}<th scope="col">Comparison</th></tr></thead>
        <tbody>{markets.map((r) => <tr key={r.fixture.id}>
          <th scope="row">{r.fixture.homeTeam} vs {r.fixture.awayTeam}<span>{r.fixture.competition}</span><time dateTime={r.fixture.kickoff}>{time(r.fixture.kickoff)}</time></th>
          {OUTCOMES.map((o) => <td key={o}>{r.best[o] ? <><strong>{r.best[o]!.decimalOdds.toFixed(3)}</strong><span>{r.best[o]!.bookmaker.name}</span><small>Evidence {time(r.best[o]!.evidenceAt)}</small></> : <span>Excluded / missing</span>}</td>)}
          <td><strong>{r.status === "ARBITRAGE" ? "THEORETICAL ARBITRAGE" : r.status}</strong><span>S: {r.inverseOddsSum?.toFixed(8) ?? "—"}</span>{r.reasons.map((reason) => <small key={reason}>{reason}</small>)}</td>
        </tr>)}</tbody>
      </table>
    </div>;
}

export function Results({ analysis, mode, unchanged }: { analysis: ScanAnalysis; mode: OddsMode; unchanged?: boolean }) {
  const status = resultStatus(analysis.status);
  const coverage = scanDiagnostics(analysis);
  return <section id="scan-results" className={styles.results} aria-labelledby="results-title">
    <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>{mode === "DEMO" ? "SYNTHETIC RESULTS" : "ODDSRELAY RESULTS"}</p><h2 id="results-title">Scan results</h2></div><span className={badge(status.tone)}>{status.label}</span></div>
    <p className={styles.resultMeta}>Evaluated {time(analysis.evaluatedAt)}. Coverage describes this response at evaluation time.</p>
    <dl className={styles.coverageStats} aria-label="Scan coverage">
      <div><dt>Fixtures scanned</dt><dd>{coverage.total}</dd></div>
      <div><dt>Complete comparisons</dt><dd>{coverage.comparable.length}</dd></div>
      <div><dt>Insufficient data</dt><dd>{coverage.insufficient.length}</dd></div>
      <div><dt>Theoretical opportunities</dt><dd>{analysis.opportunities.length}</dd></div>
    </dl>
    {unchanged && <p className={ui.notice}>Provider data unchanged (304). Original freshness evidence was retained and rechecked.</p>}
    {!analysis.opportunities.length && <div className={ui.emptyState}><h3>{status.label}</h3><p>{analysis.status === "INSUFFICIENT DATA" ? "No verified opportunity: missing, stale or otherwise ineligible prices prevent a complete comparison." : "Complete eligible markets were compared. No theoretical arbitrage was found in " + coverage.comparable.length + (coverage.comparable.length === 1 ? " complete fixture." : " complete fixtures.")}</p>{coverage.insufficient.length > 0 && <p>{coverage.insufficient.length} {coverage.insufficient.length === 1 ? "fixture could" : "fixtures could"} not be assessed. Missing data does not establish whether arbitrage exists.</p>}</div>}
    {analysis.opportunities.map((a, i) => <TheoreticalOpportunity key={a.fixture.id} opportunity={a} rank={i + 1} />)}
    {coverage.comparable.length > 0 && <>
      <div className={styles.comparisonHeading}><h3>Complete comparisons ({coverage.comparable.length})</h3><span>Opportunities: ROI ranking · other markets: S ↑, kickoff, event ID</span></div>
      <p className={styles.resultMeta}>Eligible HOME, DRAW and AWAY prices with evidence from at least two bookmakers. S below 1 is the theoretical arbitrage threshold.</p>
      <FixtureComparisons markets={coverage.comparable} label="Complete fixture price comparisons" />
    </>}
    {coverage.insufficient.length > 0 && <div className={ui.card + " " + styles.coverageIssues}>
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

export function BookmakerSelector({ bookmakers, selected, busy, onToggle }: {
  bookmakers: Discovery["bookmakers"];
  selected: string[];
  busy: boolean;
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
        return <button key={bookmakerId} type="button" className={styles.bookmakerChip} disabled={busy} aria-label={"Remove " + name} onClick={() => onToggle(bookmakerId)}>{name}<span aria-hidden="true">×</span></button>;
      })}
    </div>}
    <p id={id + "-limit"} className={styles.bookmakerHint}>{selected.length >= 3 ? "Three selected. Remove one to choose another." : "Choose at least two bookmakers to compare prices. Maximum three per scan."}</p>
    <fieldset className={styles.bookmakers} aria-describedby={id + "-limit"}>
      <legend className={ui.srOnly}>Select two or three eligible bookmakers</legend>
      <div className={styles.bookmakerViewport} role="region" aria-label="Bookmaker list" tabIndex={0}>
        {visible.length ? <ul className={styles.bookmakerList}>{visible.map((b) => {
          const checked = selected.includes(b.id);
          return <li key={b.id}>
            <label className={styles.bookmakerRow + (!b.eligible ? " " + styles.unavailable : "")} data-selected={checked || undefined}>
              <input type="checkbox" checked={checked} disabled={busy || !b.eligible || (!checked && selected.length >= 3)} onChange={() => onToggle(b.id)} />
              <span className={styles.bookmakerDetails}>
                <strong>{b.name}</strong>
                <span className={styles.bookmakerInfo}>{b.eligible ? <><span>{b.events} football events</span><span>Evidence <time dateTime={b.lastSeen ?? undefined}>{time(b.lastSeen)}</time></span></> : <span>Unavailable: {b.reason}</span>}</span>
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
  const inFlight = useRef(false);
  const status = scannerStatus(state, configured);
  const accountStatus = !configured ? "Not configured" : error ? "Provider unavailable / verification failed" : discovery ? "Verified" : "Configured but unverified";

  // This timer only expires local presentation. It never requests provider data.
  useEffect(() => {
    if (!quote?.approvalId) return;
    const approvalId = quote.approvalId;
    const timer = setTimeout(() => dispatch({ type: "expire", approvalId }), Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);

  const action = useCallback(async function action<T>(name: string, extra: Record<string, unknown> = {}): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    dispatch({ type: "begin", action: name });
    try {
      const response = await fetch("/api/odds", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ action: name, mode, ...extra }) });
      const result = await response.json();
      if (!response.ok) { dispatch({ type: "error", error: result.error }); return null; }
      if (result.usage) dispatch({ type: "usage", usage: result.usage });
      return result as T;
    } catch {
      dispatch({ type: "error", error: { code: "LOCAL_NETWORK_ERROR", status: 502, retryAfter: null, message: "The local request failed. Do not retry confirmation; obtain a new free quote. Token use may be uncertain." } satisfies ProviderError });
      return null;
    } finally { inFlight.current = false; dispatch({ type: "finish" }); }
  }, [mode]);
  function changeMode(next: OddsMode) {
    dispatch({ type: "mode", mode: next, demo: initialDemo }); setEvents(null); setPricing(null);
  }
  const discover = useCallback(async () => {
    const result = await action<Discovery>("discover");
    if (result) dispatch({ type: "discovery", discovery: result });
  }, [action]);
  useFreeDiscovery(mode, configured, discover);
  async function getQuote() {
    const result = await action<ScanQuote>("quote", { bookmakers: selected });
    if (result) dispatch({ type: "quote", quote: result });
  }
  async function confirm() {
    if (inFlight.current || !canConfirm(state, Date.now())) return;
    const approval = quote!;
    const result = await action<Scan>("confirm", { approvalId: approval.approvalId, bookmakers: approval.request.bookmakers });
    if (result) dispatch({ type: "scan", scan: result });
  }

  return <div className={ui.shell}>
    <a href="#main-content" className={ui.skipLink}>Skip to scanner</a>
    <SiteHeader activePage="scanner" mode={mode} />
    <main id="main-content" className={ui.container}>
      <div className={ui.pageHeading}><div><p className={ui.eyebrow}>FOOTBALL · FULL-TIME 1X2</p><h1>Odds Scanner</h1><p className={ui.intro}>Compare bookmaker prices and identify theoretical arbitrage.</p></div></div>
      <section className={ui.card + " " + styles.source} aria-labelledby="source-title">
        <div className={ui.sectionHeading}><h2 id="source-title">Source &amp; budget</h2><div className={styles.modeSwitch} role="group" aria-label="Odds source"><button type="button" aria-pressed={mode === "DEMO"} disabled={Boolean(busy)} onClick={() => changeMode("DEMO")}>Demo</button><button type="button" aria-pressed={mode === "LIVE"} disabled={Boolean(busy)} onClick={() => changeMode("LIVE")}>Live Source</button></div></div>
        <dl className={styles.meta}><div><dt>API status</dt><dd>{accountStatus}</dd></div><div><dt>Remaining tokens</dt><dd>{usage ? tokens(usage.remaining) : "Unknown"}</dd></div><div><dt>Maximum per scan</dt><dd>500 quoted tokens</dd></div></dl>
        <div className={styles.workflowStatus} role="status" aria-live="polite" aria-atomic="true"><span className={badge(status.tone)}>{status.label}</span><span>{mode === "DEMO" ? "All teams, bookmakers and prices are synthetic. Zero API tokens." : "Discovery loads automatically for free. Only Confirm Scan can request charged odds."}</span></div>
        {error && <ProviderErrorNotice error={error} />}
        {mode === "DEMO" ? <div className={styles.demoActions}><p>Four examples: theoretical arbitrage, ordinary prices, missing DRAW and stale evidence.</p><button className={ui.secondaryButton} type="button" disabled={Boolean(busy)} onClick={async () => { const result = await action<Scan>("demo"); if (result) dispatch({ type: "scan", scan: result }); }}>Re-run demo · zero tokens</button></div> :
          !configured && <p className={ui.notice + " " + ui.warning}>Add ODDSRELAY_KEY in your gitignored .env.local and restart the app. The key stays on the server; never enter it in this page.</p>}
      </section>

      {mode === "LIVE" && <div className={styles.workflow}>
        <section className={ui.card} aria-labelledby="bookmaker-title">
          <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>1 · FREE DISCOVERY</p><h2 id="bookmaker-title">Choose bookmakers</h2></div><button className={ui.secondaryButton} type="button" disabled={!configured || Boolean(busy)} onClick={discover}>{busy === "discover" ? "Checking coverage…" : "Refresh discovery · free"}</button></div>
          <p className={ui.muted}>Select two or three bookmakers to compare prices across the same match. Fresh coverage is required.</p>
          <p className={styles.resultMeta}>Football-event counts describe each bookmaker separately; they do not guarantee overlapping fixtures or complete 1X2 prices.</p>
          {discovery ? <>
            <p className={styles.resultMeta}>{discovery.competitionCount} football competitions · plan {discovery.plan ?? "unknown"} · checked {time(discovery.capturedAt)}. Refresh if older than 60 seconds.</p>
            {discovery.restrictions.map((reason) => <p key={reason} className={ui.notice + " " + ui.warning}>{reason}</p>)}
            {discovery.bookmakers.length ? <BookmakerSelector bookmakers={discovery.bookmakers} selected={selected} busy={Boolean(busy)} onToggle={(id) => dispatch({ type: "bookmaker", id })} /> : <p className={ui.notice + " " + ui.warning}>No UK bookmakers were verified for this account.</p>}
          </> : <p className={ui.notice}>{busy === "discover" ? "Loading bookmakers and verifying free coverage…" : configured ? "Bookmaker discovery loads automatically. Use Refresh discovery to try again if it fails." : "Configure a server API key to load available bookmakers."}</p>}
        </section>
        <section className={ui.card} aria-labelledby="quote-title">
          <div className={ui.sectionHeading}><div><p className={ui.eyebrow}>2 · FREE COST QUOTE</p><h2 id="quote-title">Review the request</h2></div><button className={ui.button} type="button" disabled={!configured || Boolean(busy) || selected.length < 2 || selected.length > 3} onClick={getQuote}>{busy === "quote" ? "Quoting…" : "Get quote · free"}</button></div>
          <p className={ui.muted}>UK · football · full-time 1X2 · {selected.length ? selected.map((id) => discovery?.bookmakers.find((b) => b.id === id)?.name ?? id).join(", ") : "Choose bookmakers first"}</p>
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
          <button className={ui.button} type="button" disabled={Boolean(busy) || !quote?.approvalId || !acknowledged || quoteExpired} onClick={confirm}>{busy === "confirm" ? "Scan in progress…" : "Confirm Scan" + (quote?.approvalId ? " · " + quote.cost + " tokens" : "")}</button>
          <p className={styles.resultMeta}>One-time approval · 60-second expiry · no automatic charged retry</p>
        </section>
      </div>}

      {mode === "LIVE" && scan?.usage && <section className={ui.card + " " + styles.receipt} aria-label="Actual scan token receipt"><h2>Actual response usage</h2><UsageReceipt usage={scan.usage} /><p className={styles.resultMeta}>Missing headers remain unknown. Quoted cost is not substituted for an actual charge.</p></section>}
      {scan ? <Results analysis={scan.analysis} mode={mode} unchanged={scan.unchanged} /> : <section id="scan-results" className={styles.results} aria-labelledby="results-title"><h2 id="results-title">Scan results</h2><div className={ui.emptyState}><h3>{busy === "confirm" ? "SCAN IN PROGRESS" : error ? "DATA NOT VERIFIED" : "No live scan requested"}</h3><p>{error ? "The request failed. No synthetic prices were substituted for live results." : "Verify free discovery, choose bookmakers, get a free quote, and confirm separately."}</p></div></section>}

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
