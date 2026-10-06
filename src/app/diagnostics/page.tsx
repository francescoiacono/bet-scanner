import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eplSeasons } from "@/data/epl-seasons";
import { runMultiSeasonBacktest } from "@/lib/backtest/run-multi-season-backtest";
import { bootstrapPairedAdvantages } from "@/lib/diagnostics/bootstrap";
import { summarizeHistoryDepth } from "@/lib/diagnostics/history-depth";
import { diagnoseOutcomes } from "@/lib/diagnostics/outcome-calibration";
import { diagnoseWeakestSeason, leaveOneSeasonOut } from "@/lib/diagnostics/robustness";
import type { AdvantageInterval, HistoryDepthSummary, OutcomeDiagnostic } from "@/lib/diagnostics/types";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import evaluation from "../backtest/backtest.module.css";
import styles from "./diagnostics.module.css";

export const metadata: Metadata = {
  title: "Model Diagnostics | Bet Scanner",
  description: "Paired uncertainty, history depth, outcome calibration, and season robustness of frozen poisson-v1 on five completed Premier League seasons.",
};

const decimal = (value: number | null) => value === null ? "—" : value.toFixed(4);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const signed = (value: number | null, format = decimal) => value === null ? "—" : `${value >= 0 ? "+" : ""}${format(value)}`;
const points = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)} pp`;

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={shared.summaryCard}><span className={shared.eyebrow}>{label}</span><p className={shared.summaryValue}>{value}</p><span className={shared.summaryDetail}>{detail}</span></div>;
}

function TablePanel({ id, title, detail, children, wide = false }: { id: string; title: string; detail: string; children: ReactNode; wide?: boolean }) {
  return <section className={shared.rankingPanel} aria-labelledby={id}>
    <div className={shared.rankingHeading}><h2 id={id} className={styles.panelHeading}>{title}</h2><p>{detail}</p></div>
    <div className={shared.tableScroll} role="region" aria-label={title} tabIndex={0}>
      <table className={`${shared.table} ${styles.table} ${wide ? styles.wideTable : ""}`}>
        <caption className={shared.srOnly}>{title}. {detail}</caption>{children}
      </table>
    </div>
  </section>;
}

function HistoryTable({ id, rows, title }: { id: string; rows: readonly HistoryDepthSummary[]; title: string }) {
  return <TablePanel id={id} title={title} wide detail="Depth = minimum of four prior team/venue counts · fixed buckets · positive advantage favours poisson-v1">
    <thead><tr><th scope="col">History depth</th><th scope="col">Matches</th><th scope="col">Model Brier</th><th scope="col">Base-rate Brier</th><th scope="col">Advantage vs base</th><th scope="col">League-Poisson Brier</th><th scope="col">Advantage vs Poisson</th><th scope="col">Accuracy</th></tr></thead>
    <tbody>{rows.filter((row) => row.evaluatedMatches > 0).map((row) => <tr key={row.label}>
      <th scope="row">{row.label}</th><td>{row.evaluatedMatches}</td><td>{decimal(row.modelBrier)}</td><td>{decimal(row.leagueBaseRateBrier)}</td><td>{signed(row.advantageVsLeagueBaseRate)}</td><td>{decimal(row.leaguePoissonBrier)}</td><td>{signed(row.advantageVsLeaguePoisson)}</td><td>{percent(row.topPickAccuracy)}</td>
    </tr>)}</tbody>
  </TablePanel>;
}

function ComponentTable({ id, rows, title }: { id: string; rows: readonly OutcomeDiagnostic[]; title: string }) {
  return <TablePanel id={id} title={title} detail="Mean (p − y)² for each outcome · the three components sum to that forecast’s mean Brier">
    <thead><tr><th scope="col">Outcome</th><th scope="col">poisson-v1</th><th scope="col">League base rate</th><th scope="col">League-average Poisson</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.outcome}><th scope="row">{row.outcome}</th><td>{decimal(row.modelBrierComponent)}</td><td>{decimal(row.leagueBaseRateBrierComponent)}</td><td>{decimal(row.leaguePoissonBrierComponent)}</td></tr>)}</tbody>
  </TablePanel>;
}

function intervalInterpretation(interval: AdvantageInterval): string {
  if (interval.lowerBound === null || interval.upperBound === null) return "Unavailable: no evaluated matches.";
  if (interval.lowerBound > 0) return "The interval remained above zero under this diagnostic resampling method.";
  if (interval.upperBound < 0) return "The interval remained below zero under this diagnostic resampling method; the benchmark performed better.";
  return "The observed advantage is not robustly separated from zero under this diagnostic resampling method.";
}

export default function DiagnosticsPage() {
  const result = runMultiSeasonBacktest(eplSeasons);
  const { summary } = result;
  const bootstrap = bootstrapPairedAdvantages(result.predictions);
  const history = summarizeHistoryDepth(result.predictions);
  const outcomes = diagnoseOutcomes(result.predictions);
  const robustness = leaveOneSeasonOut(result);
  const weakest = diagnoseWeakestSeason(result);
  const intervals = [
    { label: "vs league base rate", interval: bootstrap.vsLeagueBaseRate },
    { label: "vs league-average Poisson", interval: bootstrap.vsLeaguePoisson },
  ];

  return <div className={shared.shell}>
    <a href="#benchmark-title" className={shared.skipLink}>Skip to model diagnostics</a>
    <ResearchHeader activePage="diagnostics" />
    <main className={shared.main}>
      <div className={shared.pageHeading}>
        <div><p className={shared.eyebrow}>MODEL DIAGNOSTICS</p><h1>Understand the forecasts<span className={shared.titleDot} aria-hidden="true">.</span></h1><p className={shared.intro}>REAL PREMIER LEAGUE RESULTS · 2021-22 → 2025-26</p></div>
        <span className={shared.datasetTag}><span aria-hidden="true" />{result.modelVersion} · Frozen model</span>
      </div>
      <div className={shared.simulationNotice}><span className={shared.noticeIcon} aria-hidden="true">i</span><p>V0.5 does not modify poisson-v1. It investigates uncertainty, robustness, history depth, and probability calibration on the same historical evaluation data. These diagnostics do not establish betting profitability.</p></div>
      <section className={shared.summary} aria-label="Sample and benchmark skill">
        <MetricCard label="Evaluated matches" value={summary.evaluatedMatches.toLocaleString("en-GB")} detail={`${summary.skippedMatches} warm-up skips · five independent season histories`} />
        <MetricCard label="Skill vs league base rate" value={signed(summary.brierSkillVsLeagueBaseRate, percent)} detail="Relative Brier improvement over prior outcome frequencies" />
        <MetricCard label="Skill vs league Poisson" value={signed(summary.brierSkillVsLeaguePoisson, percent)} detail="Does team-specific information improve on league scoring rates?" />
      </section>

      <TablePanel id="benchmark-title" title="Benchmark hierarchy" detail="Increasing forecast information · lower Brier is better · all four forecasts score the same eligible matches">
        <thead><tr><th scope="col">Forecast</th><th scope="col">Information available</th><th scope="col">Overall Brier</th></tr></thead>
        <tbody>
          <tr><th scope="row">Uniform</th><td className={styles.description}>HOME / DRAW / AWAY at ⅓ each</td><td>{decimal(summary.uniformBenchmarkBrier)}</td></tr>
          <tr><th scope="row">League base rate</th><td className={styles.description}>Prior season-to-date HOME / DRAW / AWAY frequencies</td><td>{decimal(summary.leagueBaseRateBrier)}</td></tr>
          <tr><th scope="row">League-average Poisson</th><td className={styles.description}>Prior league home and away scoring rates; no team identities</td><td>{decimal(summary.leaguePoissonBrier)}</td></tr>
          <tr className={styles.highlight}><th scope="row">poisson-v1</th><td className={styles.description}>League scoring rates + team attack/defence strengths</td><td>{decimal(summary.meanBrierScore)}</td></tr>
        </tbody>
      </TablePanel>

      <TablePanel id="bootstrap-title" title="Paired Brier advantage" wide detail={`${bootstrap.samples.toLocaleString("en-GB")} season-stratified date-cluster resamples · seed ${bootstrap.seed} · ${(bootstrap.confidenceLevel * 100).toFixed(0)}% percentile intervals`}>
        <thead><tr><th scope="col">Comparison</th><th scope="col">Observed advantage</th><th scope="col">Interval lower</th><th scope="col">Interval upper</th><th scope="col">Diagnostic interpretation</th></tr></thead>
        <tbody>{intervals.map(({ label, interval }) => <tr key={label}><th scope="row">{label}</th><td>{signed(interval.observedMean)}</td><td>{signed(interval.lowerBound)}</td><td>{signed(interval.upperBound)}</td><td className={styles.description}>{intervalInterpretation(interval)}</td></tr>)}</tbody>
      </TablePanel>
      <div className={evaluation.benchmarkNote}>
        <p>Advantage = benchmark Brier − model Brier. Positive favours poisson-v1; negative favours the benchmark. Each resample retains paired forecasts and whole source-date groups, draws the original number of groups separately within each season, and pools by sampled match count.</p>
        <p>The bootstrap interval is a diagnostic uncertainty estimate for this observed set of seasons. It is not proof of a persistent real-world edge. Date clustering preserves same-date dependence but does not model every form of football or time-series dependence.</p>
      </div>

      <HistoryTable id="history-title" title="History-depth performance" rows={history} />
      <TablePanel id="outcomes-title" title="Outcome calibration and bias" wide detail="poisson-v1 · all evaluated matches for each outcome · gap = mean prediction − observed rate · ECE is separate one-vs-rest calibration">
        <thead><tr><th scope="col">Outcome</th><th scope="col">Mean prediction</th><th scope="col">Observed frequency</th><th scope="col">Gap</th><th scope="col">One-vs-rest ECE</th><th scope="col">Model Brier component</th></tr></thead>
        <tbody>{outcomes.map((row) => <tr key={row.outcome}><th scope="row">{row.outcome}</th><td>{percent(row.meanPredictedProbability)}</td><td>{percent(row.observedFrequency)}</td><td>{signed(row.predictionGap, points)}</td><td>{points(row.calibrationECE)}</td><td>{decimal(row.modelBrierComponent)}</td></tr>)}</tbody>
      </TablePanel>
      <ComponentTable id="components-title" title="Outcome error components" rows={outcomes} />
      <TablePanel id="bins-title" title="One-vs-rest calibration bins" detail="10-percentage-point bins · lower bound inclusive, upper exclusive; final bin includes 100% · empty bins omitted">
        <thead><tr><th scope="col">Outcome</th><th scope="col">Probability bin</th><th scope="col">Count</th><th scope="col">Mean prediction</th><th scope="col">Observed frequency</th></tr></thead>
        <tbody>{outcomes.flatMap((outcome) => outcome.calibrationBuckets.filter((bucket) => bucket.count > 0).map((bucket) => <tr key={`${outcome.outcome}-${bucket.lowerBound}`}>
          <th scope="row">{outcome.outcome}</th><td>[{(bucket.lowerBound * 100).toFixed(0)}%, {(bucket.upperBound * 100).toFixed(0)}%{bucket.upperBound === 1 ? "]" : ")"}</td><td>{bucket.count}</td><td>{percent(bucket.meanPredictedProbability)}</td><td>{percent(bucket.observedFrequency)}</td>
        </tr>))}</tbody>
      </TablePanel>

      <TablePanel id="robustness-title" title="Leave-one-season-out robustness" wide detail="Exclude one season and pool the other four · existing predictions only · checks whether one season disproportionately drives the conclusion">
        <thead><tr><th scope="col">Excluded season</th><th scope="col">Remaining matches</th><th scope="col">Model Brier</th><th scope="col">Base-rate Brier</th><th scope="col">Skill vs base</th><th scope="col">League-Poisson Brier</th><th scope="col">Skill vs Poisson</th></tr></thead>
        <tbody>{robustness.map(({ excludedSeason, summary: remaining }) => <tr key={excludedSeason}><th scope="row">{excludedSeason}</th><td>{remaining.evaluatedMatches}</td><td>{decimal(remaining.meanBrierScore)}</td><td>{decimal(remaining.leagueBaseRateBrier)}</td><td>{signed(remaining.brierSkillVsLeagueBaseRate, percent)}</td><td>{decimal(remaining.leaguePoissonBrier)}</td><td>{signed(remaining.brierSkillVsLeaguePoisson, percent)}</td></tr>)}</tbody>
      </TablePanel>

      {weakest ? <section aria-labelledby="weakest-title" className={styles.weakestIntro}>
        <div className={shared.sectionHeading}><div><p className={shared.eyebrow}>Weakest observed season</p><h2 id="weakest-title">{weakest.seasonId} · diagnostic breakdown</h2></div><span className={shared.sortLabel}>Lowest skill vs league base rate</span></div>
        <div className={evaluation.benchmarkNote}><p>This section diagnoses the weakest observed season. It does not tune the model to that season. Selection uses the lowest Brier skill versus league base rate; exact ties choose the first season ID in lexical order.</p></div>
        <div className={shared.summary}>
          <MetricCard label="Model Brier" value={decimal(weakest.summary.meanBrierScore)} detail={`${weakest.summary.evaluatedMatches} evaluated matches`} />
          <MetricCard label="League base rate" value={decimal(weakest.summary.leagueBaseRateBrier)} detail={`Skill vs base: ${signed(weakest.summary.brierSkillVsLeagueBaseRate, percent)}`} />
          <MetricCard label="League-average Poisson" value={decimal(weakest.summary.leaguePoissonBrier)} detail={`Skill vs Poisson: ${signed(weakest.summary.brierSkillVsLeaguePoisson, percent)}`} />
        </div>
        <ComponentTable id="weakest-components-title" title={`${weakest.seasonId} outcome error components`} rows={weakest.outcomes} />
        <HistoryTable id="weakest-history-title" title={`${weakest.seasonId} history-depth performance`} rows={weakest.historyDepth} />
      </section> : <p className={evaluation.emptyNotice}>No evaluated season is available for the weakest-season diagnostic.</p>}
      <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>MODEL RESEARCH</span><span>Same historical data. Frozen poisson-v1. V0.5.</span></footer>
    </main>
  </div>;
}
