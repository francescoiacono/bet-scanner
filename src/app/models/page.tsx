import type { Metadata } from "next";
import type { ReactNode } from "react";
import { modelComparison } from "@/data/model-comparison";
import { eplProvenance } from "@/data/epl-seasons";
import type { DatasetComparison } from "@/lib/model-comparison/types";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import evaluation from "../backtest/backtest.module.css";
import styles from "./models.module.css";

export const metadata: Metadata = {
  title: "Model Comparison | Bet Scanner",
  description: "Frozen poisson-v1 versus causally fitted Dixon–Coles on development and separate external historical Premier League validation seasons.",
};

const decimal = (value: number | null, precision = 5) => value === null ? "—" : value.toFixed(precision);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const signed = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${decimal(value)}`;
const skill = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${percent(value)}`;

function TablePanel({ title, id, detail, children, wide = false }: { title: string; id: string; detail: string; children: ReactNode; wide?: boolean }) {
  return <section className={shared.rankingPanel} aria-labelledby={id}>
    <div className={shared.rankingHeading}><h3 id={id} className={styles.panelTitle}>{title}</h3><p>{detail}</p></div>
    <div className={shared.tableScroll} role="region" aria-label={title} tabIndex={0}>
      <table className={`${shared.table} ${styles.table} ${wide ? styles.wideTable : ""}`}><caption className={shared.srOnly}>{title}. {detail}</caption>{children}</table>
    </div>
  </section>;
}

function Headline({ data, external }: { data: DatasetComparison; external: boolean }) {
  const { interval } = data.bootstrap;
  const interpretation = interval.lowerBound === null || interval.upperBound === null ? "Unavailable: no evaluated matches."
    : interval.lowerBound > 0 ? "The interval remained above zero under this diagnostic resampling method."
      : interval.upperBound < 0 ? "The interval remained below zero under this diagnostic resampling method."
        : "The observed advantage is not robustly separated from zero under this diagnostic resampling method.";
  return <article className={`${styles.headline} ${external ? styles.external : ""}`}>
    <span className={shared.eyebrow}>{external ? "EXTERNAL HISTORICAL VALIDATION" : "DEVELOPMENT / PREVIOUSLY EXAMINED"}</span>
    <h2>{external ? "2014-15 → 2018-19" : "2021-22 → 2025-26"}</h2>
    <p>{external ? "Not used in V0.1–V0.5 or to choose this model specification. Historical validation, not future unseen data." : "Previously examined in V0.4 and V0.5. These seasons are the development / diagnostic dataset."}</p>
    <span className={styles.advantage}>{signed(data.summary.pairedAdvantage)}</span>
    <p>Paired Brier advantage · positive favours Dixon–Coles</p>
    <p className={styles.interval}>95% interval: {signed(interval.lowerBound)} to {signed(interval.upperBound)}</p>
    <p>{interpretation}</p>
    <dl><div><dt>poisson-v1 Brier</dt><dd>{decimal(data.summary.poissonV1Brier)}</dd></div><div><dt>dixon-coles-v1 Brier</dt><dd>{decimal(data.summary.dixonColesBrier)}</dd></div></dl>
  </article>;
}

