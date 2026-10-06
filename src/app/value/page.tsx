import type { Metadata } from "next";
import type { ReactNode } from "react";
import { valueSummary } from "@/data/value-summary";
import type { ValueCohortSummary } from "@/lib/value/summary";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import evaluation from "../backtest/backtest.module.css";
import models from "../models/models.module.css";
import styles from "./value.module.css";

export const metadata: Metadata = { title: "Historical Market Value | Bet Scanner", description: "Frozen Dixon–Coles probabilities versus historical Bet365 non-closing 1X2 prices. Flat-unit paper research with separate recent and older uncertainty intervals." };
const decimal = (value: number | null, digits = 5) => value === null ? "—" : value.toFixed(digits);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const signed = (value: number | null, digits = 5) => value === null ? "—" : `${value >= 0 ? "+" : ""}${decimal(value, digits)}`;
const signedPercent = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${percent(value)}`;
const colour = (value: number | null) => value !== null && value < 0 ? styles.negative : value !== null && value > 0 ? styles.positive : "";

function Panel({ id, title, detail, children, wide = false }: { id: string; title: string; detail: string; children: ReactNode; wide?: boolean }) {
  return <section className={shared.rankingPanel} aria-labelledby={id}>
    <div className={shared.rankingHeading}><h3 id={id} className={models.panelTitle}>{title}</h3><p>{detail}</p></div>
    <div className={shared.tableScroll} role="region" aria-label={title} tabIndex={0}>
      <table className={`${shared.table} ${models.table} ${wide ? styles.wideTable : ""}`}><caption className={shared.srOnly}>{title}. {detail}</caption>{children}</table>
    </div>
  </section>;
}

function Headline({ data }: { data: ValueCohortSummary }) {
  const { probability: p, strategy: s, brierBootstrap: b, roiBootstrap: r } = data;
  return <article className={models.headline}>
    <span className={shared.eyebrow}>{data.cohort} PRICE EVALUATION</span>
    <h2>{data.cohort === "RECENT" ? "2021-22 → 2025-26" : "2014-15 → 2018-19"}</h2>
    <p>{data.evaluatedMatches.toLocaleString("en-GB")} frozen evaluated matches · 100% priced coverage</p>
    <dl><div><dt>Dixon–Coles Brier</dt><dd>{decimal(p.dixonColesBrier)}</dd></div><div><dt>Fair-market Brier</dt><dd>{decimal(p.marketFairBrier)}</dd></div></dl>
    <span className={`${styles.headlineValue} ${colour(p.modelBrierAdvantage)}`}>{signed(p.modelBrierAdvantage)}</span>
    <p>Model Brier advantage · positive favours Dixon–Coles</p>
    <p className={models.interval}>95% interval: {signed(b.interval.lowerBound)} to {signed(b.interval.upperBound)}</p>
    <span className={`${styles.headlineValue} ${colour(s.roi)}`}>{signedPercent(s.roi)}</span>
    <p>Realised flat-unit paper ROI · {s.bets.toLocaleString("en-GB")} bets</p>
    <p className={models.interval}>95% interval: {signedPercent(r.interval.lowerBound)} to {signedPercent(r.interval.upperBound)}</p>
    <dl><div><dt>Net profit / loss</dt><dd className={colour(s.netProfit)}>{signed(s.netProfit, 2)} units</dd></div><div><dt>Maximum drawdown</dt><dd>{decimal(s.maximumDrawdown, 2)} units</dd></div></dl>
    <p>No-bet matches stay in the original date clusters. Zero-stake bootstrap replicates: {r.interval.zeroStakeReplicates}.</p>
  </article>;
}

function CohortDetails({ data }: { data: ValueCohortSummary }) {
  const id = data.cohort.toLowerCase(), s = data.strategy, m = data.market;
  return <section className={models.dataset} aria-labelledby={`${id}-title`}>
    <div className={shared.sectionHeading}><div><p className={shared.eyebrow}>{data.cohort} PRICE EVALUATION</p><h2 id={`${id}-title`}>{data.cohort === "RECENT" ? "2021–26" : "2014–19"} · paper-strategy audit</h2></div><span className={shared.sortLabel}>All outcomes retained · fixed 2% expected ROI</span></div>
    <div className={styles.summaryGrid}>{[
      { label: "Evaluated priced matches", value: String(data.evaluatedMatches), detail: `${data.historicalMatches} full-season fixtures; ${data.warmUpSkips} existing warm-up skips` },
      { label: "Paper bets / no bets", value: `${s.bets} / ${s.noBets}`, detail: `Bet frequency ${percent(s.betFrequency)} · at most one per match` },
      { label: "Wins / losses", value: `${s.wins} / ${s.losses}`, detail: `Strike rate ${percent(s.strikeRate)} · one unit per bet` },
    ].map((card) => <div className={shared.summaryCard} key={card.label}><span className={shared.eyebrow}>{card.label}</span><p className={shared.summaryValue}>{card.value}</p><span className={shared.summaryDetail}>{card.detail}</span></div>)}</div>
    <section className={models.fitPanel} aria-labelledby={`${id}-averages`}>
      <h3 id={`${id}-averages`}>Selected-bet averages and units</h3>
      <dl className={styles.metrics}>{[
        ["Total stakes", `${decimal(s.totalStaked, 2)} units`], ["Total returns", `${decimal(s.totalReturned, 2)} units`], ["Average selected odds", decimal(s.averageOdds, 3)],
        ["Average model probability", percent(s.averageModelProbability)], ["Average fair-market probability", percent(s.averageFairMarketProbability)], ["Average fair-market edge", `${decimal(s.averageFairMarketEdge === null ? null : s.averageFairMarketEdge * 100, 2)} pp`],
        ["Average estimated expected ROI", percent(s.averageExpectedROI)], ["Maximum estimated expected ROI", percent(data.extremes.maximumExpectedROI)], ["95th / 99th percentile estimated ROI", `${percent(data.extremes.p95ExpectedROI)} / ${percent(data.extremes.p99ExpectedROI)}`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>{data.extremes.selectionsAtLeast20Percent} selected bets have estimated expected ROI ≥20%. Large model/price disagreements may reflect poorly calibrated estimates. All extreme selections remain in the unchanged strategy.</p>
    </section>
    <Panel id={`${id}-seasons`} title="Every season" detail="Negative seasons are retained. Expected ROI is the model estimate; realised ROI uses settled unit returns." wide>
      <thead><tr>{["Season", "Priced", "Bets", "Frequency", "Wins", "Losses", "Avg odds", "Avg estimated EV", "Profit (units)", "ROI", "Max DD (units)", "DC Brier", "Market Brier"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.seasons.map(({ seasonId, strategy: row, probability: p }) => <tr key={seasonId}><th scope="row">{seasonId}</th><td>{row.evaluatedMatches}</td><td>{row.bets}</td><td>{percent(row.betFrequency)}</td><td>{row.wins}</td><td>{row.losses}</td><td>{decimal(row.averageOdds, 3)}</td><td>{percent(row.averageExpectedROI)}</td><td className={colour(row.netProfit)}>{signed(row.netProfit, 2)}</td><td className={colour(row.roi)}>{signedPercent(row.roi)}</td><td>{decimal(row.maximumDrawdown, 2)}</td><td>{decimal(p.dixonColesBrier)}</td><td>{decimal(p.marketFairBrier)}</td></tr>)}</tbody>
    </Panel>
    <Panel id={`${id}-outcomes`} title="Selected outcomes" detail="Diagnostic only. HOME, DRAW and AWAY remain eligible regardless of their historical returns.">
      <thead><tr>{["Outcome", "Bets", "Wins", "Losses", "Avg odds", "Avg estimated EV", "Profit (units)", "ROI"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.outcomes.map(({ outcome, strategy: row }) => <tr key={outcome}><th scope="row">{outcome}</th><td>{row.bets}</td><td>{row.wins}</td><td>{row.losses}</td><td>{decimal(row.averageOdds, 3)}</td><td>{percent(row.averageExpectedROI)}</td><td className={colour(row.netProfit)}>{signed(row.netProfit, 2)}</td><td className={colour(row.roi)}>{signedPercent(row.roi)}</td></tr>)}</tbody>
    </Panel>
    <Panel id={`${id}-ev`} title="Fixed expected-ROI buckets" detail="Post-hoc diagnostic buckets; not used for selection.">
      <thead><tr>{["Estimated EV", "Bets", "Avg odds", "Avg estimated EV", "Profit (units)", "Realised ROI"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.evBuckets.map(({ label, strategy: row }) => <tr key={label}><th scope="row">{label}</th><td>{row.bets}</td><td>{decimal(row.averageOdds, 3)}</td><td>{percent(row.averageExpectedROI)}</td><td className={colour(row.netProfit)}>{signed(row.netProfit, 2)}</td><td className={colour(row.roi)}>{signedPercent(row.roi)}</td></tr>)}</tbody>
    </Panel>
    <section className={models.fitPanel} aria-labelledby={`${id}-margin`}><h3 id={`${id}-margin`}>Market margin diagnostics · all evaluated matches</h3>
      <dl className={styles.metrics}>{[
        ["Mean / median overround", `${percent(m.overround.mean)} / ${percent(m.overround.median)}`], ["Minimum / maximum overround", `${percent(m.overround.minimum)} / ${percent(m.overround.maximum)}`],
        ["Mean fair HOME / DRAW / AWAY", `${percent(m.meanFairProbabilities.homeProbability)} / ${percent(m.meanFairProbabilities.drawProbability)} / ${percent(m.meanFairProbabilities.awayProbability)}`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>Margins are descriptive. No matches are removed or selected by overround.</p>
    </section>
  </section>;
}

export default function ValuePage() {
  const { recent, older, status } = valueSummary;
  return <div className={shared.shell}>
    <a href="#value-results" className={shared.skipLink}>Skip to historical market results</a>
    <ResearchHeader activePage="value" />
    <main className={shared.main}>
      <div className={shared.pageHeading}><div><p className={shared.eyebrow}>HISTORICAL MARKET VALUE</p><h1>dixon-coles-v1 vs Bet365 1X2 prices<span className={shared.titleDot} aria-hidden="true">.</span></h1><p className={shared.intro}>Frozen forecasts · historical Bet365 non-closing 1X2 source prices</p></div><span className={shared.datasetTag}><span aria-hidden="true" />PAPER RESEARCH ONLY</span></div>
      <div className={shared.simulationNotice}><span className={shared.noticeIcon} aria-hidden="true">i</span><p>Historical prices. No current recommendations, live odds or real-money execution. Both groups’ match outcomes were already inspected in V0.6. The model was frozen and the 2% paper rule specified before V0.8 profitability was viewed; neither group is a pristine future holdout.</p></div>
      <section id="value-results" className={models.headlines} aria-label="Separate historical price cohorts"><Headline data={recent} /><Headline data={older} /></section>
      <section className={styles.status} aria-labelledby="profitability-status"><span className={shared.eyebrow}>PREDECLARED RESEARCH STATUS</span><h2 id="profitability-status">{status}</h2>
        <p>Supported requires both cohorts’ ROI 95% lower bounds strictly above zero. Negative requires both upper bounds strictly below zero. Every other result, including a bound equal to zero or an unavailable interval, is INCONCLUSIVE.</p>
        <p>Observed bounds: recent {signedPercent(recent.roiBootstrap.interval.lowerBound)} to {signedPercent(recent.roiBootstrap.interval.upperBound)}; older {signedPercent(older.roiBootstrap.interval.lowerBound)} to {signedPercent(older.roiBootstrap.interval.upperBound)}. The protocol remains unchanged after these results. This status does not authorise real-money betting.</p>
      </section>
      <div className={evaluation.benchmarkNote}><p>Brier asks “Are the probability forecasts better?” ROI asks “Would this fixed price-selection rule have made money at these recorded prices?” Better Brier can coexist with losses; worse overall Brier can coexist with a profitable subset.</p><p>Each cohort separately uses 5,000 season-stratified, source-date-clustered paired resamples, seed 202608, with 95% percentile intervals. All original evaluated date clusters retain bets and no-bets. Any zero-stake replicate makes the ROI interval unavailable and its count is reported. This method does not capture every form of time-series dependence or establish future profitability.</p></div>
      <CohortDetails data={recent} /><CohortDetails data={older} />
      <section className={shared.methodology} aria-labelledby="value-methods"><div className={shared.methodHeading}><h2 id="value-methods">Fixed price-evaluation protocol</h2><p>No fitting, threshold search or outcome exclusions.</p></div>
        <div className={shared.methodGrid}>
          <div><span className={shared.methodNumber}>01 / MARKET MATHS</span><h3>One margin-removal method</h3><p><code className={styles.formula}>raw implied = 1 / decimal odds</code><code className={styles.formula}>overround = sum(raw implied) − 1</code><code className={styles.formula}>fair probability = raw implied / sum(raw implied)</code>Proportional normalization only. Three-class Brier sums HOME/DRAW/AWAY squared errors without division by three. Advantage = fair-market Brier − model Brier.</p></div>
          <div><span className={shared.methodNumber}>02 / SELECT, THEN SETTLE</span><h3>Fixed 2% estimated ROI</h3><p><code className={styles.formula}>expected ROI = model probability × offered odds − 1</code><code className={styles.formula}>fair-market edge = model probability − fair probability</code>Keep candidates with expected ROI ≥2%; choose one by highest ROI, then higher fair-market edge, then HOME/DRAW/AWAY. Fair-market edge is diagnostic, not the threshold. Selection cannot access results.</p></div>
          <div><span className={shared.methodNumber}>03 / UNIT RETURNS</span><h3>No bankroll sizing</h3><p>One unit per selected bet. Win profit = offered odds − 1; loss = −1; no bet = zero stake and profit. ROI = net profit / stakes. Drawdown starts at zero and measures the largest peak-to-trough cumulative-profit decline, ordered by season, source date and fixture ID. Returns are not annualised.</p></div>
          <div><span className={shared.methodNumber}>04 / PRICE DEFINITION</span><h3>B365H · B365D · B365A</h3><p>Only these source prices are used. Football-Data’s collection convention varies across eras: there is no uniform number of minutes before kickoff. C-suffixed closing fields and all other bookmakers are excluded to preserve the named price family. No closing-line value is calculated.</p></div>
          <div><span className={shared.methodNumber}>05 / LOCAL ALIGNMENT</span><h3>380 / 380 in all ten seasons</h3><p>V0.7 source hashes verified unchanged. Only Date/HomeTeam/AwayTeam/B365H/B365D/B365A are extracted. Explicit aliases join season/date/home/away, with ambiguous, duplicate or missing matches rejected. All 1,688 recent and 1,691 older V0.6 records are priced; authoritative outcomes and probabilities come only from V0.6.</p></div>
          <div><span className={shared.methodNumber}>06 / RESEARCH LIMITS</span><h3>Historical evidence only</h3><p>Prices never enter model fitting. Detailed prices, joins and paper picks remain gitignored; this page reads compact aggregates. Outcomes were already known to the project. Frozen probabilities and predeclared selection protect against price-based tuning, but historical results cannot establish future profitability.</p></div>
        </div>
      </section>
      <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>HISTORICAL PAPER RESEARCH</span><span>Fixed protocol. Aggregate-only data. V0.8.</span></footer>
    </main>
  </div>;
}
