import type { Metadata } from "next";
import { mockPlayedMatches } from "@/data/mock-played-matches";
import { runBacktest } from "@/lib/backtest/run-backtest";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import styles from "./backtest.module.css";

export const metadata: Metadata = {
  title: "Model Backtest | Bet Scanner",
  description: "A local, time-causal evaluation of poisson-v1 on fictional football results.",
};

function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(4);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function utcDate(kickoffAt: string): string {
  return new Date(kickoffAt).toISOString().slice(0, 10);
}

export default function BacktestPage() {
  const result = runBacktest(mockPlayedMatches);
  const { summary } = result;
  const populatedBuckets = summary.calibrationBuckets.filter((bucket) => bucket.count > 0);

  return (
    <div className={shared.shell}>
      <a href="#evaluation-results" className={shared.skipLink}>Skip to evaluation results</a>
      <ResearchHeader activePage="backtest" />
      <main className={shared.main}>
        <div className={shared.pageHeading}>
          <div>
            <p className={shared.eyebrow}>MODEL BACKTEST</p>
            <h1>Model evaluation<span className={shared.titleDot} aria-hidden="true">.</span></h1>
            <p className={shared.intro}>What could {result.modelVersion} predict before each fictional match?</p>
          </div>
          <span className={shared.datasetTag}><span aria-hidden="true" />{result.modelVersion} · Walk-forward</span>
        </div>

        <div className={shared.simulationNotice}>
          <span className={shared.noticeIcon} aria-hidden="true">i</span>
          <p>All teams, dates, and results are fictional. This evaluates prediction quality, not betting profitability. No historical market prices are included.</p>
        </div>

        <section className={shared.summary} aria-label="Historical sample">
          <div className={shared.summaryCard}><span className={shared.eyebrow}>Historical matches</span><p className={shared.summaryValue}>{summary.totalHistoricalMatches}</p><span className={shared.summaryDetail}>Eight fictional rounds · 12 teams</span></div>
          <div className={shared.summaryCard}><span className={shared.eyebrow}>Evaluated matches</span><p className={shared.summaryValue}>{summary.evaluatedMatches}</p><span className={shared.summaryDetail}>Predicted using strictly earlier results</span></div>
          <div className={shared.summaryCard}><span className={shared.eyebrow}>Skipped during warm-up</span><p className={shared.summaryValue}>{summary.skippedMatches}</p><span className={shared.summaryDetail}>Both teams need {result.minimumVenueMatches} home and {result.minimumVenueMatches} away appearances</span></div>
        </section>

        <section id="evaluation-results" aria-labelledby="quality-title">
          <div className={shared.sectionHeading}>
            <div><p className={shared.eyebrow}>Primary metric</p><h2 id="quality-title">Probability quality</h2></div>
            <span className={shared.sortLabel}>Lower Brier is better</span>
          </div>
          <div className={`${shared.summary} ${styles.metricGrid}`}>
            <div className={shared.summaryCard}><span className={shared.eyebrow}>Mean Brier score</span><p className={shared.summaryValue}>{decimal(summary.meanBrierScore)}</p><span className={shared.summaryDetail}>Three-class squared error · range 0–2</span></div>
            <div className={shared.summaryCard}><span className={shared.eyebrow}>Uniform benchmark</span><p className={shared.summaryValue}>{decimal(summary.uniformBenchmarkBrier)}</p><span className={shared.summaryDetail}>HOME / DRAW / AWAY each at ⅓</span></div>
            <div className={shared.summaryCard}><span className={shared.eyebrow}>Brier skill score</span><p className={shared.summaryValue}>{percent(summary.brierSkillScore)}</p><span className={shared.summaryDetail}>Positive skill means {result.modelVersion} beat the uniform baseline</span></div>
          </div>
          {summary.evaluatedMatches === 0 && <p className={styles.emptyNotice}>No matches have enough prior venue history. Evaluation metrics are unavailable.</p>}
          <div className={styles.supplementary}>
            <div><span className={shared.eyebrow}>Top-pick accuracy</span><strong>{percent(summary.topPickAccuracy)}</strong><span>{summary.topPickCorrectCount} correct of {summary.evaluatedMatches} evaluated · supplementary to Brier</span></div>
            <div><span className={shared.eyebrow}>Calibration ECE</span><strong>{summary.topPickCalibrationECE === null ? "—" : `${(summary.topPickCalibrationECE * 100).toFixed(2)} pp`}</strong><span>Top-pick confidence only · lower is better</span></div>
          </div>
        </section>

        <section className={shared.rankingPanel} aria-labelledby="predictions-title">
          <div className={shared.rankingHeading}>
            <h3 id="predictions-title">Evaluated matches<span>{summary.evaluatedMatches}</span></h3>
            <p>Chronological order · full precision used for scores · dates shown in UTC</p>
          </div>
          <div className={shared.tableScroll} role="region" aria-label="Evaluated match predictions" tabIndex={0}>
            <table className={`${shared.table} ${styles.predictionTable}`}>
              <caption className={shared.srOnly}>Walk-forward predictions from earlier matches only, compared with actual final scores. Lower Brier score is better.</caption>
              <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Fixture</th><th scope="col">HOME</th><th scope="col">DRAW</th><th scope="col">AWAY</th><th scope="col">Actual result</th><th scope="col">Top pick</th><th scope="col">Brier</th><th scope="col">Prior matches</th></tr></thead>
              <tbody>
                {result.predictions.map((record) => (
                  <tr key={record.id}>
                    <td><time dateTime={record.kickoffAt}>{utcDate(record.kickoffAt)}</time></td>
                    <th scope="row" className={shared.eventCell}><span>{record.homeTeam} vs {record.awayTeam}</span><span className={shared.tableSelection}>{record.id}</span></th>
                    <td>{percent(record.prediction.homeProbability)}</td><td>{percent(record.prediction.drawProbability)}</td><td>{percent(record.prediction.awayProbability)}</td>
                    <td>{record.actualOutcome}<span className={styles.cellDetail}>{record.homeGoals}–{record.awayGoals}</span></td>
                    <td>{record.topSelection}<span className={styles.cellDetail}>{record.topSelectionCorrect ? "Correct" : "Miss"}</span></td>
                    <td className={styles.brierCell}>{decimal(record.brierScore)}</td><td>{record.trainingMatchCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={shared.rankingPanel} aria-labelledby="calibration-title">
          <div className={shared.rankingHeading}>
            <h3 id="calibration-title">Top-pick confidence calibration</h3>
            <p>10-percentage-point bins · not full multiclass calibration</p>
          </div>
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
          <p className={styles.tableNote}>Lower bin edges are inclusive; upper edges are exclusive, except 100% belongs in the final bin. Empty bins are omitted. ECE is the count-weighted absolute gap between mean confidence and observed accuracy.</p>
        </section>

        <details className={styles.skippedDetails}>
          <summary>{summary.skippedMatches} warm-up skips · insufficient home/away history</summary>
          <div className={shared.tableScroll} role="region" aria-label="Skipped historical matches" tabIndex={0}>
            <table className={`${shared.table} ${styles.calibrationTable}`}>
              <caption className={shared.srOnly}>Skipped matches are recorded explicitly with INSUFFICIENT_HISTORY.</caption>
              <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Fixture</th><th scope="col">Prior matches</th><th scope="col">Reason</th></tr></thead>
              <tbody>{result.skippedMatches.map((record) => (
                <tr key={record.id}><td><time dateTime={record.kickoffAt}>{utcDate(record.kickoffAt)}</time></td><th scope="row" className={shared.eventCell}><span>{record.homeTeam} vs {record.awayTeam}</span></th><td>{record.trainingMatchCount}</td><td>Insufficient history</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>

        <section className={shared.methodology} aria-labelledby="protocol-title">
          <div className={shared.methodHeading}><h2 id="protocol-title">Evaluation protocol</h2><p>Frozen model. Strictly prior information.</p></div>
          <div className={shared.methodGrid}>
            <div><span className={shared.methodNumber}>01 / WARM-UP</span><h3>Both venues, both teams</h3><p>Each team needs at least {result.minimumVenueMatches} home and {result.minimumVenueMatches} away matches before kickoff. Missing history is skipped, with no smoothing or invented samples.</p></div>
            <div><span className={shared.methodNumber}>02 / CAUSALITY</span><h3>One timestamp at a time</h3><p>Only earlier kickoffs contribute to profiles and league averages. Every simultaneous fixture is predicted before that group’s results enter history.</p></div>
            <div><span className={shared.methodNumber}>03 / METRICS</span><h3>Probabilities before picks</h3><p>Brier sums three squared errors without dividing by 3. Skill is 1 − model mean / uniform mean. Exact top-pick ties favour HOME, then DRAW, then AWAY.</p></div>
          </div>
        </section>
        <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>MODEL RESEARCH</span><span>Fictional history. No historical prices. V0.3.</span></footer>
      </main>
    </div>
  );
}
