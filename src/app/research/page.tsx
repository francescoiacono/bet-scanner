import type { Metadata } from "next";
import research from "@/data/generated/research-index.json";
import SiteHeader from "../site-header";
import SiteFooter from "../site-footer";
import ui from "../ui.module.css";
import styles from "./research.module.css";

export const metadata: Metadata = { title: "Research Archive | Bet Scanner", description: "Frozen football forecasting, corner modelling, historical market value and calibration findings, preserved for transparency and reproducibility." };
const docs = "https://github.com/francescoiacono/bet-scanner/blob/main/docs/research.md";
const provenance = "https://github.com/francescoiacono/bet-scanner/tree/main/data";
const percentage = (n: number) => (n * 100).toFixed(2) + "%";
const negativePercentage = (n: number) => percentage(n).replace("-", "−");

function ReferenceLinks({ section, source }: { section: string; source: "results" | "private" }) {
  return <div className={styles.links}><a href={docs + "#" + section}>Method, definitions &amp; limitations ↗</a><a href={provenance + (source === "results" ? "/external/openfootball" : "/provenance")}>Data provenance ↗</a></div>;
}

export default function ResearchPage() {
  return <div className={ui.shell}><a href="#research-content" className={ui.skipLink}>Skip to research</a><SiteHeader activePage="research" />
    <main id="research-content" className={ui.container}>
      <div className={ui.pageHeading}><div><p className={ui.eyebrow}>TRANSPARENCY &amp; REPRODUCIBILITY</p><h1>Research archive</h1><p className={ui.intro}>What we tested, what the evidence supports, and where the models fell short. These frozen experiments do not power the live odds scanner.</p></div></div>
      <div className={ui.notice + " " + styles.overview}><strong>The historical market outperformed our Dixon–Coles forecast.</strong><p>Better forecasts than a simple Poisson baseline did not establish betting value. No corner or calibrated model was promoted, and the historical paper strategy lost money.</p></div>
      <div className={styles.contents} aria-label="Research sections"><a href="#early-poisson">Early Poisson</a><a href="#dixon-coles">Dixon–Coles</a><a href="#corners">Corners</a><a href="#historical-value">Historical value</a><a href="#calibration">Calibration</a></div>
      <div className={styles.sections}>
        <section id="early-poisson" className={ui.card} aria-labelledby="poisson-title">
          <p className={ui.eyebrow}>V0.1–V0.5 · EARLY FORECASTS &amp; BACKTESTS</p><h2 id="poisson-title">A causal baseline, with uncertain gains</h2>
          <p>We tested independent Poisson goal forecasts using only results available before each fixture, then compared them with league baselines and inspected calibration and uncertainty.</p>
          <p>Recent average Brier was <strong>{research.earlyPoisson.recentBrier.toFixed(8)}</strong>. Point estimates improved on causal league baselines, but paired uncertainty intervals crossed zero. This supported further research, rather than a claim of betting profitability.</p>
          <p className={styles.decision}><strong>Promotion:</strong> <code>poisson-v1</code> remains a frozen historical baseline. It is not used for live odds comparisons.</p>
          <p className={styles.limitation}><strong>Limits:</strong> one league, warm-up exclusions, no player or xG data, and no opponent adjustment. Source dates order the backtest; generated noon timestamps are not historical kickoff times.</p>
          <ReferenceLinks section="early-poisson" source="results" />
        </section>
        <section id="dixon-coles" className={ui.card} aria-labelledby="dc-title">
          <p className={ui.eyebrow}>V0.6 · MODEL COMPARISON</p><h2 id="dc-title">Dixon–Coles improved on independent Poisson</h2>
          <p>We compared jointly fitted team strengths and a low-score dependence correction with the frozen Poisson baseline. Dixon–Coles had lower Brier scores in both recent and older historical cohorts, with paired intervals supporting that comparison.</p>
          <dl className={styles.metrics}><div><dt>Recent Dixon–Coles Brier</dt><dd>{research.dixonColes.recentBrier}</dd></div><div><dt>Recent eligible fixtures</dt><dd>{research.dixonColes.recentMatches.toLocaleString("en-GB")}</dd></div></dl>
          <p className={styles.decision}><strong>Promotion:</strong> retained as <code>dixon-coles-v1</code> research. No probability model is promoted into the live scanner.</p>
          <p className={styles.limitation}><strong>Limits:</strong> older data is historical external validation, not unseen future data. Independence, equal history weights, no shrinkage and repeated date fits limit interpretation. An improvement over Poisson does not establish an advantage over market prices.</p>
          <ReferenceLinks section="dixon-coles" source="results" />
        </section>
        <section id="corners" className={ui.card} aria-labelledby="corners-title">
          <p className={ui.eyebrow}>V0.7 · CORNER COUNTS</p><h2 id="corners-title">Simple corner models were not promoted</h2>
          <p>We compared Poisson and Negative Binomial corner distributions, including tail probability and a prespecified external-validation rule. The small apparent development improvement did not survive as a supported external advantage.</p>
          <p className={styles.finding}>{research.corners.status}</p>
          <p className={styles.decision}><strong>Promotion:</strong> none. Both named models remain research artifacts.</p>
          <p className={styles.limitation}><strong>Limits:</strong> one league and ten seasons, independent home/away counts, no recency or lineup features. Count RPS and binary Over-line scores measure different things. No corner betting strategy was tested.</p>
          <ReferenceLinks section="corners" source="private" />
        </section>
        <section id="historical-value" className={ui.card} aria-labelledby="value-title">
          <p className={ui.eyebrow}>V0.8 · HISTORICAL BOOKMAKER PRICES</p><h2 id="value-title">The paper value strategy was not supported</h2>
          <p>We compared frozen Dixon–Coles probabilities with proportionally normalized historical Bet365 prices and evaluated a fixed, flat-unit paper rule. The market had the better probability score; the strategy lost money in both cohorts.</p>
          <dl className={styles.metrics}><div><dt>Dixon–Coles recent Brier · lower is better</dt><dd>{research.historicalValue.recentModelBrier}</dd></div><div><dt>Bet365 fair-market recent Brier</dt><dd>{research.historicalValue.recentMarketBrier}</dd></div><div><dt>Recent paper ROI</dt><dd>{negativePercentage(research.historicalValue.recentROI)}</dd></div><div><dt>Older paper ROI</dt><dd>{negativePercentage(research.historicalValue.olderROI)}</dd></div></dl>
          <p className={styles.finding}>{research.historicalValue.status}</p>
          <p className={styles.decision}><strong>Promotion:</strong> no value strategy promoted. This historical evaluation is not part of current odds scanning.</p>
          <p className={styles.limitation}><strong>Limits:</strong> non-closing source prices, uneven collection timing across eras, prior inspection of outcomes, one bookmaker and no execution evidence. Realized losses and uncertainty cannot be rewritten as a successful strategy.</p>
          <ReferenceLinks section="historical-value" source="private" />
        </section>
        <section id="calibration" className={ui.card} aria-labelledby="calibration-title">
          <p className={ui.eyebrow}>V0.9 · CALIBRATION &amp; MARKET RESIDUALS</p><h2 id="calibration-title">Simple calibration was not promoted</h2>
          <p>We tested temperature scaling and multinomial logistic calibration on older rolling-origin predictions. Neither cleared the predeclared Brier-advantage rule, so recent validation retained the original probabilities.</p>
          <p className={styles.finding}>{research.calibration.status}</p><p><strong>{percentage(research.calibration.gapClosedFraction).replace(".00", "")} of the market Brier gap closed.</strong> No calibrated research model was promoted.</p>
          <p className={styles.decision}><strong>Promotion:</strong> none; the selected transform remains identity.</p>
          <p className={styles.limitation}><strong>Limits:</strong> four older folds, dependence between matches, fixed calibration bins and prior outcome inspection. Market disagreement is a diagnostic, not evidence of betting value.</p>
          <ReferenceLinks section="calibration" source="private" />
        </section>
      </div>
      <p className={styles.archiveNote}>Recent cohorts: {research.seasons.recent.join(", ")}. Older historical validation: {research.seasons.older.join(", ")}. Detailed methods, frozen hashes, licensing and reproduction commands are preserved in <a href={docs}>research documentation ↗</a>. This page loads only a compact aggregate index.</p>
    </main><SiteFooter />
  </div>;
}
