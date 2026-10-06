import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cornersSummary } from "@/data/corners-summary";
import type { CornerDatasetSummary } from "@/lib/corners/summary";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import modelStyles from "../models/models.module.css";
import styles from "./corners.module.css";

export const metadata: Metadata = { title: "Corner Research | Bet Scanner", description: "Causal Poisson versus Negative Binomial corner-count research on separate development and external historical Premier League seasons." };
const decimal = (value: number | null, precision = 5) => value === null ? "—" : value.toFixed(precision);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const signed = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${decimal(value, 6)}`;
const dispersion = (value: number | null) => value === null ? "—" : value < 0.0001 ? value.toExponential(2) : decimal(value, 5);

function Panel({ title, id, detail, children, season = false }: { title: string; id: string; detail: string; children: ReactNode; season?: boolean }) {
  return <section className={shared.rankingPanel} aria-labelledby={id}><div className={shared.rankingHeading}><h3 id={id} className={styles.title}>{title}</h3><p>{detail}</p></div>
    <div className={shared.tableScroll} role="region" aria-label={title} tabIndex={0}><table className={`${shared.table} ${styles.table} ${season ? styles.seasonTable : ""}`}><caption className={shared.srOnly}>{title}. {detail}</caption>{children}</table></div></section>;
}
function Headline({ data, external }: { data: CornerDatasetSummary; external: boolean }) {
  const { interval } = data.bootstrap;
  return <article className={`${modelStyles.headline} ${external ? modelStyles.external : ""}`}>
    <span className={shared.eyebrow}>{external ? "EXTERNAL HISTORICAL VALIDATION" : "DEVELOPMENT / PREVIOUSLY SELECTED"}</span>
    <h2>{external ? "2014-15 → 2018-19" : "2021-22 → 2025-26"}</h2>
    <p>{external ? "Separate historical seasons, not future unseen data. No model choices changed after evaluating these results." : "Development / diagnostic seasons. Reported separately from external validation."}</p>
    <span className={modelStyles.advantage}>{signed(data.summary.pairedAdvantage)}</span>
    <p>Paired RPS advantage · positive favours Negative Binomial</p>
    <p className={modelStyles.interval}>95% interval: {signed(interval.lowerBound)} to {signed(interval.upperBound)}</p>
    <dl><div><dt>Poisson mean RPS</dt><dd>{decimal(data.summary.poissonRPS, 6)}</dd></div><div><dt>Negative Binomial mean RPS</dt><dd>{decimal(data.summary.negativeBinomialRPS, 6)}</dd></div></dl>
    <p>Lower RPS is better. All forecasts share the same eligible matches.</p>
  </article>;
}
function Dataset({ data, external }: { data: CornerDatasetSummary; external: boolean }) {
  const id = external ? "external-corners" : "development-corners", { summary, fitDiagnostics: fits, dispersion: empirical } = data;
  return <section className={modelStyles.dataset} aria-labelledby={`${id}-title`}>
    <div className={shared.sectionHeading}><div><p className={shared.eyebrow}>{external ? "EXTERNAL HISTORICAL VALIDATION" : "DEVELOPMENT / PREVIOUSLY SELECTED"}</p><h2 id={`${id}-title`}>{external ? "2014-15 → 2018-19" : "2021-22 → 2025-26"}</h2></div><span className={shared.sortLabel}>Strictly prior dates · identical eligible IDs</span></div>
    <div className={shared.summary}>{[
      { label: "Historical matches", value: summary.historicalMatches, detail: "Five complete seasons · private source rows" },
      { label: "Evaluated matches", value: summary.evaluatedMatches, detail: "Both models and both causal benchmarks" },
      { label: "Warm-up skips", value: summary.warmUpSkips, detail: "Two prior home and two away appearances per team" },
    ].map((card) => <div className={shared.summaryCard} key={card.label}><span className={shared.eyebrow}>{card.label}</span><p className={shared.summaryValue}>{card.value.toLocaleString("en-GB")}</p><span className={shared.summaryDetail}>{card.detail}</span></div>)}</div>
    <Panel id={`${id}-overall`} title="Full-distribution performance" detail="Normalized RPS across 0…30 and 31+ · conceptual hierarchy does not guarantee improvement">
      <thead><tr><th scope="col">Forecast</th><th scope="col">Mean RPS</th><th scope="col">Mean predicted total corners</th></tr></thead><tbody>
        <tr><th scope="row">League empirical corners</th><td>{decimal(summary.empiricalRPS, 6)}</td><td>—</td></tr>
        <tr><th scope="row">League-average Poisson corners</th><td>{decimal(summary.leaguePoissonRPS, 6)}</td><td>—</td></tr>
        <tr><th scope="row">corner-poisson-v1</th><td>{decimal(summary.poissonRPS, 6)}</td><td>{decimal(summary.poissonMeanTotal, 3)}</td></tr>
        <tr><th scope="row">corner-negative-binomial-v1</th><td>{decimal(summary.negativeBinomialRPS, 6)}</td><td>{decimal(summary.negativeBinomialMeanTotal, 3)}</td></tr>
      </tbody>
    </Panel>
    <Panel id={`${id}-lines`} title="Fixed Over-line probability quality" detail="Conventional binary Brier (0–1) · ECE per line, displayed in percentage points">
      <thead><tr><th scope="col">Over line</th><th scope="col">Matches</th><th scope="col">Observed Over</th><th scope="col">Poisson predicted</th><th scope="col">NB predicted</th><th scope="col">Poisson Brier</th><th scope="col">NB Brier</th><th scope="col">League-Poisson Brier</th><th scope="col">Empirical Brier</th><th scope="col">Poisson ECE (pp)</th><th scope="col">NB ECE (pp)</th></tr></thead>
      <tbody>{data.lines.map((line) => <tr key={line.line}><th scope="row">Over {line.line}</th><td>{line.evaluatedMatches}</td><td>{percent(line.observedOverFrequency)}</td><td>{percent(line.poissonMeanPredicted)}</td><td>{percent(line.negativeBinomialMeanPredicted)}</td><td>{decimal(line.poissonBrier)}</td><td>{decimal(line.negativeBinomialBrier)}</td><td>{decimal(line.leaguePoissonBrier)}</td><td>{decimal(line.empiricalBrier)}</td><td>{decimal(line.poissonECE === null ? null : line.poissonECE * 100, 2)}</td><td>{decimal(line.negativeBinomialECE === null ? null : line.negativeBinomialECE * 100, 2)}</td></tr>)}</tbody>
    </Panel>
    <Panel id={`${id}-seasons`} title="Season-by-season corner comparison" season detail="Every season shown · final alpha uses the last eligible date’s strictly earlier fit">
      <thead><tr><th scope="col">Season</th><th scope="col">Evaluated</th><th scope="col">Skipped</th><th scope="col">Poisson RPS</th><th scope="col">NB RPS</th><th scope="col">NB advantage</th><th scope="col">Empirical RPS</th><th scope="col">League-Poisson RPS</th><th scope="col">Observed mean</th><th scope="col">Poisson mean</th><th scope="col">NB mean</th><th scope="col">Final alpha</th></tr></thead>
      <tbody>{data.seasons.map(({ seasonId, summary: season, finalAlpha }) => <tr key={seasonId}><th scope="row">{seasonId}</th><td>{season.evaluatedMatches}</td><td>{season.warmUpSkips}</td><td>{decimal(season.poissonRPS, 6)}</td><td>{decimal(season.negativeBinomialRPS, 6)}</td><td>{signed(season.pairedAdvantage)}</td><td>{decimal(season.empiricalRPS, 6)}</td><td>{decimal(season.leaguePoissonRPS, 6)}</td><td>{decimal(season.observedMeanTotal, 3)}</td><td>{decimal(season.poissonMeanTotal, 3)}</td><td>{decimal(season.negativeBinomialMeanTotal, 3)}</td><td>{dispersion(finalAlpha)}</td></tr>)}</tbody>
    </Panel>
    <Panel id={`${id}-depth`} title="History-depth performance" detail="Unchanged V0.5/V0.6 buckets · minimum of four team/venue counts">
      <thead><tr><th scope="col">Depth</th><th scope="col">Matches</th><th scope="col">Poisson RPS</th><th scope="col">NB RPS</th><th scope="col">NB advantage</th></tr></thead>
      <tbody>{data.historyDepth.map((bucket) => <tr key={bucket.label}><th scope="row">{bucket.label}</th><td>{bucket.matches}</td><td>{decimal(bucket.poissonRPS, 6)}</td><td>{decimal(bucket.negativeBinomialRPS, 6)}</td><td>{signed(bucket.pairedAdvantage)}</td></tr>)}</tbody>
    </Panel>
    <section className={styles.diagnostics} aria-labelledby={`${id}-dispersion`}><h3 id={`${id}-dispersion`} className={styles.title}>Dispersion and fitting audit</h3>
      <dl className={styles.stats}>
        <div><dt>Successful Poisson / NB fits</dt><dd>{fits.successfulPoissonFits} / {fits.successfulNegativeBinomialFits}</dd></div><div><dt>Fit failures</dt><dd>{fits.failures}</dd></div>
        <div><dt>Alpha min / median / max</dt><dd>{dispersion(fits.alphaMinimum)} / {dispersion(fits.alphaMedian)} / {dispersion(fits.alphaMaximum)}</dd></div>
        <div><dt>Empirical mean total corners</dt><dd>{decimal(empirical.meanTotal, 3)}</dd></div><div><dt>Population variance of totals</dt><dd>{decimal(empirical.varianceTotal, 3)}</dd></div><div><dt>Variance / mean</dt><dd>{decimal(empirical.varianceToMean, 3)}</dd></div>
        <div><dt>Max mean-gradient norm, Poisson / NB</dt><dd>{decimal(fits.maximumPoissonMeanGradientNorm, 7)} / {decimal(fits.maximumNegativeBinomialMeanGradientNorm, 7)}</dd></div>
        <div><dt>Poisson gradient / objective / step stops</dt><dd>{fits.poissonConvergence.gradient} / {fits.poissonConvergence.objective} / {fits.poissonConvergence.step}</dd></div>
        <div><dt>NB gradient / objective / step stops</dt><dd>{fits.negativeBinomialConvergence.gradient} / {fits.negativeBinomialConvergence.objective} / {fits.negativeBinomialConvergence.step}</dd></div>
      </dl>
      <p>Descriptive mean and population variance use all {empirical.sourceMatches.toLocaleString("en-GB")} source matches, including warm-up skips. Variance greater than the mean motivates studying overdispersion; it does not establish conditional model fit. NB variance is μ + alpha × μ². Alpha near zero approaches Poisson.</p>
      <p>Deterministic BFGS starts mean parameters at zero and alpha at 0.1, fitting once per eligible date. Finite valid convergence is mandatory; any failure aborts the entire build. Objective or step convergence does not prove a global optimum. Detailed predictions, coefficients, and stopping audits remain private.</p>
    </section>
  </section>;
}
export default function CornersPage() {
  const { development, externalValidation, preferredModel } = cornersSummary;
  return <div className={shared.shell}><a href="#corner-results" className={shared.skipLink}>Skip to corner results</a><ResearchHeader activePage="corners" />
    <main className={shared.main}><div className={shared.pageHeading}><div><p className={shared.eyebrow}>CORNER MODEL RESEARCH</p><h1>Poisson vs Negative Binomial<span className={shared.titleDot} aria-hidden="true">.</span></h1><p className={shared.intro}>REAL PREMIER LEAGUE CORNER COUNTS · Total match corners</p></div><span className={shared.datasetTag}><span aria-hidden="true" />Offline research results</span></div>
      <div className={shared.simulationNotice}><span className={shared.noticeIcon} aria-hidden="true">i</span><p>No odds, betting profitability, or current recommendations. Both count models jointly fit the same team attack/defence mean structure. Negative Binomial adds one global dispersion parameter. The fictional scanner and both result models remain unchanged.</p></div>
      <section id="corner-results" className={modelStyles.headlines} aria-label="Separate corner dataset comparisons"><Headline data={externalValidation} external /><Headline data={development} external={false} /></section>
      <div className={styles.preference}><span className={shared.eyebrow}>PREDECLARED RESEARCH-ONLY PREFERENCE</span><strong>{preferredModel}</strong><p>The external 95% interval alone determines this label: entirely above zero → Negative Binomial; entirely below zero → Poisson; includes zero → NONE / INCONCLUSIVE. This does not promote a model to the scanner or establish a betting edge.</p></div>
      <Dataset data={externalValidation} external /><Dataset data={development} external={false} />
      <section className={shared.methodology} aria-labelledby="corner-method"><div className={shared.methodHeading}><h2 id="corner-method">Research protocol</h2><p>Fixed specification. Private source rows.</p></div><div className={shared.methodGrid}>
        <div><span className={shared.methodNumber}>01 / TIME CAUSALITY</span><h3>Earlier source dates only</h3><p>History starts empty each season. Noon UTC is a source-date ordering key, not actual kickoff. Same-date results enter only after every prediction. Earlier warm-up skips remain training data. Both teams need two home and two away appearances.</p></div>
        <div><span className={shared.methodNumber}>02 / PROPER SCORES</span><h3>Whole distribution and fixed lines</h3><p>RPS measures the ordered 0…30 / 31+ distribution, retaining all tail mass. Brier measures each fixed Over line with exact CDFs. Binary Brier is 0–1 and differs from result-market Brier (0–2). Calibration uses ten fixed bins per line, with 1 in the final bin.</p></div>
        <div><span className={shared.methodNumber}>03 / PRIVATE PROVENANCE</span><h3>Manual local CSVs</h3><p>Sources were manually supplied from Football-Data.co.uk, with exact SHA-256 hashes. Only Date, HomeTeam, AwayTeam, HC and AC enter the model. Original CSVs, normalized rows, per-match predictions and team coefficients are gitignored; this page reads aggregates only.</p></div>
      </div><p>Paired intervals use 5,000 season-stratified source-date-clustered resamples, seed 202607, and 95% percentiles. Matches remain paired and same-date clusters stay together. Intervals describe these historical samples and do not capture all temporal dependence.</p><p>Home and away counts are conditionally independent; shared match conditions may violate this assumption. Within-season raw counts only: no priors, shrinkage, regularisation, decay, player data, or prices. No specification changes follow external results.</p></section>
      <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>CORNER RESEARCH</span><span>No prices. No recommendations. V0.7.</span></footer>
    </main></div>;
}
