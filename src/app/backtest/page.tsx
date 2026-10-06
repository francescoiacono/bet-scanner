import type { Metadata } from "next";
import { eplProvenance, eplSeasons } from "@/data/epl-seasons";
import { runMultiSeasonBacktest } from "@/lib/backtest/run-multi-season-backtest";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import styles from "./backtest.module.css";

export const metadata: Metadata = {
  title: "Premier League Backtest | Bet Scanner",
  description: "Season-isolated, date-causal evaluation of frozen poisson-v1 on completed Premier League results, 2021-22 through 2025-26.",
};

function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(4);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function skill(value: number | null): string {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${percent(value)}`;
}

function ece(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)} pp`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={shared.summaryCard}><span className={shared.eyebrow}>{label}</span><p className={shared.summaryValue}>{value}</p><span className={shared.summaryDetail}>{detail}</span></div>;
}

export default function BacktestPage() {
  const result = runMultiSeasonBacktest(eplSeasons);
  const { summary } = result;
  const populatedBuckets = summary.calibrationBuckets.filter((bucket) => bucket.count > 0);
  const recentPredictions = result.predictions.slice(-80).reverse();
  const recentSkips = result.skippedMatches.slice(-20).reverse();
  const sourceUrl = `${eplProvenance.repository}/tree/${eplProvenance.commit}`;

  return (
    <div className={shared.shell}>
      <a href="#evaluation-results" className={shared.skipLink}>Skip to evaluation results</a>
      <ResearchHeader activePage="backtest" />
      <main className={shared.main}>
        <div className={shared.pageHeading}>
          <div>
            <p className={shared.eyebrow}>MODEL BACKTEST</p>
            <h1>Premier League evaluation<span className={shared.titleDot} aria-hidden="true">.</span></h1>
            <p className={shared.intro}>REAL PREMIER LEAGUE RESULTS · 2021-22 → 2025-26</p>
          </div>
          <span className={shared.datasetTag}><span aria-hidden="true" />{result.modelVersion} · Walk-forward</span>
        </div>

        <div className={shared.simulationNotice}>
          <span className={shared.noticeIcon} aria-hidden="true">i</span>
          <p>Local evaluation of completed Premier League results from OpenFootball. No historical market prices are included; these metrics do not evaluate betting profitability. The market scanner remains fictional.</p>
        </div>

        <section className={shared.summary} aria-label="Historical sample">
          <MetricCard label="Total matches" value={String(summary.totalHistoricalMatches)} detail="Five completed seasons · 380 matches each" />
          <MetricCard label="Evaluated matches" value={String(summary.evaluatedMatches)} detail="Predicted from strictly earlier dates in the same season" />
          <MetricCard label="Warm-up skips" value={String(summary.skippedMatches)} detail={`Both teams need ${result.minimumVenueMatches} prior home and ${result.minimumVenueMatches} prior away appearances`} />
        </section>

        <section id="evaluation-results" aria-labelledby="quality-title">
          <div className={shared.sectionHeading}>
            <div><p className={shared.eyebrow}>Primary metric / stronger benchmark</p><h2 id="quality-title">Probability quality</h2></div>
            <span className={shared.sortLabel}>Lower Brier is better</span>
          </div>
          <div className={`${shared.summary} ${styles.metricGrid}`}>
            <MetricCard label="Model Brier" value={decimal(summary.meanBrierScore)} detail="Three-class squared error · no division by 3 · range 0–2" />
            <MetricCard label="League base-rate Brier" value={decimal(summary.leagueBaseRateBrier)} detail="Prior HOME / DRAW / AWAY frequencies within each season" />
            <MetricCard label="Skill vs league base rate" value={skill(summary.brierSkillVsLeagueBaseRate)} detail="1 − model mean / league-base-rate mean" />
          </div>
          {summary.evaluatedMatches === 0 && <p className={styles.emptyNotice}>No matches have enough prior venue history. Evaluation metrics are unavailable.</p>}
          <div className={styles.supplementary}>
            <div><span className={shared.eyebrow}>Uniform Brier</span><strong>{decimal(summary.uniformBenchmarkBrier)}</strong><span>HOME / DRAW / AWAY each at ⅓ · sanity baseline</span></div>
            <div><span className={shared.eyebrow}>Skill vs uniform</span><strong>{skill(summary.brierSkillScore)}</strong><span>1 − model mean / uniform mean</span></div>
            <div><span className={shared.eyebrow}>Top-pick accuracy</span><strong>{percent(summary.topPickAccuracy)}</strong><span>{summary.topPickCorrectCount} correct of {summary.evaluatedMatches} evaluated · supplementary to Brier</span></div>
            <div><span className={shared.eyebrow}>Calibration ECE</span><strong>{ece(summary.topPickCalibrationECE)}</strong><span>Top-pick confidence only · lower is better</span></div>
          </div>
          <div className={styles.benchmarkNote}>
            <p>Beating the uniform benchmark is a weak test. The league-base-rate benchmark is stronger because Premier League HOME / DRAW / AWAY outcomes are not naturally equally likely.</p>
            <p>Positive skill versus league base rate means {result.modelVersion} improved probability forecasts relative to simply using prior league outcome frequencies. This is not proof of a betting edge.</p>
          </div>
        </section>

        <section className={shared.rankingPanel} aria-labelledby="seasons-title">
          <div className={shared.rankingHeading}><h3 id="seasons-title">Season-by-season results</h3><p>History resets each season · overall metrics use all evaluated matches directly</p></div>
          <div className={shared.tableScroll} role="region" aria-label="Per-season evaluation metrics" tabIndex={0}>
            <table className={`${shared.table} ${styles.seasonTable}`}>
              <caption className={shared.srOnly}>Independent season evaluations. Brier is lower-is-better; positive skill beats the named benchmark. ECE is top-pick confidence calibration in percentage points.</caption>
              <thead><tr><th scope="col">Season</th><th scope="col">Total</th><th scope="col">Evaluated</th><th scope="col">Skipped</th><th scope="col">Model Brier</th><th scope="col">Base-rate Brier</th><th scope="col">Skill vs base</th><th scope="col">Uniform Brier</th><th scope="col">Skill vs uniform</th><th scope="col">Accuracy</th><th scope="col">ECE</th></tr></thead>
              <tbody>{result.seasonSummaries.map(({ seasonId, summary: season }) => (
                <tr key={seasonId}><th scope="row">{seasonId}</th><td>{season.totalHistoricalMatches}</td><td>{season.evaluatedMatches}</td><td>{season.skippedMatches}</td><td className={styles.brierCell}>{decimal(season.meanBrierScore)}</td><td>{decimal(season.leagueBaseRateBrier)}</td><td>{skill(season.brierSkillVsLeagueBaseRate)}</td><td>{decimal(season.uniformBenchmarkBrier)}</td><td>{skill(season.brierSkillScore)}</td><td>{percent(season.topPickAccuracy)}</td><td>{ece(season.topPickCalibrationECE)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className={shared.rankingPanel} aria-labelledby="predictions-title">
          <div className={shared.rankingHeading}>
            <h3 id="predictions-title">Recent evaluated matches<span>{recentPredictions.length}</span></h3>
            <p>Showing the most recent {recentPredictions.length} of {summary.evaluatedMatches} · newest dates first · model / base-rate probabilities</p>
          </div>
          <div className={shared.tableScroll} role="region" aria-label="Recent evaluated match predictions" tabIndex={0}>
            <table className={`${shared.table} ${styles.predictionTable}`}>
              <caption className={shared.srOnly}>Model probabilities with league-base-rate probabilities beneath them. Both forecasts use the same strictly earlier dates within the season. Dates are source calendar dates, not actual kickoff times.</caption>
              <thead><tr><th scope="col">Source date</th><th scope="col">Fixture / season</th><th scope="col">HOME</th><th scope="col">DRAW</th><th scope="col">AWAY</th><th scope="col">Actual result</th><th scope="col">Top pick</th><th scope="col">Model Brier</th><th scope="col">Base Brier</th><th scope="col">Prior matches</th></tr></thead>
              <tbody>{recentPredictions.map((record) => (
                <tr key={record.id}>
                  <td><time dateTime={record.kickoffAt.slice(0, 10)}>{record.kickoffAt.slice(0, 10)}</time></td>
                  <th scope="row" className={shared.eventCell}><span>{record.homeTeam} vs {record.awayTeam}</span><span className={shared.tableSelection}>{record.seasonId}</span></th>
                  <td>{percent(record.prediction.homeProbability)}<span className={styles.cellDetail}>Base {percent(record.leagueBaseRateProbabilities.homeProbability)}</span></td>
                  <td>{percent(record.prediction.drawProbability)}<span className={styles.cellDetail}>Base {percent(record.leagueBaseRateProbabilities.drawProbability)}</span></td>
                  <td>{percent(record.prediction.awayProbability)}<span className={styles.cellDetail}>Base {percent(record.leagueBaseRateProbabilities.awayProbability)}</span></td>
                  <td>{record.actualOutcome}<span className={styles.cellDetail}>{record.homeGoals}–{record.awayGoals}</span></td>
                  <td>{record.topSelection}<span className={styles.cellDetail}>{record.topSelectionCorrect ? "Correct" : "Miss"}</span></td>
                  <td className={styles.brierCell}>{decimal(record.brierScore)}</td><td>{decimal(record.leagueBaseRateBrierScore)}</td><td>{record.trainingMatchCount}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className={shared.rankingPanel} aria-labelledby="calibration-title">
          <div className={shared.rankingHeading}><h3 id="calibration-title">Top-pick confidence calibration</h3><p>All evaluated matches · 10-percentage-point bins · not full multiclass calibration</p></div>
          {populatedBuckets.length > 0 ? (
            <div className={shared.tableScroll} role="region" aria-label="Top-pick calibration buckets" tabIndex={0}>
              <table className={`${shared.table} ${styles.calibrationTable}`}>
                <caption className={shared.srOnly}>Non-empty top-pick confidence bins, with average model probability and observed top-pick accuracy.</caption>
                <thead><tr><th scope="col">Confidence bin</th><th scope="col">Matches</th><th scope="col">Mean predicted confidence</th><th scope="col">Observed accuracy</th></tr></thead>
                <tbody>{populatedBuckets.map((bucket) => (
                  <tr key={bucket.lowerBound}><th scope="row">{(bucket.lowerBound * 100).toFixed(0)}–{(bucket.upperBound * 100).toFixed(0)}%</th><td>{bucket.count}</td><td>{percent(bucket.meanConfidence)}</td><td>{percent(bucket.observedAccuracy)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className={styles.emptyNotice}>No evaluated matches are available for calibration.</p>}
          <p className={styles.tableNote}>Lower bin edges are inclusive; upper edges are exclusive, except 100% belongs in the final bin. Empty bins are omitted. Overall ECE pools observations into these bins before taking count-weighted absolute gaps; it is not an average of season ECEs.</p>
        </section>

        <details className={styles.skippedDetails}>
          <summary>{summary.skippedMatches} warm-up skips · most recent {recentSkips.length} shown below</summary>
          <p className={styles.tableNote}>All skips remain in the backtest result with reason INSUFFICIENT_HISTORY. Both teams must meet the venue minimum within their current season.</p>
          <div className={shared.tableScroll} role="region" aria-label="Recent skipped historical matches" tabIndex={0}>
            <table className={`${shared.table} ${styles.calibrationTable}`}>
              <caption className={shared.srOnly}>Recent skipped matches with insufficient venue history, newest dates first.</caption>
              <thead><tr><th scope="col">Source date</th><th scope="col">Fixture / season</th><th scope="col">Prior matches</th><th scope="col">Reason</th></tr></thead>
              <tbody>{recentSkips.map((record) => (
                <tr key={record.id}><td>{record.kickoffAt.slice(0, 10)}</td><th scope="row" className={shared.eventCell}><span>{record.homeTeam} vs {record.awayTeam}</span><span className={shared.tableSelection}>{record.seasonId}</span></th><td>{record.trainingMatchCount}</td><td>Insufficient history</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>

        <section className={shared.methodology} aria-labelledby="protocol-title">
          <div className={shared.methodHeading}><h2 id="protocol-title">Evaluation protocol</h2><p>Frozen model. Season-isolated history.</p></div>
          <div className={shared.methodGrid}>
            <div><span className={shared.methodNumber}>01 / WARM-UP</span><h3>Every season starts empty</h3><p>Both teams need {result.minimumVenueMatches} home and {result.minimumVenueMatches} away appearances on earlier dates. Established and promoted clubs follow the same rule. No carryover, priors, or smoothing.</p></div>
            <div><span className={shared.methodNumber}>02 / CAUSALITY</span><h3>One calendar date at a time</h3><p>All matches on a source calendar date share YYYY-MM-DDT12:00:00Z as an ordering key. This is not the historical kickoff time. Same-date results cannot affect either model or benchmark forecasts.</p></div>
            <div><span className={shared.methodNumber}>03 / PROVENANCE</span><h3>Local, reproducible results</h3><p>Five complete seasons from <a href={sourceUrl}>OpenFootball / england</a>, snapshot {eplProvenance.commit.slice(0, 8)}, CC0. Every season passes 380-match, 20-team, and 19-home / 19-away checks. No runtime data acquisition.</p></div>
          </div>
        </section>
        <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>MODEL RESEARCH</span><span>Real results. No historical prices. V0.4.</span></footer>
      </main>
    </div>
  );
}