function DatasetSection({ data, external }: { data: DatasetComparison; external: boolean }) {
  const id = external ? "external" : "development";
  const { summary, fitDiagnostics: fits } = data;
  return <section className={styles.dataset} aria-labelledby={`${id}-title`}>
    <div className={shared.sectionHeading}><div><p className={shared.eyebrow}>{external ? "EXTERNAL HISTORICAL VALIDATION / NOT USED IN V0.1–V0.5" : "DEVELOPMENT / PREVIOUSLY EXAMINED"}</p><h2 id={`${id}-title`}>{external ? "2014-15 → 2018-19" : "2021-22 → 2025-26"}</h2></div><span className={shared.sortLabel}>Same eligible matches · separate season histories</span></div>
    <div className={shared.summary}>
      {[{ label: "Historical matches", value: summary.historicalMatches, detail: "Five complete seasons · 380 matches each" },
        { label: "Evaluated by both models", value: summary.evaluatedMatches, detail: "Identical match IDs · strictly earlier dates only" },
        { label: "Warm-up skips", value: summary.warmUpSkips, detail: "Both teams need two home and two away appearances" }].map((card) => <div className={shared.summaryCard} key={card.label}><span className={shared.eyebrow}>{card.label}</span><p className={shared.summaryValue}>{card.value.toLocaleString("en-GB")}</p><span className={shared.summaryDetail}>{card.detail}</span></div>)}
    </div>

    <TablePanel id={`${id}-overall`} title="Overall probability quality" detail="Lower Brier is better · skill is relative improvement versus league-average Poisson">
      <thead><tr><th scope="col">Forecast</th><th scope="col">Mean Brier</th><th scope="col">Skill vs league Poisson</th><th scope="col">Top-pick accuracy</th></tr></thead>
      <tbody>
        <tr><th scope="row">poisson-v1</th><td>{decimal(summary.poissonV1Brier)}</td><td>{skill(summary.poissonV1SkillVsLeaguePoisson)}</td><td>{percent(summary.poissonV1Accuracy)}</td></tr>
        <tr><th scope="row">dixon-coles-v1</th><td>{decimal(summary.dixonColesBrier)}</td><td>{skill(summary.dixonColesSkillVsLeaguePoisson)}</td><td>{percent(summary.dixonColesAccuracy)}</td></tr>
        <tr><th scope="row">League-average Poisson</th><td>{decimal(summary.leaguePoissonBrier)}</td><td>—</td><td>—</td></tr>
        <tr><th scope="row">League base rate</th><td>{decimal(summary.leagueBaseRateBrier)}</td><td>—</td><td>—</td></tr>
      </tbody>
    </TablePanel>
    <TablePanel id={`${id}-seasons`} title="Season-by-season model comparison" wide detail="No cross-season carryover · final rho is from the last eligible prediction date’s strictly prior fit">
      <thead><tr><th scope="col">Season</th><th scope="col">Evaluated</th><th scope="col">Skipped</th><th scope="col">Poisson Brier</th><th scope="col">DC Brier</th><th scope="col">DC advantage</th><th scope="col">League-Poisson Brier</th><th scope="col">Base-rate Brier</th><th scope="col">Poisson accuracy</th><th scope="col">DC accuracy</th><th scope="col">Final rho</th></tr></thead>
      <tbody>{data.seasons.map(({ seasonId, summary: season, finalRho }) => <tr key={seasonId}><th scope="row">{seasonId}</th><td>{season.evaluatedMatches}</td><td>{season.warmUpSkips}</td><td>{decimal(season.poissonV1Brier)}</td><td>{decimal(season.dixonColesBrier)}</td><td>{signed(season.pairedAdvantage)}</td><td>{decimal(season.leaguePoissonBrier)}</td><td>{decimal(season.leagueBaseRateBrier)}</td><td>{percent(season.poissonV1Accuracy)}</td><td>{percent(season.dixonColesAccuracy)}</td><td>{decimal(finalRho, 4)}</td></tr>)}</tbody>
    </TablePanel>
    <TablePanel id={`${id}-outcomes`} title="Outcome Brier components" detail="Mean (p − y)² · HOME + DRAW + AWAY components reproduce each model’s Brier">
      <thead><tr><th scope="col">Outcome</th><th scope="col">poisson-v1</th><th scope="col">dixon-coles-v1</th></tr></thead>
      <tbody>{data.outcomes.map((row) => <tr key={row.outcome}><th scope="row">{row.outcome}</th><td>{decimal(row.poissonV1Component)}</td><td>{decimal(row.dixonColesComponent)}</td></tr>)}</tbody>
    </TablePanel>
    <TablePanel id={`${id}-history`} title="History-depth comparison" detail="Unchanged V0.5 buckets · minimum of four prior team/venue counts · positive advantage favours DC">
      <thead><tr><th scope="col">Depth</th><th scope="col">Matches</th><th scope="col">Poisson Brier</th><th scope="col">DC Brier</th><th scope="col">DC advantage</th></tr></thead>
      <tbody>{data.historyDepth.filter((row) => row.matches > 0).map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.matches}</td><td>{decimal(row.poissonV1Brier)}</td><td>{decimal(row.dixonColesBrier)}</td><td>{signed(row.pairedAdvantage)}</td></tr>)}</tbody>
    </TablePanel>

    <section className={styles.fitPanel} aria-labelledby={`${id}-fits`}>
      <h3 id={`${id}-fits`}>Dixon–Coles fit audit</h3>
      <dl className={styles.fitStats}>
        <div><dt>Successful date-batch fits / failures</dt><dd>{fits.successfulFits} / {fits.failures}</dd></div>
        <div><dt>Rho range</dt><dd>{decimal(fits.rhoMinimum, 4)} to {decimal(fits.rhoMaximum, 4)}</dd></div>
        <div><dt>Median rho across fits</dt><dd>{decimal(fits.rhoMedian, 4)}</dd></div>
        <div><dt>Fits near ±0.20 (|rho| ≥ 0.199)</dt><dd>{fits.nearRhoBoundaryFits}</dd></div>
        <div><dt>Home-advantage range (log scale)</dt><dd>{decimal(fits.homeAdvantageMinimum, 4)} to {decimal(fits.homeAdvantageMaximum, 4)}</dd></div>
        <div><dt>Maximum mean-objective gradient norm</dt><dd>{decimal(fits.maximumMeanGradientNorm, 6)}</dd></div>
      </dl>
      <p>Every eligible date is fitted once from deterministic zeros, with equal likelihood weight for all prior current-season matches. Convergence uses a gradient test, five stable objective changes, or the optimiser’s step tolerance. A converged fit need not have a zero gradient near a score-validity boundary. Each fit retains its stopping criterion, iterations, evaluations, likelihood, and team parameters in the generated artifact.</p>
      <p>Rho is constrained inside ±0.20 and the algebraic tau-validity bounds. Near-boundary fits are a limitation; the bounds were preserved after external evaluation. Any invalid or non-converged fit aborts generation; no substitution or stale parameters are used.</p>
    </section>
  </section>;
}

