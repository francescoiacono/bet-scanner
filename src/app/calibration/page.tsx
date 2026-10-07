import type { Metadata } from "next";
import type { ReactNode } from "react";
import { calibrationSummary, foldTemperatures } from "@/data/calibration-summary";
import ResearchHeader from "../research-header";
import shared from "../scanner-dashboard.module.css";
import models from "../models/models.module.css";
import evaluation from "../backtest/backtest.module.css";
import styles from "./calibration.module.css";

export const metadata: Metadata = { title: "Probability Calibration | Bet Scanner", description: "Older-trained, rolling-origin calibration of frozen Dixon–Coles forecasts. Historical recent validation; Bet365 probabilities are a benchmark only." };
const decimal = (v: number | null, digits = 5) => v === null ? "—" : v.toFixed(digits);
const percent = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(2)}%`;
const pp = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(2)} pp`;
const signed = (v: number | null) => v === null ? "—" : `${v >= 0 ? "+" : ""}${decimal(v)}`;
const colour = (v: number | null) => v !== null && v < 0 ? styles.negative : v !== null && v > 0 ? styles.positive : "";
const familyName = (family: string) => family === "identity" ? "IDENTITY" : family === "temperature-v1" ? "TEMPERATURE" : "MULTINOMIAL_LOGIT";
const forecastNames = { raw: "Raw Dixon–Coles", calibrated: "Selected calibrated", market: "Bet365 fair market" } as const;

function TablePanel({ id, title, detail, children, wide = false }: { id: string; title: string; detail: string; children: ReactNode; wide?: boolean }) {
  return <section className={shared.rankingPanel} aria-labelledby={id}>
    <div className={shared.rankingHeading}><h3 id={id} className={models.panelTitle}>{title}</h3><p>{detail}</p></div>
    <div className={shared.tableScroll} role="region" aria-label={title} tabIndex={0}><table className={`${shared.table} ${models.table} ${wide ? styles.wideTable : ""}`}><caption className={shared.srOnly}>{title}. {detail}</caption>{children}</table></div>
  </section>;
}

