"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_MINIMUM_EDGE, rankBets } from "@/lib/betting/rank-bets";
import type { AnalysedBet } from "@/lib/betting/types";
import styles from "./scanner-dashboard.module.css";
import ResearchHeader from "./research-header";

function percentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function signedPercentage(value: number): string {
  return `${value > 0 ? "+" : ""}${percentage(value)}`;
}

function edgeLabel(value: number): string {
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`;
}

function selectionLabel(bet: AnalysedBet): string {
  if (bet.selection === "HOME") return `${bet.homeTeam} to win`;
  if (bet.selection === "AWAY") return `${bet.awayTeam} to win`;
  return "Draw";
}

function BestCandidate({ bet }: { bet: AnalysedBet }) {
  return (
    <article className={styles.bestCard} aria-labelledby="best-candidate-title">
      <div className={styles.bestContent}>
        <div className={styles.bestHeading}>
          <span className={styles.rankBadge}>01</span>
          <span className={styles.eyebrow}>Highest expected ROI</span>
          <span className={styles.marketTag}>Match winner</span>
        </div>
        <h2 id="best-candidate-title">{bet.eventName}</h2>
        <p className={styles.selection}>{selectionLabel(bet)}</p>
        <dl className={styles.bestMetrics}>
          <div><dt>Decimal odds</dt><dd>{bet.decimalOdds.toFixed(2)}</dd></div>
          <div><dt>Market implied</dt><dd>{percentage(bet.impliedProbability)}</dd></div>
          <div><dt>Model probability</dt><dd>{percentage(bet.modelProbability)}</dd></div>
          <div><dt>Probability edge</dt><dd className={styles.positive}>{edgeLabel(bet.edge)}</dd></div>
        </dl>
        <dl className={styles.modelMetrics}>
          <div>
            <dt>Expected home goals</dt>
            <dd>{bet.prediction.expectedHomeGoals.toFixed(2)}</dd>
            <span>{bet.homeTeam}</span>
          </div>
          <div>
            <dt>Expected away goals</dt>
            <dd>{bet.prediction.expectedAwayGoals.toFixed(2)}</dd>
            <span>{bet.awayTeam}</span>
          </div>
          <div>
            <dt>Model version</dt>
            <dd>{bet.prediction.modelVersion}</dd>
            <span>Independent Poisson</span>
          </div>
        </dl>
      </div>
      <div className={styles.roiPanel}>
        <span className={styles.eyebrow}>Expected ROI</span>
        <p className={styles.heroROI}>{signedPercentage(bet.expectedROI)}</p>
        <p className={styles.roiFormula}>
          {bet.modelProbability.toFixed(6)} × {bet.decimalOdds.toFixed(2)} − 1
          <span>≈ {bet.expectedROI.toFixed(4)}</span>
        </p>
        <div className={styles.probabilityComparison}>
          <div className={styles.barLabel}><span>Market implied</span><span>{percentage(bet.impliedProbability)}</span></div>
          <div className={styles.barTrack} aria-hidden="true"><div className={styles.marketBar} style={{ width: percentage(bet.impliedProbability) }} /></div>
          <div className={styles.barLabel}><span>Model estimate</span><span>{percentage(bet.modelProbability)}</span></div>
          <div className={styles.barTrack} aria-hidden="true"><div className={styles.modelBar} style={{ width: percentage(bet.modelProbability) }} /></div>
        </div>
      </div>
    </article>
  );
}

export default function ScannerDashboard({
  analysedBets,
}: {
  analysedBets: readonly AnalysedBet[];
}) {
  const [minimumEdge, setMinimumEdge] = useState(DEFAULT_MINIMUM_EDGE);
  const [thresholdInput, setThresholdInput] = useState("2");
  const [inputError, setInputError] = useState("");
  const candidates = rankBets(analysedBets, minimumEdge);
  const [bestCandidate, ...remainingCandidates] = candidates;

  function applyThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const points = Number(thresholdInput);
    if (thresholdInput.trim() === "" || !Number.isFinite(points) || points < 0 || points > 100) {
      setInputError("Enter a minimum edge between 0 and 100 percentage points.");
      return;
    }
    setMinimumEdge(points / 100);
    setInputError("");
  }

  function resetThreshold() {
    setMinimumEdge(DEFAULT_MINIMUM_EDGE);
    setThresholdInput("2");
    setInputError("");
  }

  return (
    <div className={styles.shell}>
      <a href="#scan-results" className={styles.skipLink}>Skip to results</a>
      <ResearchHeader activePage="scanner" />

      <main className={styles.main}>
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>Football / Market analysis</p>
            <h1>Bet Scanner<span className={styles.titleDot} aria-hidden="true">.</span></h1>
            <p className={styles.intro}>Explore the gap between market price and model probability.</p>
          </div>
          <span className={styles.datasetTag}><span aria-hidden="true" />Fictional dataset · {analysedBets.length} selections</span>
        </div>

        <div className={styles.simulationNotice}>
          <span className={styles.noticeIcon} aria-hidden="true">i</span>
          <p>Research only. Teams, match history, fixtures, and prices are fictional. Model estimates use a simple Poisson baseline. These results are not real betting recommendations.</p>
        </div>

        <section className={styles.summary} aria-label="Scan summary" aria-live="polite" aria-atomic="true">
          <div className={styles.summaryCard}><span className={styles.eyebrow}>Market selections scanned</span><p className={styles.summaryValue}>{analysedBets.length.toString().padStart(2, "0")}</p><span className={styles.summaryDetail}>Football · Match winner</span></div>
          <div className={styles.summaryCard}><span className={styles.eyebrow}>Passed the filter</span><p className={styles.summaryValue}>{candidates.length.toString().padStart(2, "0")}<span className={styles.summaryDenominator}> / {analysedBets.length}</span></p><span className={styles.summaryDetail}>Edge ≥ {(minimumEdge * 100).toFixed(1)} percentage points</span></div>
          <div className={styles.summaryCard}><span className={styles.eyebrow}>Best expected ROI</span><p className={`${styles.summaryValue} ${bestCandidate ? styles.positive : ""}`}>{bestCandidate ? signedPercentage(bestCandidate.expectedROI) : "—"}</p><span className={styles.summaryDetail}>{bestCandidate ? selectionLabel(bestCandidate) : "No qualifying candidates"}</span></div>
        </section>

        <section className={styles.filterPanel} aria-labelledby="filter-title">
          <div className={styles.filterDescription}><h2 id="filter-title">Set your value threshold</h2><p>A candidate passes when its probability edge meets or exceeds this minimum.</p></div>
          <form onSubmit={applyThreshold} className={styles.filterForm}>
            <div className={styles.inputGroup}>
              <label htmlFor="minimum-edge">Minimum edge</label>
              <div className={styles.inputWrap}>
                <input id="minimum-edge" name="minimum-edge" type="number" min="0" max="100" step="0.1" required value={thresholdInput} onChange={(event) => setThresholdInput(event.target.value)} aria-describedby="edge-unit threshold-error" aria-invalid={Boolean(inputError)} />
                <span id="edge-unit" title="Percentage points">pp</span>
              </div>
            </div>
            <button type="submit" className={styles.applyButton}>Apply filter<span aria-hidden="true">↗</span></button>
            <button type="button" className={styles.resetButton} onClick={resetThreshold}>Reset</button>
            <p id="threshold-error" className={styles.inputError} role="alert">{inputError}</p>
          </form>
        </section>

        <section id="scan-results" className={styles.results} aria-labelledby="results-title">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Scan results</p><h2 id="results-title">{bestCandidate ? "Leading candidate" : "No qualifying candidates"}</h2></div><span className={styles.sortLabel}>Ranked by expected ROI ↓</span></div>

          {bestCandidate ? <BestCandidate bet={bestCandidate} /> : (
            <div className={styles.emptyState} role="status"><span className={styles.emptyIcon} aria-hidden="true">—</span><h3>NO BET — no opportunities meet the current threshold</h3><p>{analysedBets.length} fictional market selections scanned at a {(minimumEdge * 100).toFixed(1)} pp minimum edge. Adjust the threshold to explore the dataset.</p></div>
          )}

          {remainingCandidates.length > 0 && (
            <div className={styles.rankingPanel}>
              <div className={styles.rankingHeading}><h3>Remaining candidates<span>{remainingCandidates.length}</span></h3><p>Highest expected ROI first · equal ROI ordered by opportunity ID</p></div>
              <div className={styles.tableScroll} role="region" aria-label="Remaining ranked candidates" tabIndex={0}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Remaining qualifying candidates, ranked by expected ROI from highest to lowest. Edge is measured in percentage points.</caption>
                  <thead><tr><th scope="col">Rank</th><th scope="col">Event / selection</th><th scope="col">Decimal odds</th><th scope="col">Market implied</th><th scope="col">Model probability</th><th scope="col">Edge <span>(pp)</span></th><th scope="col" className={styles.roiColumn}>Expected ROI ↓</th></tr></thead>
                  <tbody>{remainingCandidates.map((bet, index) => (
                    <tr key={bet.id}>
                      <td className={styles.tableRank}>{(index + 2).toString().padStart(2, "0")}</td>
                      <th scope="row" className={styles.eventCell}><span>{bet.eventName}</span><span className={styles.tableSelection}>{selectionLabel(bet)}<span className={styles.selectionSeparator}> · </span>Match winner</span></th>
                      <td>{bet.decimalOdds.toFixed(2)}</td><td>{percentage(bet.impliedProbability)}</td><td>{percentage(bet.modelProbability)}</td><td className={styles.positive}>{edgeLabel(bet.edge)}</td><td className={`${styles.roiColumn} ${styles.tableROI}`}>{signedPercentage(bet.expectedROI)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className={styles.methodology} aria-labelledby="method-title">
          <div className={styles.methodHeading}><h2 id="method-title">How to read the scan</h2><p>Poisson probabilities. Transparent value ranking.</p></div>
          <p className={styles.modelNote}>Historical home/away scoring and conceding rates determine expected goals. Independent Poisson scores from 0–10 goals produce normalized HOME / DRAW / AWAY probabilities, separately from market prices.</p>
          <div className={styles.methodGrid}>
            <div><span className={styles.methodNumber}>01 / PRICE</span><h3>Market implied probability</h3><code>1 / decimal odds</code><p>The probability implied by the quoted price, without a margin adjustment.</p></div>
            <div><span className={styles.methodNumber}>02 / FILTER</span><h3>Probability edge</h3><code>model probability − market implied</code><p>The model’s probability advantage. Displayed in percentage points (pp).</p></div>
            <div><span className={styles.methodNumber}>03 / RANK</span><h3>Expected ROI</h3><code>model probability × odds − 1</code><p>Estimated percentage return under the fictional model. Higher values rank first; returns are not guaranteed.</p></div>
          </div>
        </section>

        <footer className={styles.footer}><span>BET SCANNER<span className={styles.footerSeparator}> / </span>LOCAL RESEARCH</span><span>Fictional inputs. Deterministic analysis. V0.5.</span></footer>
      </main>
    </div>
  );
}