export default function ModelsPage() {
  const { development, externalValidation } = modelComparison;
  return <div className={shared.shell}>
    <a href="#model-results" className={shared.skipLink}>Skip to model comparison</a>
    <ResearchHeader activePage="models" />
    <main className={shared.main}>
      <div className={shared.pageHeading}><div><p className={shared.eyebrow}>MODEL COMPARISON</p><h1>poisson-v1 vs dixon-coles-v1<span className={shared.titleDot} aria-hidden="true">.</span></h1><p className={shared.intro}>REAL PREMIER LEAGUE RESULTS · Development and external historical validation</p></div><span className={shared.datasetTag}><span aria-hidden="true" />Offline fitted results</span></div>
      <div className={shared.simulationNotice}><span className={shared.noticeIcon} aria-hidden="true">i</span><p>poisson-v1 uses simple aggregate attack/defence ratios and independent Poisson scores. dixon-coles-v1 jointly fits attack/defence ratings and home advantage by maximum likelihood, with a low-score dependence correction. The scanner continues to use the frozen poisson-v1 model.</p></div>
      <section id="model-results" className={styles.headlines} aria-label="Separate paired comparison results"><Headline data={externalValidation} external /><Headline data={development} external={false} /></section>
      <div className={evaluation.benchmarkNote}>
        <p>Advantage = poisson-v1 Brier − Dixon–Coles Brier. Each dataset uses 5,000 season-stratified, source-date-clustered paired resamples, seed 202606, and a 95% percentile interval. Same-date matches stay together, and resampled means are weighted by match count.</p>
        <p>V0.6 does not tune Dixon–Coles after viewing the external-validation results. Intervals describe these observed historical seasons and do not capture all time-series dependence. Neither model evaluation establishes betting profitability because no market prices are evaluated.</p>
        <p>The full comparison changes joint fitting and low-score correction together. Outcome components show where forecasts improve; they cannot isolate the correction’s individual contribution.</p>
      </div>
      <DatasetSection data={externalValidation} external />
      <DatasetSection data={development} external={false} />
      <section className={shared.methodology} aria-labelledby="model-protocol"><div className={shared.methodHeading}><h2 id="model-protocol">Comparison protocol</h2><p>Frozen specification. Paired eligibility.</p></div>
        <div className={shared.methodGrid}>
          <div><span className={shared.methodNumber}>01 / CAUSAL FITTING</span><h3>Earlier dates in this season</h3><p>Each season starts empty. Target-date scores never enter fitting. Prior warm-up skips remain training data. Both models evaluate the same fixtures after two home and two away appearances per team.</p></div>
          <div><span className={shared.methodNumber}>02 / LOCAL ARTIFACT</span><h3>Fit offline; read locally</h3><p>The page reads committed model-comparison-v06.json. No optimiser runs in the browser or on page requests. No time decay, regularisation, shrinkage, or previous-season priors are used.</p></div>
          <div><span className={shared.methodNumber}>03 / PROVENANCE</span><h3>Ten complete EPL seasons</h3><p>Exact source bytes from <a href={`${eplProvenance.repository}/tree/${eplProvenance.commit}`}>OpenFootball / england</a>, pinned at {eplProvenance.commit.slice(0, 8)}, CC0. Each season passes 380-match, 20-team, and 19-home/19-away checks. Raw goals, fixed 0–10 prediction grid, no player or market data.</p></div>
        </div>
      </section>
      <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>MODEL RESEARCH</span><span>External historical validation. No prices. V0.6.</span></footer>
    </main>
  </div>;
}