export default function CalibrationPage() {
  const { development: d, finalFit: fit, finalParameters: parameters, validation: v } = calibrationSummary;
  const forecasts = Object.entries(v.forecasts) as [keyof typeof forecastNames, typeof v.forecasts.raw][];
  return <div className={shared.shell}>
    <a href="#calibration-results" className={shared.skipLink}>Skip to calibration results</a>
    <ResearchHeader activePage="calibration" />
    <main className={shared.main}>
      <div className={shared.pageHeading}><div><p className={shared.eyebrow}>PROBABILITY CALIBRATION</p><h1>Can Dixon–Coles close the market gap<span className={shared.titleDot}>?</span></h1><p className={shared.intro}>Frozen forecasts · older-trained calibration · recent historical validation</p></div><span className={shared.datasetTag}><span aria-hidden="true" />RESEARCH ONLY</span></div>
      <div className={shared.simulationNotice}><span className={shared.noticeIcon} aria-hidden="true">i</span><p>No betting strategy. No current recommendations. No market prices used in calibration fitting. Both cohorts’ outcomes were already inspected in earlier research; this is historical calibration validation, not a pristine future holdout.</p></div>
      <section id="calibration-results" className={models.headlines} aria-label="Separate development and validation stages">
        <article className={models.headline}><span className={shared.eyebrow}>CALIBRATION DEVELOPMENT / 2014–19</span><h2>Older rolling-origin evidence</h2><p>1,351 out-of-sample fold predictions. The first season, 2014-15, is training-only.</p>
          {d.candidates.map((c) => <div key={c.family}><span className={shared.eyebrow}>{familyName(c.family)}</span><dl><div><dt>Rolling Brier</dt><dd>{decimal(c.brier)}</dd></div><div><dt>Advantage vs identity</dt><dd className={colour(c.advantage)}>{signed(c.advantage)}</dd></div></dl><p className={models.interval}>95% interval: {signed(c.bootstrap.interval.lowerBound)} to {signed(c.bootstrap.interval.upperBound)}</p></div>)}
          <p>Eligible only when the advantage interval’s lower bound is strictly positive. Larger observed advantage wins; ties within 1e-12 prefer temperature. Recent results and markets cannot select a family.</p>
        </article>
        <article className={models.headline}><span className={shared.eyebrow}>HISTORICAL CALIBRATION VALIDATION / 2021–26</span><h2>One fixed map · 1,688 matches</h2><dl><div><dt>Raw Dixon–Coles Brier</dt><dd>{decimal(v.forecasts.raw.brier)}</dd></div><div><dt>Selected calibrated Brier</dt><dd>{decimal(v.forecasts.calibrated.brier)}</dd></div><div><dt>Fair-market Brier</dt><dd>{decimal(v.forecasts.market.brier)}</dd></div><div><dt>Market gap closed</dt><dd>{percent(v.gapClosedFraction)}</dd></div></dl>
          <span className={`${styles.neutralValue} ${colour(v.calibrationAdvantage)}`}>{signed(v.calibrationAdvantage)}</span><p>Raw − calibrated Brier · positive favours calibration</p><p className={models.interval}>95% interval: {signed(v.calibrationBootstrap.interval.lowerBound)} to {signed(v.calibrationBootstrap.interval.upperBound)}</p>
          <span className={`${styles.neutralValue} ${colour(v.calibratedAdvantageVsMarket)}`}>{signed(v.calibratedAdvantageVsMarket)}</span><p>Market − calibrated Brier · positive means calibrated beats market</p><p className={models.interval}>95% interval: {signed(v.calibratedMarketBootstrap.interval.lowerBound)} to {signed(v.calibratedMarketBootstrap.interval.upperBound)}</p>
        </article>
      </section>
      <section className={styles.status} aria-labelledby="calibration-status"><span className={shared.eyebrow}>SELECTED FAMILY: {familyName(d.selectedFamily)}</span><h2 id="calibration-status">{v.status}</h2>
        <p>{d.selectedFamily === "identity" ? "Neither non-identity candidate has an older rolling-origin Brier-advantage interval entirely above zero. The predeclared rule retains identity; recent selected probabilities equal raw Dixon–Coles exactly." : "The family was selected from older rolling-origin evidence and fitted once on all older records before recent evaluation."}</p>
        <p>Identity gives IDENTITY_RETAINED. Otherwise a recent advantage lower bound strictly above zero supports improvement; an upper bound strictly below zero supports harm; all other intervals are inconclusive, including bounds equal to zero.</p>
        <p>{v.researchModelVersion ? `Research model label: ${v.researchModelVersion}. The underlying dixon-coles-v1 remains unchanged.` : "No dixon-coles-calibrated-v1 research model is promoted."} Brier gains and market-gap closure do not establish betting profitability.</p>
      </section>
      <div className={evaluation.benchmarkNote}><p>All paired intervals use 5,000 season-stratified, source-date-clustered resamples, seed 202609, with 95% percentile bounds. Candidate and identity scores share the same fixtures and outcomes. Same-date matches stay together; this resampling does not capture every form of serial dependence.</p><p>Brier is the primary selection score. Natural-log loss is the fitting objective and a secondary evaluation score. Accuracy, ECE, confidence, entropy and market disagreement are descriptive; none selects or fits the calibration family.</p></div>
      <TablePanel id="development-candidates" title="Fixed candidate development" detail="2015-16 through 2018-19 validation folds only; never score calibration on its own training records." wide>
        <thead><tr>{["Candidate", "Matches", "Brier", "Log loss", "Advantage", "95% interval", "Eligible"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{d.candidates.map((c) => <tr key={c.family}><th scope="row">{c.family}</th><td>{c.matches}</td><td>{decimal(c.brier)}</td><td>{decimal(c.logLoss)}</td><td className={colour(c.advantage)}>{signed(c.advantage)}</td><td>{signed(c.bootstrap.interval.lowerBound)} to {signed(c.bootstrap.interval.upperBound)}</td><td>{c.family === "identity" ? "Baseline" : c.eligible ? "Yes" : "No"}</td></tr>)}</tbody>
      </TablePanel>
      <TablePanel id="rolling-folds" title="Four rolling-origin folds" detail="Fresh prescribed initialization in each fit; no validation-season outcomes enter training." wide>
        <thead><tr>{["Training seasons", "Validate", "Train N", "Validate N", "Fitted T", "Temperature iterations / gradient", "Logit iterations / gradient", "Logit convergence"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{d.folds.map((f) => <tr key={f.fold}><th scope="row">{f.trainingSeasons.join(", ")}</th><td>{f.validationSeason}</td><td>{f.trainingRecords}</td><td>{f.validationRecords}</td><td>{decimal(foldTemperatures[f.fold - 1], 6)}</td><td>{f.temperature.iterations} / {f.temperature.meanGradientNorm?.toExponential(2)}</td><td>{f.logistic.iterations} / {f.logistic.meanGradientNorm?.toExponential(2)}</td><td>{f.logistic.convergenceCriterion}</td></tr>)}</tbody>
      </TablePanel>
      <section className={models.fitPanel} aria-labelledby="final-calibrator"><h3 id="final-calibrator">Final older-only calibration parameters</h3>
        <p>{fit.family === "identity" ? "Identity has no fitted parameters. No unselected candidate is fitted or evaluated on recent seasons." : "The selected family was fitted once using all 1,691 older records. These parameters remain fixed across all recent seasons."}</p>
        {parameters.temperature !== null && <p>T = {decimal(parameters.temperature, 10)}</p>}
        {parameters.coefficients && <dl className={styles.metrics}>{Object.entries(parameters.coefficients).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{decimal(value, 10)}</dd></div>)}</dl>}
        <dl className={styles.metrics}>{[["Older records", String(fit.trainingRecords)], ["Iterations / evaluations", `${fit.iterations} / ${fit.evaluations}`], ["Convergence criterion", fit.convergenceCriterion], ["Mean objective", decimal(fit.objective, 8)], ["Gradient norm", fit.meanGradientNorm === null ? "Not fitted" : fit.meanGradientNorm.toExponential(3)], ["Fold temperature range", `${decimal(d.foldTemperatureRange.minimum, 6)} to ${decimal(d.foldTemperatureRange.maximum, 6)}`]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
      </section>
      <TablePanel id="validation-scores" title="Recent forecast diagnostics" detail="Lower Brier, log loss and ECE are better. Higher entropy means softer probabilities; sharpness alone is not accuracy." wide>
        <thead><tr>{["Forecast", "Brier", "Log loss", "Top accuracy", "Top-confidence ECE", "Mean max probability", "Mean entropy (nats)"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{forecasts.map(([name, f]) => <tr key={name}><th scope="row">{forecastNames[name]}</th><td>{decimal(f.brier)}</td><td>{decimal(f.logLoss)}</td><td>{percent(f.topPickAccuracy)}</td><td>{percent(f.topConfidenceECE)}</td><td>{percent(f.meanMaximumProbability)}</td><td>{decimal(f.meanEntropy)}</td></tr>)}</tbody>
      </TablePanel>
      <TablePanel id="recent-seasons" title="Every recent validation season" detail="One older-trained map throughout; every season is shown regardless of performance." wide>
        <thead><tr>{["Season", "Matches", "Raw Brier", "Calibrated Brier", "Advantage", "Market Brier", "Raw log loss", "Calibrated log loss", "Market log loss"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{v.seasons.map((s) => <tr key={s.seasonId}><th scope="row">{s.seasonId}</th><td>{s.matches}</td><td>{decimal(s.rawBrier)}</td><td>{decimal(s.calibratedBrier)}</td><td className={colour(s.calibrationAdvantage)}>{signed(s.calibrationAdvantage)}</td><td>{decimal(s.marketBrier)}</td><td>{decimal(s.rawLogLoss)}</td><td>{decimal(s.calibratedLogLoss)}</td><td>{decimal(s.marketLogLoss)}</td></tr>)}</tbody>
      </TablePanel>
      <TablePanel id="classwise-ece" title="Outcome calibration errors" detail="Classwise ECE: weighted absolute mean-prediction versus outcome-frequency gaps in fixed ten bins.">
        <thead><tr><th scope="col">Outcome</th><th scope="col">Raw ECE</th><th scope="col">Calibrated ECE</th><th scope="col">Market ECE</th></tr></thead><tbody>{v.forecasts.raw.outcomes.map((o, i) => <tr key={o.outcome}><th scope="row">{o.outcome}</th><td>{percent(o.ece)}</td><td>{percent(v.forecasts.calibrated.outcomes[i].ece)}</td><td>{percent(v.forecasts.market.outcomes[i].ece)}</td></tr>)}</tbody>
      </TablePanel>
      <details className={styles.bins}><summary>Inspect fixed classwise and top-confidence calibration bins</summary>
        {forecasts.map(([name, f]) => <div key={name}>{f.outcomes.map((o) => <TablePanel key={o.outcome} id={`${name}-${o.outcome}-bins`} title={`${forecastNames[name]} · ${o.outcome}`} detail="[0,.1), …, [.9,1]; empty means and frequencies are unavailable."><thead><tr><th scope="col">Bin</th><th scope="col">Count</th><th scope="col">Mean probability</th><th scope="col">Outcome frequency</th></tr></thead><tbody>{o.bins.map((b) => <tr key={b.lowerBound}><th scope="row">{decimal(b.lowerBound, 1)}–{decimal(b.upperBound, 1)}</th><td>{b.count}</td><td>{percent(b.meanPredictedProbability)}</td><td>{percent(b.observedFrequency)}</td></tr>)}</tbody></TablePanel>)}
          <TablePanel id={`${name}-top-bins`} title={`${forecastNames[name]} · top-confidence bins`} detail="Top-pick confidence versus correctness; HOME/DRAW/AWAY resolves exact ties."><thead><tr><th scope="col">Bin</th><th scope="col">Count</th><th scope="col">Mean confidence</th><th scope="col">Accuracy</th></tr></thead><tbody>{f.topConfidenceBins.map((b) => <tr key={b.lowerBound}><th scope="row">{decimal(b.lowerBound, 1)}–{decimal(b.upperBound, 1)}</th><td>{b.count}</td><td>{percent(b.meanConfidence)}</td><td>{percent(b.observedAccuracy)}</td></tr>)}</tbody></TablePanel>
        </div>)}
      </details>
      <TablePanel id="raw-confidence" title="Fixed raw-confidence buckets" detail="Buckets use raw Dixon–Coles top confidence, never calibrated confidence or observed performance." wide>
        <thead><tr>{["Raw confidence", "Matches", "Mean raw confidence", "Raw accuracy", "Raw Brier", "Calibrated Brier", "Market Brier", "Calibrated confidence"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{v.confidenceBuckets.map((b) => <tr key={b.label}><th scope="row">{b.label}</th><td>{b.matches}</td><td>{percent(b.rawMeanTopConfidence)}</td><td>{percent(b.rawTopPickAccuracy)}</td><td>{decimal(b.rawBrier)}</td><td>{decimal(b.calibratedBrier)}</td><td>{decimal(b.marketBrier)}</td><td>{percent(b.calibratedMeanTopConfidence)}</td></tr>)}</tbody>
      </TablePanel>
      <TablePanel id="market-disagreement" title="Fixed market-disagreement buckets" detail="Maximum absolute class difference per match, averaged within buckets. Diagnostic only; not calibration inputs." wide>
        <thead><tr>{["Raw disagreement", "Matches", "Raw Brier", "Calibrated Brier", "Market Brier", "Raw mean disagreement", "Calibrated mean absolute disagreement"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{v.disagreementBuckets.map((b) => <tr key={b.label}><th scope="row">{b.label}</th><td>{b.matches}</td><td>{decimal(b.rawBrier)}</td><td>{decimal(b.calibratedBrier)}</td><td>{decimal(b.marketBrier)}</td><td>{pp(b.rawMeanDisagreement)}</td><td>{pp(b.calibratedMeanAbsoluteDisagreement)}</td></tr>)}</tbody>
      </TablePanel>
      <TablePanel id="market-residuals" title="Outcome residuals versus market" detail="Mean signed and absolute probability differences. Market agreement alone cannot establish forecast quality." wide>
        <thead><tr>{["Outcome", "Raw mean residual", "Calibrated mean residual", "Raw mean absolute difference", "Calibrated mean absolute difference"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>{v.residuals.map((r) => <tr key={r.outcome}><th scope="row">{r.outcome}</th><td>{pp(r.rawMeanResidual)}</td><td>{pp(r.calibratedMeanResidual)}</td><td>{pp(r.rawMeanAbsoluteDifference)}</td><td>{pp(r.calibratedMeanAbsoluteDifference)}</td></tr>)}</tbody>
      </TablePanel>
      <section className={shared.methodology} aria-labelledby="calibration-methods"><div className={shared.methodHeading}><h2 id="calibration-methods">Predeclared calibration protocol</h2><p>Probability research only.</p></div><div className={shared.methodGrid}>
        <div><span className={shared.methodNumber}>01 / TRANSFORMS</span><h3>One or six parameters</h3><p>Identity returns the raw triplet. Temperature changes confidence globally: <code className={styles.formula}>T = exp(rawT); q = softmax(log(p)/T)</code>Multinomial calibration uses AWAY as reference: <code className={styles.formula}>x = (1, log(pH/pA), log(pD/pA))</code><code className={styles.formula}>logits = (bH·x, bD·x, 0)</code>No team, season, date or market features.</p></div>
        <div><span className={shared.methodNumber}>02 / FITTING</span><h3>Model probability + observed result</h3><p>Numeric 1.2.6 BFGS minimises mean natural-log loss with analytic gradients. Maximum 2,000 iterations; step tolerance 1e-10; gradient tolerance 1e-8; relative objective tolerance 1e-10 for five stable iterations. Starts: rawT=0, or coefficients (0,1,0; 0,0,1). Stable softmax, strict positive probabilities, no clipping or fallback.</p></div>
        <div><span className={shared.methodNumber}>03 / OLDER THEN RECENT</span><h3>Separate selection and validation</h3><p>Four older rolling folds choose the family by paired Brier evidence. Fit the selected family once on all 1,691 older records, freeze it, then apply to 1,688 recent records. No per-season refitting or recent-outcome updates. Prior outcomes were already inspected; this is not a pristine future holdout.</p></div>
        <div><span className={shared.methodNumber}>04 / INDEPENDENT MARKET</span><h3>Benchmark after calibration</h3><p>Reuse V0.8 source hashes, explicit alignment, B365H/B365D/B365A non-closing source prices and proportional margin removal. Collection timing differs across eras. No C-suffixed or other bookmaker prices. Market probabilities cannot enter any fit, objective or family choice.</p></div>
        <div><span className={shared.methodNumber}>05 / DIFFERENT DIAGNOSTICS</span><h3>Scores, confidence and gap closure</h3><p>Brier sums three squared errors without division by three. Log loss = −log(p_actual). ECE uses fixed ten bins. Sharpness reports mean maximum probability and entropy −Σp log p. Gap closed = (raw Brier − calibrated Brier)/(raw Brier − market Brier), unavailable when the raw gap is non-positive.</p></div>
        <div><span className={shared.methodNumber}>06 / DATA BOUNDARY</span><h3>Compact aggregates only</h3><p>Raw probabilities come exclusively from the frozen V0.6 artifact. Per-fixture calibrated outcomes and market triplets remain gitignored. This page reads public aggregates; no fitting runs during rendering. There are no V0.9 bets, returns, staking or strategy variants.</p></div>
      </div></section>
      <footer className={shared.footer}><span>BET SCANNER<span className={shared.footerSeparator}> / </span>CALIBRATION RESEARCH</span><span>Fixed methods. No betting strategy. V0.9.</span></footer>
    </main>
  </div>;
}
