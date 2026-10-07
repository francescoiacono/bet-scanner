# Bet Scanner V0.9

A local football research dashboard with seven research views:

- **Probability calibration (`/calibration`)**: select a calibration layer using older rolling-origin evidence, freeze it, then evaluate recent historical forecasts against raw Dixon–Coles and the fair market.

- **Historical market value (`/value`)**: evaluate the already recorded `dixon-coles-v1` probabilities at historical Bet365 non-closing 1X2 source prices using a predeclared flat-unit paper rule.

- **Model comparison (`/models`)**: compare frozen `poisson-v1` with independently fitted `dixon-coles-v1`, reporting development and external historical validation separately.
- **Corner research (`/corners`)**: compare jointly fitted `corner-poisson-v1` and `corner-negative-binomial-v1` on manually supplied private historical corner counts, with public aggregate reports only.
- **Real historical backtest (`/backtest`)**: evaluate the frozen `poisson-v1` model against uniform, causal league-base-rate, and league-average Poisson forecasts on five completed Premier League seasons.
- **Model diagnostics (`/diagnostics`)**: investigate paired uncertainty, fixed history-depth slices, outcome calibration, and season robustness without changing the model.
- **Fictional market scanner (`/`)**: retain the existing fictional match history, upcoming fixtures, and independent mock prices for implied probability, edge, and expected ROI analysis.

V0.8’s fixed historical paper rule lost money in both cohorts; its recorded status remains **INCONCLUSIVE**. V0.9 investigates probability calibration without modifying any model or V0.6/V0.7/V0.8 artifact. The predeclared older rolling-origin rule selects **IDENTITY**: neither fitted candidate has a Brier-advantage interval entirely above zero. Recent selected probabilities therefore equal raw Dixon–Coles, **0%** of the market gap is closed, and no calibrated research model is promoted. The fictional scanner still uses `poisson-v1`; neither corner model is promoted. V0.9 adds no betting strategy or current recommendations. Assets/fonts/data are local, with no runtime data requests, live odds, bookmaker APIs, sports APIs, AI, authentication, databases, deployment or bet execution.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000, http://localhost:3000/backtest, http://localhost:3000/diagnostics, http://localhost:3000/models, http://localhost:3000/corners, http://localhost:3000/value, or http://localhost:3000/calibration. The scanner still has six upcoming fictional fixtures and 18 HOME / DRAW / AWAY selections. Its default minimum edge is 2 pp (`0.02`); a threshold of 100 pp demonstrates `NO BET — no opportunities meet the current threshold`.

Offline generation uses Node's native TypeScript stripping (Node 22.18+; verified with Node 24.21). The existing data generator needs no added dependency; model generation uses the pinned Numeric.js optimiser documented below. Neither script needs a new TypeScript loader:

```sh
pnpm data:build
pnpm model:build
```

This reads committed source files, verifies SHA-256 hashes, parses and validates every season, and replaces the separate development and external-validation JSON artifacts only after all ten seasons pass. It needs no network access. Ordering, IDs, JSON formatting, and the final newline are deterministic; generation time is not embedded. Tests reproduce the committed artifact byte-for-byte.

## Dataset and provenance

The development / diagnostic dataset remains **2021-22 → 2025-26**, previously examined in V0.4/V0.5. The source is [OpenFootball / england](https://github.com/openfootball/england), vendored at commit [`b17e8f01707d83d2ce1790c14d4a5eeb35987825`](https://github.com/openfootball/england/tree/b17e8f01707d83d2ce1790c14d4a5eeb35987825), dated 21 September 2026. The upstream license is **CC0 1.0 Universal / public domain**. Exact source bytes and the license are retained; no match results were manually rewritten.

| Upstream path | Vendored path |
| --- | --- |
| `2021-22/1-premierleague.txt` | `data/external/openfootball/2021-22-premierleague.txt` |
| `2022-23/1-premierleague.txt` | `data/external/openfootball/2022-23-premierleague.txt` |
| `2023-24/1-premierleague.txt` | `data/external/openfootball/2023-24-premierleague.txt` |
| `2024-25/1-premierleague.txt` | `data/external/openfootball/2024-25-premierleague.txt` |
| `2025-26/1-premierleague.txt` | `data/external/openfootball/2025-26-premierleague.txt` |
| `LICENSE.md` | `data/external/openfootball/LICENSE.md` |

`data/external/openfootball/provenance.json` records the commit and hashes. The adjacent [source README](data/external/openfootball/README.md) documents deterministic re-acquisition. No 2026-27 season or bookmaker odds are included.

Every selected season has **380 completed matches**, **20 distinct teams**, and **38 appearances per team: 19 home and 19 away**. Validation rejects partial seasons, duplicate IDs or directed home/away fixtures, self-matches, invalid/missing scores, invalid calendar dates, dates/IDs outside the specified season, and unselected/current seasons. Each dataset contains 1,900 normalized records with no odds. External validation adds exactly **2014-15, 2015-16, 2016-17, 2017-18, 2018-19** from that same commit: `data/external/openfootball/<season>-premierleague.txt`. Their SHA-256 hashes are in [external-validation-provenance.json](data/external/openfootball/external-validation-provenance.json). The original source files, license, manifest, and generated development data are unchanged. These older seasons were not used in V0.1–V0.5 or to select V0.6; they are external historical validation, not future unseen data.

## Parser assumptions

`src/lib/data/openfootball.ts` supports the two result layouts in the vendored files:

```text
20:00 Home Team 2-1 (1-0) Away Team
20:00 Home Team v Away Team 2-1 (1-0)
```

Time prefixes and half-time scores are optional and do not enter evaluation. Weekday/month/day headers supply the source calendar date; omitted years resolve from the explicit season, with July–December in its starting year and January–June in its ending year. An explicit year must agree. Invalid calendar days fail instead of rolling over. A matching Premier League season header is required.

Names preserve upstream spelling, including FC suffixes, with whitespace normalized. There is no cross-season team alias mapping. IDs contain league, season, date, and team slugs, never scores or source line numbers. Match records sort by date and then ID.

Comments, matchday labels, unrelated titled sections such as squads, and balanced multi-line scorer details are ignored. Apparent result rows that cannot be parsed fail with season/line context; unknown indented content under a match date is rejected rather than discarded. Unclosed details and duplicate normalized IDs also fail. Generation refuses to continue with a partial season.

## Architecture

```text
Vendored OpenFootball source + provenance hashes
    → parser → complete-season integrity checks → generated JSON
    → season-isolated walk-forward poisson-v1 predictions
    → actual outcomes + uniform / league-base-rate / league-Poisson Brier
    → overall / per-season quality and calibration → /backtest
    → paired bootstrap / history depth / outcomes / robustness → /diagnostics

Development + separate external historical data
    → frozen poisson-v1 eligibility + causal Dixon–Coles fits
    → separate paired summaries / intervals / outcome / depth diagnostics
    → offline model-comparison-v06.json → /models

Fictional completed matches → derived current profiles → poisson-v1
    + independent fictional fixture prices
    → implied probability / edge / expected ROI → filter / ranking → /
```

- `data/external/openfootball/`: exact upstream files, license, manifest, and acquisition notes
- `scripts/build-data.mjs`: offline hash checks and deterministic data generation
- `src/lib/data/openfootball.ts`: parser, selected seasons, integrity validation, and artifact serialization
- `src/data/generated/epl-seasons.json` and `src/data/epl-seasons.ts`: normalized data and local typed imports
- `src/lib/backtest/{types,history,run-backtest}.ts`: reusable played-match domain, history aggregation, venue readiness, and causal single-history orchestration
- `src/lib/backtest/league-base-rate.ts`: unsmoothed prior outcome frequencies
- `src/lib/backtest/league-poisson.ts`: prior league scoring rates passed to the existing frozen Poisson engine
- `src/lib/diagnostics/{types,bootstrap,history-depth,outcome-calibration,robustness}.ts`: pure diagnostic functions; no mathematics in React
- `src/lib/backtest/run-multi-season-backtest.ts`: independent season runs and match-weighted combined metrics
- `src/lib/backtest/metrics.ts`: Brier, skill, top picks, calibration, and summaries
- `src/lib/dixon-coles/{types,model,likelihood,fit}.ts`: separate score model, structurally identified parameters, validated likelihood/analytic gradient, and library-backed fitting
- `src/lib/model-comparison/`: shared eligible fixtures, causal date fitting, paired records, and separate dataset summaries
- `scripts/build-models.mjs`: deterministic offline generation; the local import hook uses Node native TypeScript stripping without another dependency
- `src/data/generated/model-comparison-v06.json`: complete paired records, fit parameters/audits, configuration, provenance, and diagnostics
- `src/app/models/page.tsx`: reads the generated artifact; does not import or run the optimiser
- `src/lib/football/`: frozen `poisson-v1` model; formulas, grid, normalization, and version are unchanged
- `src/lib/betting/` and `src/lib/scan-markets.ts`: existing fictional value analysis and price/prediction separation
- `src/data/mock-played-matches.ts`: retained 48-match fictional scanner source and deterministic test fixture; it is not labelled EPL
- `src/app/backtest/page.tsx`: real-result summary, per-season table, recent audit rows, calibration, and warm-up records
- `src/app/diagnostics/page.tsx`: benchmark hierarchy, paired intervals, history slices, outcome calibration, leave-one-season-out results, and weakest-season breakdown
- `src/app/research-header.tsx`: four-route navigation that distinguishes real historical results from the fictional market scanner

The page reads generated JSON instead of parsing source text per request. Next.js prerenders the local backtest. The audit table shows the latest 80 evaluated records and 20 recent skips to keep the page compact; the returned backtest result retains every record. Model forecasts never read prices or target-match scores.

## Frozen Poisson causal evaluation and warm-up

Each season starts with **empty history**. Team profiles, league goal averages, and outcome frequencies never cross a season boundary. Established and promoted clubs follow the same rule; there are no prior-season samples, promoted-club priors, smoothing, or model fitting.

All matches on the same source calendar date are intentionally batched together at **`YYYY-MM-DDT12:00:00Z`**. The generated noon-UTC timestamp is an evaluation ordering convention, **not the historical kickoff time**. Only results on strictly earlier calendar dates are available to either the model or the league-base-rate benchmark. No assumptions about within-day result availability are made. The league-average Poisson benchmark uses this same history snapshot and season reset.

For each date batch:

1. Derive venue goal totals and league baselines from earlier matches in this season. Each historical match contributes once to each league goal sum.
2. Require both teams to have at least **two prior HOME appearances and two prior AWAY appearances**. `minimumVenueMatches` is configurable as a positive safe integer; the default remains 2.
3. Record unready fixtures explicitly as `INSUFFICIENT_HISTORY`, without guessing or borrowing future samples.
4. Predict all eligible matches from the same history snapshot. Calculate both causal benchmarks from that identical snapshot.
5. Only after the whole date batch has been predicted and scored, append its results to history, including skipped matches.

Sorting uses copies; input arrays, season objects, match records, and configuration are not mutated. Exact-time ordering ties use code-point ID order. Each evaluated record carries season, match identity/date/final score, model prediction, training count, latest prior kickoff key, league baselines, actual outcome, all three benchmark probabilities, benchmark Briers, the league-Poisson expected goals/probabilities, all four prior team/venue appearance counts, their minimum history depth, and top-pick correctness. No financial fields are included.

Tests reconstruct strict prior histories, change earlier/same-date/future/previous-season results, reverse inputs, and freeze records. Changing a future result must not change an earlier forecast; changing a previous season must not change the next season at all.

## Metrics and benchmark interpretation

The actual result is HOME when home goals exceed away goals, DRAW when equal, and AWAY otherwise. The primary metric is three-class Brier:

```text
Brier = (pHOME - yHOME)^2 + (pDRAW - yDRAW)^2 + (pAWAY - yAWAY)^2
```

Actual results use one-hot vectors. There is **no division by 3**; Brier ranges from 0 to 2 and lower is better.

- **Uniform:** HOME / DRAW / AWAY each have probability `1/3`; Brier is `2/3` for every result.
- **League base rate (`league-base-rate`):** HOME / DRAW / AWAY probabilities are the corresponding prior win/draw counts divided by all prior completed matches in the current season. There is no smoothing, same-date input, or previous-season carryover.
- **League-average Poisson (`league-poisson`):** expected home goals = prior league home goals per match; expected away goals = prior league away goals per match. Feed these rates into the existing `calculateMatchProbabilities` engine with the unchanged 0–10 grid and normalization. No fixture/team identity or team profile enters this benchmark.
- **poisson-v1:** league scoring rates plus team-specific attack/defence strengths, unchanged from V0.2.
- **Skill against a benchmark:** `1 - model mean Brier / benchmark mean Brier`. Positive means better, zero equal, and negative worse. All three benchmarks are scored on exactly the model's eligible matches.

Beating the uniform benchmark is a weak test. The league-base-rate benchmark is stronger because Premier League HOME / DRAW / AWAY outcomes are not naturally equally likely. Positive skill versus league base rate means `poisson-v1` improved probability forecasts relative to simply using prior league outcome frequencies. It is not proof of a betting edge.

Top-pick accuracy is the proportion whose highest-probability outcome happened, with the correct count retained. Exact ties prefer HOME, then DRAW, then AWAY. Accuracy is supplementary because it does not assess the rest of the distribution.

Top-pick confidence calibration uses ten bins: `[0.0, 0.1)`, …, `[0.9, 1.0]`, with probability 1 in the final bin. Each non-empty bin reports count, mean highest probability, and observed top-pick accuracy.

```text
ECE = sum((bin count / evaluated count) × abs(mean confidence - observed accuracy))
```

ECE is a fraction internally and is displayed in percentage points. This diagnoses top-pick confidence, not full multiclass calibration. Overall metrics are computed directly from the pooled evaluated records, not unweighted season averages. Overall ECE pools observations into bins before taking absolute gaps; it is not an average of per-season ECEs.

With no evaluated matches, quality metrics are `null`, correct count is zero, and bins are empty. Skill against a hypothetical perfect zero-Brier benchmark is also `null`, because the ratio is undefined.

## Recorded evaluation results

The bundled snapshot with the default venue minimum produces:

| Season | Historical | Evaluated | Skipped | Model Brier | Base-rate Brier | Skill vs base | Skill vs uniform | Accuracy | ECE (pp) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 380 | 340 | 40 | 0.6393 | 0.6534 | +2.15% | +4.10% | 51.18% | 10.94 |
| 2022-23 | 380 | 340 | 40 | 0.6290 | 0.6348 | +0.91% | +5.66% | 50.59% | 10.54 |
| 2023-24 | 380 | 328 | 52 | 0.6074 | 0.6402 | +5.13% | +8.89% | 50.91% | 10.11 |
| 2024-25 | 380 | 340 | 40 | 0.6270 | 0.6583 | +4.76% | +5.95% | 49.12% | 8.82 |
| 2025-26 | 380 | 340 | 40 | 0.6684 | 0.6609 | -1.13% | -0.26% | 48.24% | 12.73 |
| Overall | 1,900 | 1,688 | 212 | 0.6344 | 0.6496 | +2.34% | +4.84% | 50.00% | 10.14 |

Uniform mean Brier is 0.6667 in every row. Overall top-pick correct count is 844/1,688. Skill is a relative Brier improvement, not a probability-point edge or financial return. Performance is modest overall and worse than both baselines in 2025-26; pooling must not hide that variation. Eligibility depends on the actual dated venue schedule, so the number of warm-up skips varies by season.

## V0.5 diagnostic methods and recorded results

`poisson-v1` remains byte-for-byte unchanged in `src/lib/football/`: version, league formulas, strengths, expected goals, independent Poisson mathematics, 0–10 grid, and normalization. The causal season reset and two-home/two-away eligibility are unchanged. No parameters are tuned on these five reused evaluation seasons. `/backtest` retains the original quality metrics, provenance, top-pick ECE, and recent audit; detailed diagnostics live on `/diagnostics`. The fictional scanner's data and calculations are unchanged.

### Forecast information hierarchy

Uniform → prior league outcome frequencies → prior league scoring rates through Poisson → league rates plus team attack/defence strengths. This orders information, not a promise that each level improves performance. The new league-Poisson mean Brier is **0.6487**, versus model **0.6344**, giving **+2.21%** model skill. The existing +2.34% skill versus league base rate remains unchanged.

| Season | League-Poisson Brier | Skill vs league Poisson |
| --- | ---: | ---: |
| 2021-22 | 0.6555 | +2.47% |
| 2022-23 | 0.6348 | +0.93% |
| 2023-24 | 0.6382 | +4.84% |
| 2024-25 | 0.6558 | +4.39% |
| 2025-26 | 0.6589 | -1.45% |

### Paired uncertainty

For each eligible match, `advantage = benchmark Brier − model Brier`. Positive favours the model, zero means equal, and negative favours the benchmark. The bootstrap resamples paired records together; it never independently resamples model and benchmark.

Method: **season-stratified date-cluster paired percentile bootstrap**. Cluster key is **season + source calendar date** (the date in the source timestamp, not a timezone-converted day). Canonical ordering uses season ID, source date, then match ID. In each replicate, independently draw each season's original number of evaluated date clusters with replacement; all evaluated matches in a chosen cluster remain together, including repetitions. Combine those season samples and divide summed paired advantages by the **sampled match count**, not by the number of dates or an unweighted average of season means. The same draws serve both benchmark comparisons.

Defaults: **5,000 replicates**, **seed 202605**, **95% interval**. A local Mulberry32 uint32 PRNG has no dependency or global random state. Bounds use the 2.5th/97.5th percentiles, linearly interpolating adjacent sorted values at `(n − 1) × percentile`. Inputs and configuration are not mutated; the same data and seed produce identical numerical output, including after input reordering. Configuration permits positive safe-integer sample counts, uint32 seeds (including zero), and finite confidence levels strictly between zero and one; invalid values fail explicitly. Empty input returns `null` estimates/bounds plus method/configuration metadata.

The sample has **1,688 evaluated matches in 522 date clusters**, with season cluster counts 112, 106, 103, 99, and 102 in chronological season order.

| Comparison | Observed paired advantage | 95% lower | 95% upper |
| --- | ---: | ---: | ---: |
| vs league base rate | 0.0152 | -0.0028 | 0.0328 |
| vs league-average Poisson | 0.0143 | -0.0038 | 0.0320 |

Both intervals include zero: the observed advantage is not robustly separated from zero under this diagnostic resampling method. The bootstrap interval is a diagnostic uncertainty estimate for this observed set of seasons. It is not proof that `poisson-v1` has a persistent real-world edge. Date-cluster resampling preserves same-date dependence but does not model every possible form of football/time-series dependence, longer runs of form, or uncertainty over which seasons were observed. Stratification fixes the five observed season strata rather than sampling new seasons. No p-value or Bayesian probability is reported.

### History depth

Every prediction retains the home team's prior home/away appearances and the away team's prior home/away appearances. **History depth is the minimum of those four counts**, representing the weakest-supported input. Default eligibility still requires every count to be at least two; the V0.5 history diagnostic explicitly rejects depths below two. Its five fixed buckets **2–3, 4–6, 7–10, 11–15, 16+** were specified before results were examined. No post-hoc bucket changes are made. Empty buckets have zero matches and `null` metrics and are omitted from page tables.

| Depth | Matches | Model Brier | Base Brier | Advantage vs base | League-Poisson Brier | Advantage vs Poisson | Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2–3 | 200 | 0.7598 | 0.6657 | -0.0940 | 0.6653 | -0.0944 | 38.00% |
| 4–6 | 311 | 0.6654 | 0.6331 | -0.0322 | 0.6343 | -0.0311 | 48.23% |
| 7–10 | 407 | 0.6597 | 0.6692 | 0.0095 | 0.6661 | 0.0064 | 48.40% |
| 11–15 | 497 | 0.5840 | 0.6424 | 0.0584 | 0.6420 | 0.0579 | 54.93% |
| 16+ | 273 | 0.5613 | 0.6404 | 0.0791 | 0.6394 | 0.0781 | 54.21% |

Model Brier declines across these fixed depth slices; advantages are negative in the first two and positive from 7–10 onward. Depth also tracks season timing and changes in eligible fixtures, so this descriptive association does not isolate a causal effect of additional history.

### Outcome components and one-vs-rest calibration

For each HOME/DRAW/AWAY outcome, `component = (predicted probability − one-hot actual outcome)^2`. The three mean components sum to each forecast's mean multiclass Brier (no division by three).

| Outcome | Model component | Base component | League-Poisson component | Model mean prediction | Observed frequency | Gap (pp) | Model ECE (pp) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HOME | 0.2365 | 0.2479 | 0.2481 | 44.17% | 44.19% | -0.02 | 9.02 |
| DRAW | 0.1892 | 0.1833 | 0.1822 | 22.71% | 23.99% | -1.28 | 5.29 |
| AWAY | 0.2087 | 0.2185 | 0.2184 | 33.12% | 31.81% | +1.30 | 7.77 |

For each outcome, all evaluated matches contribute a prediction and a binary observed result. Reuse the existing ten half-open bins `[0.0, 0.1)`, …, `[0.9, 1.0]`; 1.0 belongs in the final bin. Each bin reports count, mean predicted probability, and observed frequency. Outcome ECE is `sum(bin count / match count × abs(mean prediction − observed frequency))`. HOME, DRAW, and AWAY have separate **one-vs-rest ECEs**; they are not combined into an invented multiclass ECE. The existing top-pick ECE remains **10.14 pp**. All quality fields and bucket means are `null` when there are no evaluated observations.

Overall HOME/AWAY error components improve on both benchmarks, while DRAW is worse than both. The aggregate HOME mean is nearly unbiased despite a 9.02 pp binned ECE; a small global gap does not imply calibration in every probability range. DRAW is underpredicted by 1.28 pp and AWAY overpredicted by 1.30 pp.

### Leave-one-season-out robustness

Exclude each season and pool the other four seasons' existing individual prediction records. No retraining, fitting, rerunning, or averaging of season means occurs. Rows use canonical record order and remain deterministic under reordered input.

| Excluded | Remaining matches | Model Brier | Base Brier | Skill vs base | League-Poisson Brier | Skill vs Poisson |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 1348 | 0.6332 | 0.6486 | +2.39% | 0.6470 | +2.14% |
| 2022-23 | 1348 | 0.6358 | 0.6533 | +2.69% | 0.6522 | +2.52% |
| 2023-24 | 1360 | 0.6409 | 0.6518 | +1.68% | 0.6512 | +1.59% |
| 2024-25 | 1348 | 0.6363 | 0.6474 | +1.72% | 0.6469 | +1.65% |
| 2025-26 | 1348 | 0.6258 | 0.6467 | +3.23% | 0.6462 | +3.15% |

All five remaining-sample point estimates retain positive skill against both causal benchmarks. No single excluded season reverses the pooled point estimate, but this does not remove the uncertainty indicated by the bootstrap.

### Weakest observed season

Select the season dynamically by **lowest skill versus league base rate**. Ignore unavailable skill values; exact ties choose the lexicographically first season ID. The current snapshot selects **2025-26**: model Brier **0.6684**, base **0.6609**, league Poisson **0.6589**, skill **−1.13% / −1.45%** respectively. This is a diagnostic selection from the observed data, not an adjustment targeted to that season.

| Outcome | Model component | Base component | League-Poisson component |
| --- | ---: | ---: | ---: |
| HOME | 0.2431 | 0.2454 | 0.2446 |
| DRAW | 0.2111 | 0.2030 | 0.2022 |
| AWAY | 0.2143 | 0.2124 | 0.2120 |

| Depth | Matches | Model Brier | Base Brier | Advantage vs base | League-Poisson Brier | Advantage vs Poisson | Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2–3 | 40 | 0.7669 | 0.6548 | -0.1121 | 0.6447 | -0.1222 | 42.50% |
| 4–6 | 60 | 0.5975 | 0.6202 | 0.0227 | 0.6246 | 0.0271 | 58.33% |
| 7–10 | 80 | 0.6912 | 0.6849 | -0.0063 | 0.6785 | -0.0127 | 43.75% |
| 11–15 | 102 | 0.6968 | 0.6766 | -0.0202 | 0.6761 | -0.0207 | 48.04% |
| 16+ | 58 | 0.5924 | 0.6467 | 0.0543 | 0.6467 | 0.0543 | 48.28% |

The weak season's largest component deterioration is DRAW; AWAY is also worse and HOME slightly better than both benchmarks. Losses occur in 2–3, 7–10, and 11–15 depth slices, while 4–6 and 16+ improve. Its weakness spans multiple slices and is not confined to the earliest fixtures. These exploratory comparisons do not by themselves justify a new parameter or model change.

## Exact modelling assumptions

Each profile contains historical **integer totals**, not averages or probabilities. Derived totals can have zero venue appearances while a team warms up; readiness is checked before calling the frozen model, whose home and away counts must both be positive. Team names and fixture IDs are exact identifiers; no fuzzy matching is performed. All supplied profiles are treated as one league and one equally weighted historical window, with no adjustment for recency or opponent quality.

### League baselines

```text
league home goals = sum(homeGoalsFor) / sum(homeMatches)
league away goals = sum(awayGoalsFor) / sum(awayMatches)
```

These are match-count-weighted averages, not unweighted averages of team averages. Goals are counted once via the scoring team's totals. The mock league's home goals scored equal away goals conceded, and away goals scored equal home goals conceded. Both resulting baselines must be finite and strictly positive; they are calculated from the dataset rather than stored.

### Expected goals

Let `Lh` and `La` be the league home and away goal averages:

```text
home attack = (home.homeGoalsFor / home.homeMatches) / Lh
away defensive weakness = (away.awayGoalsAgainst / away.awayMatches) / Lh
expected home goals = Lh × home attack × away defensive weakness

away attack = (away.awayGoalsFor / away.awayMatches) / La
home defensive weakness = (home.homeGoalsAgainst / home.homeMatches) / La
expected away goals = La × away attack × home defensive weakness
```

A higher defensive-weakness ratio means more goals conceded. Each team's attack and its opponent's defence use the baseline for the side scoring the goals. No extra home-advantage multiplier is applied; home advantage is already represented by the separate venue baselines and profiles. Zero individual scoring/conceding totals and zero expected goals are valid. These expected goal counts are derived from raw scored/conceded goal totals, not from shot-based expected-goals (xG) data.

### Poisson score matrix

Home and away goal counts are independent Poisson variables with constant intensities equal to their respective expected goals:

```text
P(X = k) = exp(-lambda) × lambda^k / k!
P(home = h, away = a) = P(home = h) × P(away = a)
```

The implementation evaluates the same probability in log space to avoid power/factorial overflow. At `lambda = 0`, zero goals have probability 1 and all higher scores have probability 0.

The grid includes **0 through 10 goals, inclusive**, for both sides. Cells with `h > a` sum into HOME, cells with `h = a` into DRAW, and cells with `h < a` into AWAY. Divide all three raw totals by their combined retained probability mass so that the final probabilities sum approximately to 1. This conditions the distribution on both teams scoring at most 10; it does not model the discarded tails. Very large intensities can make that conditioning misleading. A score grid whose retained mass numerically underflows to zero fails explicitly.

Predictions carry fixture identity, both expected goal counts, all three outcome probabilities, and `modelVersion: "poisson-v1"`. No model fitting, training, confidence score, or statistical dependency is introduced.

## V0.6 Dixon–Coles comparison

The new model is **`dixon-coles-v1`**, separate from immutable **`poisson-v1`**. It implements the core jointly fitted score model and four-cell dependence correction from Dixon, M.J. and Coles, S.G. (1997), *Modelling Association Football Scores and Inefficiencies in the Football Betting Market*, Journal of the Royal Statistical Society: Series C, 46(2), 265–280, [DOI: 10.1111/1467-9876.00065](https://doi.org/10.1111/1467-9876.00065). Time decay is an established possible extension, explicitly outside V0.6.

### Exact model and likelihood

For home team i and away team j:

```text
lambda = exp(homeAdvantage + attack_i + defenceWeakness_j)
mu     = exp(attack_j + defenceWeakness_i)

P(x,y) = tau(x,y; lambda,mu,rho) × Poisson(x;lambda) × Poisson(y;mu)

tau(0,0) = 1 − lambda × mu × rho
tau(0,1) = 1 + lambda × rho
tau(1,0) = 1 + mu × rho
tau(1,1) = 1 − rho
tau(other) = 1
```

Higher attack increases scoring; higher defenceWeakness increases conceding. Home advantage is a log-scale parameter entering only home lambda. Teams are ordered lexically by their exact normalized source names. Optimise N−1 attacks, N defence weaknesses, home advantage, and one correlation coordinate: **2N+1 parameters** (41 for 20 teams). Derive the last attack as the negative sum of the other attacks so their sum is structurally zero; do not recenter fitted parameters afterwards.

Minimise the equally weighted mean negative log likelihood of all supplied completed prior matches. Dividing total negative log likelihood by match count changes only numerical scale, not its maximiser; the audit retains the total. Likelihood uses the full Poisson score support, including any observed score above ten. Only prediction is truncated to the existing 0–10 grid. Reuse the frozen Poisson PMFs, apply tau, collapse into HOME/DRAW/AWAY, and normalize retained mass. At rho=0 the outcomes are exactly those of the existing independent Poisson engine at the same lambda/mu.

Invalid/non-positive likelihood contributions, non-finite rates or gradients, negative tau/probabilities, and unusable grid mass fail explicitly. There is no probability clamping. An infeasible optimiser trial is rejected with an infinite objective so the library line search can backtrack; it never becomes a fitted parameter set or plausible score.

### Correlation constraint and score validity

The fixed safety constraint remains **−0.20 < rho < +0.20**. That bound alone does not ensure non-negative tau at arbitrarily high fitted rates. The implemented bounded transformation also covers the interior of the algebraically feasible score-model domain for every ordered pair of fitted teams:

```text
M = maximum of lambda_ij and mu_ij over all i != j
Q = maximum of lambda_ij × mu_ij over all i != j
L = max(−0.20, −1/M)
U = min(+0.20, +1/Q)
s = (1 + tanh(rawRho)) / 2
rho = (1 − s) × L + s × U
```

These bounds come directly from positivity of the four tau cells, not performance tuning. When the fixed safety bound is stricter than the tau constraints, this reduces to `rho = 0.20 × tanh(rawRho)`. The mapping spans the complete feasible interior and introduces no shrinkage, regularisation, or empirical hyperparameter. Rounded saturation at a boundary fails instead of being clamped. An analytic gradient includes the chain rule through both bounds; maxima are piecewise differentiable and exact ties choose the first lexical pair. Finite-difference tests check the gradient with active and inactive constraints. The initial development prototype rejected an infeasible boundary; this validity parameterisation and all fitting choices were settled before external evaluation.

### Optimiser and convergence policy

The one added dependency is [Numeric.js](https://github.com/sloisel/numeric), pinned to **`numeric@1.2.6`** with integrity in `pnpm-lock.yaml`. Its established full BFGS `uncmin` routine is suitable for this 41-parameter objective; the package has no transitive dependencies and its [MIT licence](https://github.com/sloisel/numeric/blob/master/license.txt) is compatible with local use. Node 24.21 was checked on an analytic quadratic before installation. The upstream MIT notice is retained in `data/licenses/numeric-1.2.6-LICENSE.txt` because the published tarball omits that file. A small local declaration describes the used API; no football package or new TypeScript loader is added.

Every eligible date fit starts from **all zeros**, independently; no random initialisation or warm starts. This avoids carrying a saturated raw correlation coordinate to later dates. Fixed settings are:

- Maximum library iterations: **2,000** (its count includes line-search backtracking).
- Step tolerance: **1e-10**.
- Mean-objective gradient L2 tolerance: **1e-6**.
- Relative objective tolerance: **1e-10**, sustained for **five accepted iterations**.
- Convergence: gradient test, sustained objective stability, or the library's declared small-step termination, with a finite valid final fit mandatory. Iteration exhaustion and any other non-convergence abort generation.

Record the actual convergence criterion, termination text, iterations/evaluations, rejected trial count, total likelihood, gradient norm, home advantage, rho, team ratings, and raw vector. Objective or small-step convergence does not imply a zero ordinary gradient at a piecewise-smooth validity boundary or guarantee a global maximum. No real fit uses fallback, stale parameters, another model, or a skipped eligible batch. Sparse fits and their numerical stopping criteria remain limitations rather than being silently regularised.

### Paired causal evaluation and offline artifact

For each season, start empty and process normalized noon-UTC source-date batches in stable ID order. The frozen baseline's target eligibility is the single source of truth: both teams must have at least **two prior home and two prior away appearances**. If a date has eligible fixtures, fit once using **all strictly earlier current-season matches**, including matches that were warm-up skips when played. Predict every eligible fixture from that fit before admitting any result on its date. No parameters or history cross seasons.

The build checks identical evaluated IDs between models. Each paired record retains the baseline forecast/Brier, Dixon–Coles forecast/Brier, actual outcome, causal history/counts, both causal benchmark Briers, history depth, dataset/season identity, and a fit-audit reference. All full fit parameters remain local for auditing.

`pnpm model:build` reads committed datasets and verifies raw-source hashes, evaluates development first and external validation separately, and atomically replaces **`src/data/generated/model-comparison-v06.json`** only after both complete. No optimisation runs in Next.js page rendering or the browser. There are no generation timestamps, random IDs, or machine paths in the artifact. A model-specification SHA-256 locks the score/fitting/orchestration implementation. Node/dependency versions, settings, and provenance are recorded. With the same inputs and Node 24.21.0 the full artifact is tested **byte-for-byte reproducible**; when run under another Node version, the regeneration test checks per-match Brier agreement at 12 decimal places. The readable artifact retains full audits and is approximately 14 MB.

### Separate development and external results

Paired advantage is **poisson-v1 Brier − Dixon–Coles Brier**: positive favours Dixon–Coles. Reuse the unchanged V0.5 season-stratified source-date-cluster paired bootstrap separately for each dataset: **5,000 replicates, seed 202606, 95% percentile interval**, match-count weighting and linear percentile interpolation. Date clusters stay whole and never cross season strata. No development/external pooling is used for a headline.

| Dataset | Historical | Evaluated | Skipped | Poisson Brier | DC Brier | DC advantage | 95% interval |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development 2021–26 | 1900 | 1688 | 212 | 0.63440 | 0.60962 | +0.02478 | [+0.01470, +0.03504] |
| External historical 2014–19 | 1900 | 1691 | 209 | 0.61527 | 0.59313 | +0.02214 | [+0.01180, +0.03291] |

| Dataset | League-Poisson Brier | Base-rate Brier | Poisson skill vs league Poisson | DC skill vs league Poisson | Poisson accuracy | DC accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Development | 0.64872 | 0.64959 | +2.21% | +6.03% | 50.00% | 51.07% |
| External historical | 0.63973 | 0.64215 | +3.82% | +7.28% | 51.15% | 52.63% |

Both intervals stayed above zero under this diagnostic resampling method. This supports a comparative probability-quality improvement on these historical samples, not proof of a persistent real-world or betting advantage. Clustering preserves same-date dependence but does not cover every form of football/time-series dependence. External seasons are older historical data, not future unseen data. **V0.6 does not tune Dixon–Coles after viewing the external-validation results. Neither model evaluation establishes betting profitability because no market prices are evaluated.**

| Season | Evaluated | Poisson Brier | DC Brier | Advantage | League-Poisson Brier | Base-rate Brier | Poisson accuracy | DC accuracy | Final prior-fit rho |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 340 | 0.63934 | 0.60773 | +0.03160 | 0.65551 | 0.65336 | 51.18% | 52.35% | -0.01298 |
| 2022-23 | 340 | 0.62896 | 0.60290 | +0.02605 | 0.63484 | 0.63476 | 50.59% | 51.47% | 0.05551 |
| 2023-24 | 328 | 0.60738 | 0.58091 | +0.02647 | 0.63825 | 0.64025 | 50.91% | 54.88% | -0.02192 |
| 2024-25 | 340 | 0.62700 | 0.60884 | +0.01815 | 0.65576 | 0.65835 | 49.12% | 50.00% | -0.03824 |
| 2025-26 | 340 | 0.66840 | 0.64671 | +0.02169 | 0.65887 | 0.66092 | 48.24% | 46.76% | -0.15528 |
| 2014-15 | 340 | 0.63761 | 0.61814 | +0.01947 | 0.64065 | 0.64564 | 47.06% | 50.59% | 0.04620 |
| 2015-16 | 340 | 0.68008 | 0.64885 | +0.03123 | 0.65653 | 0.66244 | 44.12% | 46.76% | -0.06253 |
| 2016-17 | 337 | 0.57396 | 0.56017 | +0.01379 | 0.62651 | 0.62788 | 56.97% | 57.27% | -0.06983 |
| 2017-18 | 337 | 0.62799 | 0.58920 | +0.03879 | 0.64554 | 0.64872 | 50.15% | 51.04% | -0.14563 |
| 2018-19 | 337 | 0.55595 | 0.54859 | +0.00736 | 0.62925 | 0.62585 | 57.57% | 57.57% | -0.02901 |

All ten seasonal Brier advantages are positive. Accuracy is supplementary: Dixon–Coles accuracy declines in 2025-26 despite improved Brier, and is equal in 2018-19. Final rho is the last eligible date’s prior-history estimate, not a full-season fit using that date’s results.

| Dataset | Outcome | Poisson component | DC component |
| --- | ---: | ---: | ---: |
| Development | HOME | 0.23654 | 0.22542 |
| Development | DRAW | 0.18918 | 0.18530 |
| Development | AWAY | 0.20868 | 0.19890 |
| External historical | HOME | 0.23644 | 0.22439 |
| External historical | DRAW | 0.18341 | 0.18226 |
| External historical | AWAY | 0.19542 | 0.18648 |

DRAW improves modestly in both datasets; HOME and AWAY improvements account for most of the gain. Development DC DRAW error (0.18530) still exceeds the V0.5 base-rate/league-Poisson components (0.18326/0.18223). This comparison changes joint fitting and rho correction together, so it does not isolate the low-score correction’s individual causal contribution or show that DRAW weakness is resolved.

| Dataset | History depth | Matches | Poisson Brier | DC Brier | Advantage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Development | 2–3 | 200 | 0.75977 | 0.68621 | +0.07356 |
| Development | 4–6 | 311 | 0.66536 | 0.63129 | +0.03407 |
| Development | 7–10 | 407 | 0.65969 | 0.63519 | +0.02449 |
| Development | 11–15 | 497 | 0.58405 | 0.57128 | +0.01277 |
| Development | 16+ | 273 | 0.56127 | 0.56051 | +0.00077 |
| External historical | 2–3 | 200 | 0.73447 | 0.68602 | +0.04844 |
| External historical | 4–6 | 323 | 0.64785 | 0.60199 | +0.04586 |
| External historical | 7–10 | 401 | 0.61689 | 0.58764 | +0.02925 |
| External historical | 11–15 | 516 | 0.54579 | 0.54574 | +0.00006 |
| External historical | 16+ | 251 | 0.61861 | 0.61393 | +0.00468 |

Depth is the minimum of the same four prior venue counts; the V0.5 boundaries are unchanged. Improvements are strongest with sparse history and much smaller late in the season. They do not make early fits reliable in an absolute sense: development DC at depth 2–3 still has Brier 0.68621, versus that same cohort’s league-Poisson 0.66534. These descriptive slices also track season timing; no eligibility threshold is changed.

| Dataset | Fits | Failures | Rho range | Median rho | Near safety bound | Home-advantage range | Max mean-gradient norm | Gradient / objective / step convergence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development | 522 | 0 | [-0.20000, 0.20000] | -0.03000 | 41 | [-0.19993, 0.52162] | 0.02197 | 64 / 458 / 0 |
| External historical | 458 | 0 | [-0.20000, 0.15927] | -0.08422 | 49 | [-0.27630, 0.35295] | 0.01661 | 24 / 434 / 0 |

Near-boundary means `abs(rho) >= 0.199`, a fixed reporting definition. **90 of 980 fits** are near the fixed safety boundary; no widening was made. Most fits meet the objective-stability criterion rather than the stricter gradient criterion, with non-negligible residual gradients in some sparse or score-domain-boundary fits. The complete stopping audit is retained so this limitation is visible.

### Limits and interpretation

Only Premier League raw-goal data is evaluated. History is within season, with no previous-season priors, regularisation, shrinkage, or time decay. Sparse early fits, locally convergent optimisation, the fixed rho safety constraint, and the 0–10 prediction grid limit interpretation. There is no xG, lineup/injury/player data, other market, odds, or profitability analysis. No model fitting occurs on the external dataset across seasons: its individual date fits use only their own prior history under the frozen specification.

External evidence is consistent with improved forecasts from the fitted Dixon–Coles model, particularly under sparse history; all ten seasons improve Brier and both separate bootstrap intervals remain positive. However, DRAW gains are small, late-history gains nearly disappear in some buckets, and numerical/boundary limitations remain. These joint findings support further separately scoped investigation, without selecting changes from this validation set or automatically promoting a model. The fictional scanner remains on `poisson-v1`; V0.7 corner research is independent of these frozen results.

## V0.7 corner-count research

### Local sources and privacy

The ten CSVs were manually supplied from Football-Data.co.uk. There is no scraper, downloader, automated refresh, or network request to that source. Required local paths are `data/private/football-data/{1415,1516,1617,1718,1819,2122,2223,2324,2425,2526}-E0.csv`. The fixed datasets are development **2021-22 → 2025-26** and external historical validation **2014-15 → 2018-19**; 2019-20, 2020-21 and 2026-27 are excluded. Historical validation is not future unseen data.

`data/private/` is gitignored. Original CSVs, normalized rows, per-match predictions, actual corner results, fit audits and team coefficients stay private. The public [provenance manifest](data/provenance/football-data-corners-v07.json) contains only source/acquisition metadata, selected seasons, filenames, required columns and exact source-byte SHA-256 hashes. Hashes were established only after all ten files passed integrity checks and are verified on every subsequent build; existing hashes are never silently replaced.

Only **Date, HomeTeam, AwayTeam, HC and AC** enter normalized records. All odds, goals, cards, shots and other statistics are ignored. Source dates support dd/mm/yy and dd/mm/yyyy, resolve into the explicitly selected season, and become noon-UTC ordering keys, not historical kickoff times. Team names use NFKC and whitespace normalization; IDs use season/date/encoded team identities and never scores. CSV quoting, escaped quotes and quoted newlines are supported. Entirely blank trailing records are ignored; any row containing content must be a complete, correctly structured match. Invalid dates/counts, missing fields, duplicate fixtures/IDs and partial schedules fail. Every source season has 380 matches, 20 teams, and 19 home plus 19 away fixtures per team: **3,800 matches total**.

The initially supplied 1415 file duplicated 2025-26 data. It was rejected; the user replaced it with the correct 2014-15 source before provenance establishment or external evaluation. No source rows were fabricated or edited by the implementation.

```sh
pnpm corners:data:build   # verify hashes, validate all seasons, write private normalized JSON
pnpm corners:model:build  # fit causally, write private audits and public aggregates
pnpm corners:build        # run both steps offline
```

Missing sources report every missing path. Malformed, checksum-mismatched, or non-converged inputs fail without replacing the public report with partial/fabricated results. Unit tests work without local source data; two local hash/audit/regeneration tests skip when those files are absent. The already generated public research report can render without distributing private data.

### Shared means and distributions

Both models use exactly the same jointly fitted mean structure:

```text
lambdaHome = exp(homeCornerAdvantage + cornerAttack_home + cornerDefenceWeakness_away)
lambdaAway = exp(cornerAttack_away + cornerDefenceWeakness_home)
sum(cornerAttack) = 0

corner-poisson-v1:
HC ~ Poisson(lambdaHome), AC ~ Poisson(lambdaAway), conditionally independent
log P(k;mu) = k log(mu) - mu - log(k!)

corner-negative-binomial-v1:
HC ~ NB2(lambdaHome,alpha), AC ~ NB2(lambdaAway,alpha), conditionally independent
alpha = exp(rawAlpha) > 0, r = 1/alpha
P(k;mu,alpha) = Gamma(k+r)/(Gamma(r) Gamma(k+1))
                 * (r/(r+mu))^r * (mu/(r+mu))^k
variance = mu + alpha * mu^2
```

Higher attack generates more corners; higher defence weakness concedes more. Home advantage affects only home lambda. Lexical teams and N−1 free attacks with the final attack derived structurally give 40 mean parameters for 20 teams; NB adds one global dispersion parameter. There is no post-fit recentering, team-specific dispersion, decay, prior-season history, regularisation, smoothing or shrinkage.

The local positive-real `logGamma` uses a standard nine-term g=7 [Lanczos approximation](https://www.boost.org/doc/libs/1_71_0/libs/math/doc/html/math_toolkit/lanczos.html), reflection below 0.5 and exact Gamma(1)/Gamma(2) identities. For integer counts, the NB Gamma ratio is evaluated by the equivalent rising-factorial identity with `log1p`, avoiding cancellation when alpha approaches zero:

```text
log P(k;mu,alpha) = k log(mu) - logGamma(k+1)
                    + sum(j=0..k-1) log1p(alpha*j)
                    - log1p(alpha*mu)/alpha - k log1p(alpha*mu)
```

Alpha near zero approaches Poisson; larger alpha permits greater conditional variance. Invalid/non-positive alpha, rates, likelihood contributions, gradients or probability states fail explicitly. No statistical library or new optimizer was added.

### Fitting, causality and frozen configuration

The existing **numeric@1.2.6 BFGS** minimizes mean joint negative log likelihood, weighting every strictly earlier within-season match equally. Poisson mean gradients are analytic. NB mean gradients for negative log likelihood are `(mu-k)/(1+alpha*mu)`; the rawAlpha derivative uses deterministic centered differences with fixed **epsilon 1e-5**, checked against full numerical gradients.

Every eligible date starts independently with all mean coordinates zero; NB starts at **alpha=0.1**, rawAlpha=log(0.1). No warm starts or random initialization. Prespecified convergence settings are 2,000 iterations, step tolerance 1e-10, mean-gradient L2 target 1e-6, relative objective tolerance 1e-10 for five stable accepted iterations. A finite valid final fit must meet a gradient, objective-stability or library step criterion. Failures abort; no skipped eligible fixture, substituted model, or stale parameters. Numerical convergence does not guarantee the global maximum. All stopping criteria and residual gradients remain in private audits and aggregate diagnostics.

Each season starts empty. Both target teams require two prior HOME and two AWAY appearances. A date with eligible fixtures fits each model once using all earlier matches, including prior warm-up skips. Both models and both benchmarks predict identical eligible IDs from that snapshot; only after the entire batch do its results enter history. No target-date score reaches fitting or prediction. The benchmarks are unsmoothed prior empirical total counts/Over rates and prior league-average home/away corner means through independent Poisson convolution.

All corner modules/configuration were SHA-256 locked before external evaluation. **V0.7 does not change model choices after viewing external-validation results.** The predeclared research preference uses only the external interval for Poisson RPS minus NB RPS: entirely positive → NB; entirely negative → Poisson; includes zero or unavailable → **NONE / INCONCLUSIVE**. No scanner promotion follows this label.

### Predictions and scoring

The total distribution is the exact convolution of independent home/away PMFs. Evaluation categories are **0,1,…,30,31+**, with ALL remaining mass retained as `1 - sum(P(0..30))` in 31+. There is no tail renormalization. Only rounding errors within 1e-10 may be resolved to a zero remainder; invalid mass otherwise fails. Over probabilities are calculated from the exact finite CDF at each line's integer boundary independently of the 30 cutoff.

Fixed lines are **Over 7.5, 8.5, 9.5, 10.5, 11.5, 12.5**; UNDER is the complement. Nine corners is UNDER 9.5, ten is OVER. Conventional binary Brier is `(pOver-yOver)^2` in [0,1], unlike the existing result-market three-component Brier in [0,2]. Do not compare their magnitudes as interchangeable scores.

Primary normalized RPS is `sum(k=0..30)(forecastCDF(k)-observedCDF(k))^2 / 31`. Brier measures the probability of a particular Over line; RPS measures the entire ordered count distribution. The paired primary advantage is **Poisson RPS − NB RPS**, positive favouring NB. Each dataset has a separate season-stratified, source-date-clustered paired percentile bootstrap with **5,000 resamples, seed 202607, 95% confidence**, using the unchanged project resampler and match-weighted means. Intervals do not capture all temporal dependence and are not betting evidence.

Each line separately retains observed frequency, both mean forecasts, four Briers, ten fixed calibration bins and both ECEs. Bins are [0,.1),…,[.9,1], with 1 in the last bin; ECE displays percentage points. Empty cohorts return null, not NaN. History depth reuses the minimum of four venue counts and unchanged 2–3 / 4–6 / 7–10 / 11–15 / 16+ buckets.

### Artifacts and verification

`src/lib/corners/` owns the independent model, likelihood, fitting, prediction, metrics, causality and aggregation. `scripts/corner-sources.mjs` performs local source verification. The data builder writes `data/private/generated/epl-corners-v07.json`; the model builder writes `data/private/generated/corners-v07-audit.json` and aggregate-only `src/data/generated/corners-v07-summary.json`. The latter is **77,886 bytes**, containing configuration/hash/runtime metadata, aggregate dataset/season/line/depth metrics, calibration bins, intervals, dispersion/fit diagnostics and research preference. It contains no source rows, actual per-match counts, predictions, team coefficients or market prices. `/corners` imports only this compact artifact and never fits models in Next.js or the browser.

Same source bytes, hashes, Node and dependency versions, and configuration produce byte-identical public JSON. Verified with Node 24.21.0 and numeric 1.2.6; no generation timestamps, random IDs or machine paths are embedded. Tests lock the specification, regenerate the full report locally, check privacy/ignored files, all paired/date/season boundaries, Gamma/PMF/CDF/gradient identities, RPS, line bins and frozen V0.6 results. Cross-Node aggregate comparisons use 12 decimal places; byte equality is required on the recorded Node version.

### Recorded corner results

The following tables are aggregate research results from the supplied, hash-verified private sources. The external research preference is **NONE / INCONCLUSIVE**. Both intervals include zero; NB's small development improvement does not generalize into a clear external RPS advantage. Both team-specific models have higher RPS than the simpler causal benchmarks on both datasets. Variance-to-mean is about 1.11, indicating modest descriptive overdispersion, which alone does not prove NB's conditional superiority. Per-line ECE remains material and line-dependent; these are not established calibrated betting probabilities. No post-validation adjustments were made.

| Dataset | Evaluated / skipped | Poisson RPS | NB RPS | NB advantage | 95% interval | Empirical RPS | League-Poisson RPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Development | 1688 / 212 | 0.065787 | 0.065676 | +0.000111 | [-0.000023, +0.000249] | 0.061962 | 0.061811 |
| External historical | 1691 / 209 | 0.066420 | 0.066423 | -0.000003 | [-0.000130, +0.000127] | 0.062166 | 0.061953 |

| Dataset | Season | Evaluated / skipped | Poisson RPS | NB RPS | NB advantage | Empirical RPS | League-Poisson RPS | Observed mean | Poisson mean | NB mean | Final alpha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Development | 2021-22 | 340 / 40 | 0.064503 | 0.064385 | +0.000117 | 0.062140 | 0.061899 | 10.365 | 10.592 | 10.594 | 0.034547 |
| Development | 2022-23 | 340 / 40 | 0.064220 | 0.064288 | -0.000068 | 0.059461 | 0.059266 | 10.129 | 10.033 | 10.036 | 0.056811 |
| Development | 2023-24 | 328 / 52 | 0.067084 | 0.067180 | -0.000096 | 0.065168 | 0.065056 | 10.835 | 10.757 | 10.757 | 0.057419 |
| Development | 2024-25 | 340 / 40 | 0.068124 | 0.067607 | +0.000517 | 0.063248 | 0.063091 | 10.259 | 10.749 | 10.749 | 0.081969 |
| Development | 2025-26 | 340 / 40 | 0.065051 | 0.064975 | +0.000076 | 0.059906 | 0.059860 | 10.047 | 9.912 | 9.913 | 0.052524 |
| External historical | 2014-15 | 340 / 40 | 0.068618 | 0.068739 | -0.000121 | 0.064399 | 0.064293 | 10.738 | 10.678 | 10.678 | 0.073486 |
| External historical | 2015-16 | 340 / 40 | 0.070077 | 0.069991 | +0.000086 | 0.065283 | 0.065011 | 10.938 | 10.621 | 10.622 | 0.053479 |
| External historical | 2016-17 | 337 / 43 | 0.066908 | 0.066868 | +0.000040 | 0.062554 | 0.062299 | 10.436 | 10.367 | 10.367 | 0.039170 |
| External historical | 2017-18 | 337 / 43 | 0.064315 | 0.064153 | +0.000162 | 0.060225 | 0.059913 | 10.205 | 10.484 | 10.486 | 0.046187 |
| External historical | 2018-19 | 337 / 43 | 0.062128 | 0.062310 | -0.000181 | 0.058323 | 0.058199 | 10.306 | 10.237 | 10.238 | 0.048225 |

| Dataset | Over | Observed % | Poisson predicted % | NB predicted % | Poisson Brier | NB Brier | League-Poisson Brier | Empirical Brier | Poisson ECE (pp) | NB ECE (pp) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Development | 7.5 | 78.02 | 78.67 | 76.49 | 0.18023 | 0.17969 | 0.17260 | 0.17219 | 7.19 | 5.93 |
| Development | 8.5 | 69.43 | 68.57 | 66.66 | 0.22694 | 0.22619 | 0.21208 | 0.21298 | 9.31 | 7.97 |
| Development | 9.5 | 58.18 | 57.38 | 56.09 | 0.26331 | 0.26141 | 0.24398 | 0.24439 | 10.49 | 9.69 |
| Development | 10.5 | 46.62 | 46.04 | 45.57 | 0.26446 | 0.26244 | 0.24903 | 0.24960 | 8.79 | 8.42 |
| Development | 11.5 | 34.42 | 35.42 | 35.77 | 0.23779 | 0.23619 | 0.22617 | 0.22645 | 8.30 | 7.53 |
| Development | 12.5 | 25.65 | 26.15 | 27.17 | 0.20093 | 0.19993 | 0.19016 | 0.19113 | 7.49 | 6.47 |
| External historical | 7.5 | 81.31 | 79.16 | 77.15 | 0.16338 | 0.16387 | 0.15238 | 0.15264 | 5.66 | 6.61 |
| External historical | 8.5 | 71.97 | 69.31 | 67.48 | 0.21684 | 0.21682 | 0.20231 | 0.20314 | 8.00 | 8.59 |
| External historical | 9.5 | 60.20 | 58.32 | 57.00 | 0.25799 | 0.25674 | 0.24033 | 0.24175 | 10.62 | 10.41 |
| External historical | 10.5 | 48.20 | 47.08 | 46.49 | 0.27149 | 0.26966 | 0.25056 | 0.25206 | 12.34 | 11.07 |
| External historical | 11.5 | 36.43 | 36.45 | 36.62 | 0.24862 | 0.24700 | 0.23188 | 0.23285 | 10.17 | 9.30 |
| External historical | 12.5 | 26.85 | 27.08 | 27.90 | 0.21346 | 0.21248 | 0.19743 | 0.19802 | 9.12 | 8.74 |

| Dataset | Depth | Matches | Poisson RPS | NB RPS | NB advantage |
| --- | --- | --- | --- | --- | --- |
| Development | 2–3 | 200 | 0.076591 | 0.076546 | +0.000045 |
| Development | 4–6 | 311 | 0.069353 | 0.069222 | +0.000131 |
| Development | 7–10 | 407 | 0.064606 | 0.064270 | +0.000336 |
| Development | 11–15 | 497 | 0.062414 | 0.062362 | +0.000051 |
| Development | 16+ | 273 | 0.061713 | 0.061805 | -0.000092 |
| External historical | 2–3 | 200 | 0.078359 | 0.078359 | -0.000000 |
| External historical | 4–6 | 323 | 0.070485 | 0.070287 | +0.000198 |
| External historical | 7–10 | 401 | 0.065438 | 0.065418 | +0.000020 |
| External historical | 11–15 | 516 | 0.061846 | 0.061989 | -0.000143 |
| External historical | 16+ | 251 | 0.062647 | 0.062659 | -0.000012 |

| Dataset | Source matches | Mean | Population variance | Variance / mean | Poisson / NB successful fits | Failures | Alpha min / median / max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Development | 1900 | 10.3326 | 11.4915 | 1.1122 | 522 / 522 | 0 | 1.541e-11 / 0.034937 / 0.081969 |
| External historical | 1900 | 10.4974 | 11.7079 | 1.1153 | 458 / 458 | 0 | 1.820e-11 / 0.036448 / 0.098866 |

Exact manually supplied input hashes:

| Season | Private local filename | SHA-256 |
| --- | --- | --- |
| 2014-15 | 1415-E0.csv | `76b7858051ff6b17f46f49f26fdc70c1f29537270492606f5cc63d67fad5d149` |
| 2015-16 | 1516-E0.csv | `bd3502a18c38a1597fd9af62e2366b4015006d3528dd4d18b311bd6237bbc085` |
| 2016-17 | 1617-E0.csv | `9625a7652b5f98fbd3e2e4d378c851fc246693f3343e34a72428d5b6e864d3e0` |
| 2017-18 | 1718-E0.csv | `4f3389365ef3f7ac966764ed8ba67cf3b79f5aebed18dd224099c4b2c98bc67b` |
| 2018-19 | 1819-E0.csv | `7c096b3c2ecd54c6993d22eeea73450c2bde11e3457238b226b8f43c62dfc35e` |
| 2021-22 | 2122-E0.csv | `335afcbabeb2939fa10ab39ba3e8215072d0b577cb8d0705c1e44c56e934e703` |
| 2022-23 | 2223-E0.csv | `8442792d3b614c94ea3cf381bd2736805889cc1713169035368fff19c3d02380` |
| 2023-24 | 2324-E0.csv | `b2e057b0ed959f198b0f63d2391c01239f3608e6de5db68edab3f88e04d07ff3` |
| 2024-25 | 2425-E0.csv | `d0c8ce4a96d886cf60cf101f570f4a3893844226f91c7bd769eb568c49edbfa4` |
| 2025-26 | 2526-E0.csv | `3e3a8352f9ada6789c508d6ca184424421fed56a30400904a4a327c583407e62` |


### Corner limitations

Premier League only, raw corner counts, within-season history, no prior-season priors, shrinkage, regularisation or time decay; sparse early fits; possible local optimization/near-zero-dispersion instability; conditional home/away independence; empirical dispersion includes between-match variation; ten-bin ECE depends on binning; fixed ordered category support coarsens all 31+ counts but retains their probability. Corner research includes no prices, profitability or recommendations and remains frozen in V0.8.

## V0.8 historical 1X2 market value

The question is whether **already recorded `dixon-coles-v1` probabilities** identify positive realised value in the ten pinned historical Bet365 price files. V0.8 never fits or regenerates predictions from Football-Data rows. [The typed adapter](src/lib/value/frozen-predictions.ts) projects fixture identity, season, source date, HOME/DRAW/AWAY probabilities, recorded Brier and authoritative actual outcome from `model-comparison-v06.json`. Its SHA-256 remains `deb9fac92ebd104fcc15cf713b5e2600cfba5e56a8f58b30d219f469dccf8262`.

```text
Gitignored CSVs + immutable V0.7 hashes
    → six-field projection → complete-season checks → explicit identity alignment
    → private normalized prices
Recorded V0.6 Dixon–Coles forecasts + aligned historical prices
    → market maths → outcome-free paper selection → V0.6 outcome settlement
    → separate cohort diagnostics / bootstrap
    → private row audit + compact public aggregate → /value
```

### Source definition, timing and privacy

Only **Date, HomeTeam, AwayTeam, B365H, B365D, B365A** are extracted. `B365H/D/A` are home/draw/away decimal prices. No result, goal, corner, card, shot or referee columns enter V0.8. Settlement uses the V0.6 actual outcome. All C-suffixed `B365CH/CD/CA`, other bookmaker, market-average/maximum, exchange, handicap and totals prices are ignored; there is no best-bookmaker substitution or closing-line-value calculation.

These are **historical Bet365 non-closing 1X2 source prices**, not a uniformly timed pre-kickoff quote. Football-Data’s collection convention differs across eras, so there is no perfectly uniform number of minutes before kickoff. Excluding later-season C-suffixed closing fields keeps the same named field family throughout the ten-season experiment; it does not remove historical collection-timing differences.

The same ten user-supplied `data/private/football-data/*-E0.csv` files remain unchanged. The [V0.7 manifest](data/provenance/football-data-corners-v07.json) hashes above are verified on every build, never replaced. No downloads or Football-Data network requests occur. Every season passes **380 complete priced matches / 20 teams / 19 home and 19 away matches per team**. Missing/malformed required prices abort generation with exact season, CSV record and affected column; rows are never dropped and another bookmaker is never substituted.

[Explicit aliases](src/lib/value/aliases.ts), including `Man United → Manchester United [FC]`, resolve only against that season’s canonical team identities. They retain OpenFootball’s era-specific labels through listed alternatives, without fuzzy matching or suffix inference. Alignment uses only **season + normalized source date + home team + away team**, is order invariant, and rejects unknown/ambiguous aliases, duplicate or unmatched fixtures. Dates use the existing noon-UTC source-date key, not an invented kickoff time. All ten seasons align **380/380**; every **1,688 recent** and **1,691 older** eligible V0.6 record has exactly one valid price triplet. No additional forecasts or changed warm-up eligibility are introduced.

Normalized prices are written to `data/private/generated/value-v08-prices.json`; detailed joins, probability triplets, odds, selections, actual outcomes and settlements go to `data/private/generated/value-v08-audit.json`. Both are gitignored with the raw CSVs. [The public artifact](src/data/generated/value-v08-summary.json) contains only configuration, input hashes, aggregate coverage, metrics, bootstrap intervals and diagnostic groups: **35,212 bytes**, below 150 KB. There are no per-match picks, individual prices or team-level price records. Rendering reads this public artifact only and runs no optimiser or bootstrap.

```sh
pnpm value:data:build   # verify hashes, parse six fields, validate/align all seasons
pnpm value:model:build  # verify private prices, consume frozen V0.6, evaluate both cohorts
pnpm value:build        # both stages, entirely offline
```

With identical source bytes, V0.6 artifact, Node/dependency versions and configuration, both aggregate and private audit regenerate byte-for-byte. No timestamps, absolute machine paths or random IDs appear. Tested under Node **24.21.0**. The price-evaluation implementation and protocol were SHA-256 locked before the first valid ten-season profitability result: `f05feb53bcf54b2c9c887404db2d9d8e1a0784e646640db6a10e200437949c31`.

### Fixed maths and paper rule

```text
raw implied_i = 1 / offered decimal odds_i
overround = sum(raw implied_H,D,A) − 1
fair market probability_i = raw implied_i / sum(raw implied_H,D,A)
expected ROI_i = frozen model probability_i × offered decimal odds_i − 1
fair-market edge_i = frozen model probability_i − fair market probability_i
```

Odds must be finite numeric values strictly greater than one. Probabilities are fractions in [0,1]; triplets sum to one. Proportional normalization is the sole margin-removal method. Overround is descriptive, not a filter. Expected ROI and settlement use the **raw offered prices**. Fair-market edge is a disagreement diagnostic, not the selection threshold.

The sole rule, declared and tested before profitability was viewed, is **expected ROI ≥0.02 (2%)**, with **at most one selection per match**: highest expected ROI, then larger fair-market edge, then HOME/DRAW/AWAY. If none qualifies, NO BET. No threshold grid, odds-range/outcome/team/season exclusions or strategy variants are calculated. Selection receives only model probabilities and prices; it rejects settlement fields. Selection is completed before the actual outcome settles it.

Each selected paper bet stakes exactly **one unit**. Win: return offered odds, profit odds−1. Loss: return zero, profit −1. No bet: zero stake, return and profit. Total ROI = net profit / total stakes; zero stakes produce null ROI. No bankroll, Kelly, variable sizing or annualisation is introduced. Maximum drawdown starts at zero cumulative profit and measures the largest prior-peak-to-later-trough decline in units, in deterministic season/source-date/fixture-ID order; recovery does not erase a prior maximum.

Brier uses the existing **three-class sum** of squared probability errors, range 0–2, without division by three, on exactly the same eligible matches for both forecasts. Advantage = **fair-market Brier − Dixon–Coles Brier**, so positive favours the model. Brier asks “Are the probability forecasts better?” ROI asks “Would the fixed price-selection rule have made money at these historical prices?” Better Brier can lose money; worse overall Brier can identify a profitable subset. Neither metric forces the other to agree.

Both uncertainty calculations separately use **5,000 season-stratified, source-date-clustered paired resamples, seed 202608, 95% percentile intervals**. Match-weighted Brier differences retain the model/market pairing. ROI resamples the **original evaluated clusters**, retaining all selected bets and no-bets, and computes replicate profit / replicate stakes without reselecting or tuning. Same-date matches stay together and each season retains its original number of clusters. Linear percentile interpolation uses `(n−1)*p`. Any zero-stake replicate makes the entire ROI interval unavailable with its count reported; it is never silently omitted. Neither real cohort has any zero-stake replicate.

Predeclared status: both ROI lower bounds **strictly >0** → `HISTORICAL_PAPER_EDGE_SUPPORTED`; both upper bounds **strictly <0** → `HISTORICAL_PAPER_EDGE_NEGATIVE`; otherwise → **INCONCLUSIVE**. Exactly zero or unavailable bounds are inconclusive. The status never authorises real-money betting.

### Historical results with the unchanged protocol

| Metric | RECENT PRICE EVALUATION 2021–26 | OLDER PRICE EVALUATION 2014–19 |
| --- | ---: | ---: |
| Evaluated / priced coverage | 1,688 / 100% | 1,691 / 100% |
| Dixon–Coles Brier | 0.60962148 | 0.59313328 |
| Fair-market Brier | 0.57602936 | 0.55899142 |
| Model Brier advantage | −0.03359212 | −0.03414186 |
| Advantage 95% interval | [−0.04323060, −0.02409045] | [−0.04431604, −0.02458121] |
| Paper bets / no-bet matches | 1,480 / 208 | 1,543 / 148 |
| Bet frequency | 87.68% | 91.25% |
| Wins / losses / strike rate | 533 / 947 / 36.01% | 545 / 998 / 35.32% |
| Stakes / returned units | 1,480 / 1,409.89 | 1,543 / 1,428.22 |
| Net profit units | −70.11 | −114.78 |
| Realised ROI | −4.74% | −7.44% |
| ROI 95% interval | [−12.24%, +2.85%] | [−14.51%, −0.19%] |
| Maximum drawdown units | 97.60 | 119.71 |
| Average selected odds | 3.445 | 3.759 |
| Average selected model / fair probability | 46.54% / 35.88% | 45.34% / 35.54% |
| Average selected fair-market edge | +10.66 pp | +9.80 pp |
| Average estimated expected ROI | +27.44% | +30.35% |
| Overround mean / median | 5.45% / 5.39% | 2.88% / 2.62% |
| Overround minimum / maximum | 3.27% / 16.67% | 1.69% / 7.21% |
| Mean fair HOME / DRAW / AWAY | 44.05% / 23.69% / 32.26% | 44.78% / 24.58% / 30.64% |
| Estimated EV maximum / p95 / p99 | 208.28% / 75.18% / 131.06% | 543.83% / 90.52% / 140.28% |
| Selected bets with estimated EV ≥20% | 727 | 767 |

**INCONCLUSIVE** follows the exact predeclared rule: recent ROI bounds cross zero, older bounds are below zero; the rule’s “both negative” branch does not apply. Both observed paper returns are negative and both Brier intervals favour fair-market probabilities. This experiment does not support a historical paper edge under the fixed rule. The unusually large estimated EVs and frequent selections, despite realised losses, suggest substantial model/price disagreement and potentially poor calibration; extremes were retained, not removed after inspection.

| Season | Priced | Bets | Frequency | Wins / losses | Avg odds | Avg estimated EV | Profit units | ROI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | 340 | 314 | 92.35% | 106 / 208 | 3.744 | 30.31% | −31.18 | −9.93% |
| 2015-16 | 340 | 319 | 93.82% | 111 / 208 | 3.726 | 38.13% | +15.42 | +4.83% |
| 2016-17 | 337 | 312 | 92.58% | 109 / 203 | 3.998 | 26.62% | −42.90 | −13.75% |
| 2017-18 | 337 | 306 | 90.80% | 111 / 195 | 3.556 | 30.70% | −21.89 | −7.15% |
| 2018-19 | 337 | 292 | 86.65% | 108 / 184 | 3.768 | 25.48% | −34.23 | −11.72% |
| 2021-22 | 340 | 297 | 87.35% | 115 / 182 | 3.209 | 30.25% | −20.98 | −7.06% |
| 2022-23 | 340 | 299 | 87.94% | 123 / 176 | 3.172 | 27.86% | +8.08 | +2.70% |
| 2023-24 | 328 | 275 | 83.84% | 87 / 188 | 3.754 | 25.17% | −52.70 | −19.16% |
| 2024-25 | 340 | 300 | 88.24% | 104 / 196 | 3.734 | 29.00% | +12.07 | +4.02% |
| 2025-26 | 340 | 309 | 90.88% | 104 / 205 | 3.379 | 24.86% | −16.58 | −5.37% |

| Cohort | Selected outcome | Bets | Wins | Avg odds | Avg estimated EV | Profit units | ROI |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Recent | HOME | 569 | 255 | 2.728 | 25.61% | −24.79 | −4.36% |
| Recent | DRAW | 322 | 82 | 4.428 | 24.27% | +26.99 | +8.38% |
| Recent | AWAY | 589 | 196 | 3.600 | 30.95% | −72.31 | −12.28% |
| Older | HOME | 533 | 260 | 2.753 | 24.29% | +7.96 | +1.49% |
| Older | DRAW | 323 | 70 | 4.382 | 22.69% | −43.53 | −13.48% |
| Older | AWAY | 687 | 215 | 4.246 | 38.64% | −79.21 | −11.53% |

**Post-hoc diagnostic buckets; not used for selection.** All four were fixed before results; no group is excluded from the primary strategy.

| Cohort | Estimated EV bucket | Bets | Avg odds | Avg estimated EV | Profit units | Realised ROI |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Recent | 2–<5% | 149 | 2.913 | 3.49% | −20.56 | −13.80% |
| Recent | 5–<10% | 230 | 2.640 | 7.41% | +18.03 | +7.84% |
| Recent | 10–<20% | 374 | 3.168 | 14.81% | −0.81 | −0.22% |
| Recent | 20%+ | 727 | 3.951 | 45.19% | −66.77 | −9.18% |
| Older | 2–<5% | 121 | 2.851 | 3.37% | +15.95 | +13.18% |
| Older | 5–<10% | 251 | 2.927 | 7.38% | +1.56 | +0.62% |
| Older | 10–<20% | 404 | 3.106 | 14.59% | −22.15 | −5.48% |
| Older | 20%+ | 767 | 4.519 | 50.41% | −110.14 | −14.36% |

### Interpretation and deviations

Neither price cohort is a pristine future holdout: their outcomes were already inspected in V0.6. Prices did not enter model fitting, and the model and paper rule were frozen before V0.8 profitability was viewed. Those safeguards reduce price-based tuning but do not create a live forward test or establish future profitability. Date-cluster resampling is conditional on these ten historical seasons, and does not capture every serial dependency, execution restriction or quote-timing difference.

No source or research-protocol deviations occurred. A TypeScript parameter-property syntax issue was corrected for Node’s strip-only mode before the first valid full evaluation; it did not change data or calculations. After the first valid ten-season result, all price columns, aliases, formulas, cohorts, 2% threshold, tie-breaking, unit stakes, bootstrap settings/method and diagnostic buckets remained unchanged. No threshold search, outcome filtering, corners betting, CLV or future milestone is implemented.

## V0.9 probability calibration and market residual research

V0.8 showed that Dixon–Coles improves on `poisson-v1` but remains behind Bet365 fair-market probabilities. Its fixed paper strategy lost money, including many selections with very optimistic estimated EV. V0.9 asks whether **simple probability calibration**, chosen without markets or recent outcomes, closes that scoring gap. It does not calculate a calibrated betting strategy, threshold variant, profit, ROI, drawdown or staking rule.

### Frozen input and separation of roles

The sole forecast source is the already recorded [V0.6 artifact](src/data/generated/model-comparison-v06.json). [The adapter](src/lib/calibration/records.ts) projects only fixture ID, season, source date, frozen HOME/DRAW/AWAY probabilities and actual outcome. Goals, team names, attack/defence parameters, fitted Dixon–Coles parameters, prices and V0.8 paper outcomes never enter calibration. The fitting API accepts only probability triplet + outcome; metadata is used to order, partition and pair records, never as a feature. The existing statistical models and fictional scanner remain unchanged.

Roles are fixed before evaluation: **2014-15 → 2018-19** supplies **1,691 calibration development records**; **2021-22 → 2025-26** supplies **1,688 HISTORICAL CALIBRATION VALIDATION records**. Recent outcomes never choose or fit a candidate. Both cohorts’ outcomes appeared in earlier research, so neither is pristine unseen football data or a future holdout. This older-to-later protocol protects against validation-based calibration tuning; it does not erase prior inspection or establish future performance.

```text
Frozen older V0.6 triplets + outcomes
    → four rolling-origin folds → candidate Brier / paired intervals
    → fixed family selection → selected family fit once on all older records
    → immutable final calibration parameters
Frozen recent V0.6 triplets
    → one fixed calibration map → recent scoring against actual outcomes
    → only then attach verified V0.8 fair-market benchmark
    → scores / ECE / sharpness / fixed diagnostic slices / residuals
    → private audit + compact public aggregate → /calibration
```

### Exactly three fixed candidates

**Identity (`identity`)** returns `q=p` exactly, with no fitted parameters.

**Temperature (`temperature-v1`)** uses one parameter, initialized at `rawTemperature=0`, so `T=exp(rawTemperature)=1`. It computes `q=softmax(log(p)/T)`. `T>1` softens confidence, `T<1` sharpens it; class ordering is preserved. A numerically unrepresentable ordering is an explicit failure.

**Multinomial logistic (`multinomial-logit-v1`)** uses AWAY as reference and exactly six coefficients:

```text
x = (1, log(pHOME/pAWAY), log(pDRAW/pAWAY))
logitHOME = bH0 + bH1*x1 + bH2*x2
logitDRAW = bD0 + bD1*x1 + bD2*x2
logitAWAY = 0
q = softmax(logits)
initial coefficients = (0,1,0; 0,0,1)       # identity map
```

Log ratios are evaluated as differences of logs to avoid ratio overflow. Softmax subtracts the maximum logit. Every input/output triplet must be finite, strictly inside `(0,1)` and sum to one within `1e-10`. All 3,379 frozen vectors pass; no clipping or epsilon is used. Invalid/non-finite objectives, gradients, parameters, underflow/boundary probabilities or failed convergence abort generation without skipping, retrying another initialization or falling back to identity.

Both fitted candidates minimise **mean multiclass natural-log loss**, `−log(q_actual)`, with analytic gradients. Temperature gradient is `logit_actual − Σq_i*logit_i` with respect to raw temperature. Logistic gradients are `(q_c−y_c)*x` for HOME/DRAW. Reuse **numeric@1.2.6 / BFGS**: maximum **2,000 iterations**, step tolerance **1e-10**, mean gradient tolerance **1e-8**, relative objective tolerance **1e-10** for **five** stable iterations. Library step convergence is separately recorded if used; the iteration cap fails. All eight actual fold fits converged by gradient norm. Training examples are canonically sorted by probability values and outcome for input-order invariance. No market blending, regularisation, team/season features or additional calibrators are introduced.

### Rolling-origin selection, before recent evaluation

| Fold | Train | Train records | Validate | Validation records | Fitted T | Logit iterations / gradient norm |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| 1 | 2014-15 | 340 | 2015-16 | 340 | 1.4891187094 | 30 / 8.3034e-9 |
| 2 | 2014-15 + 2015-16 | 680 | 2016-17 | 337 | 1.9444954432 | 30 / 5.3526e-9 |
| 3 | 2014-15 through 2016-17 | 1,017 | 2017-18 | 337 | 1.5434268374 | 30 / 3.4519e-9 |
| 4 | 2014-15 through 2017-18 | 1,354 | 2018-19 | 337 | 1.6349758670 | 30 / 1.3225e-9 |

All candidates score the same **1,351 out-of-sample validation fixtures** from 2015-16 through 2018-19; 2014-15 is training-only. Each fitted candidate starts fresh in every fold. Temperature uses 7/8/7/7 iterations, with gradient norms from `1.8409e-11` to `3.2748e-10`. Fold temperature range: **1.4891187094–1.9444954432**. Logit objective/parameters/iterations/gradients and all fold scores are public aggregate diagnostics.

The primary score is the existing **three-class Brier sum**, range 0–2, without division by three. Advantage = identity Brier − candidate Brier; positive favours calibration. Paired season-stratified, source-date-clustered bootstrap uses **5,000 samples, seed 202609, 95% percentile bounds**, retaining fixture/outcome pairs and date clusters. Fits stay fixed during resampling. A candidate is eligible only when its advantage lower bound is **strictly positive**. Select the only eligible candidate, or the larger observed advantage if both qualify; ties within **1e-12** prefer temperature. If neither qualifies, retain identity. No recent or market score enters selection; log loss is secondary.

| Candidate | Rolling Brier | Rolling log loss | Brier advantage | 95% interval | Eligible |
| --- | ---: | ---: | ---: | --- | --- |
| Identity | 0.58683971 | 1.02237514 | 0 | [0,0] | Baseline |
| Temperature | 0.58880398 | 1.00819742 | −0.00196427 | [−0.00932456, +0.00565472] | No |
| Multinomial logistic | 0.58329456 | 0.99839025 | +0.00354516 | [−0.00608857, +0.01281448] | No |

**Selected family: IDENTITY.** Neither non-identity interval lower bound is above zero. The final older stage has **1,691 records, no fitted parameters, zero optimiser iterations, NO_FIT**, and identity mean log loss **1.0249149094**. No unselected candidate is fitted on all older records or evaluated on recent seasons. A selected non-identity map would instead be fitted once on all older records and kept fixed across all recent seasons.

### Recent historical validation and market benchmark

Only after calibrated probabilities exist are V0.8 sources revalidated and attached as a benchmark. The ten original hashes, six-field parser, explicit fixture aliases, 380/380 joins, **B365H/B365D/B365A non-closing source-price family** and proportional normalization are reused unchanged. No C-suffixed or other bookmaker prices are used; collection timing remains non-uniform across eras. All **1,688 recent forecasts** receive the same V0.8 benchmark. Markets, overround, V0.8 outcome profitability and paper selections never enter fitting or family selection.

| Recent metric | Raw Dixon–Coles | Selected calibrated (identity) | Bet365 fair market |
| --- | ---: | ---: | ---: |
| Brier | 0.60962148 | 0.60962148 | 0.57602936 |
| Natural-log loss | 1.02266241 | 1.02266241 | 0.96857513 |
| Top-pick accuracy | 51.07% | 51.07% | 54.80% |
| Top-confidence ECE | 6.37% | 6.37% | 2.60% |
| HOME ECE | 6.92% | 6.92% | 2.21% |
| DRAW ECE | 4.06% | 4.06% | 1.41% |
| AWAY ECE | 6.21% | 6.21% | 1.56% |
| Mean maximum probability | 57.06% | 57.06% | 53.91% |
| Mean entropy (nats) | 0.92115283 | 0.92115283 | 0.97155641 |

Recent raw-minus-calibrated advantage is **0**, interval **[0,0]**. Market-minus-raw and market-minus-calibrated advantage are both **−0.03359212**, interval **[−0.04323517, −0.02410229]** under seed 202609. These V0.9 intervals do not replace the differently seeded V0.8 artifact.

Market-gap closure = `(rawBrier−calibratedBrier)/(rawBrier−marketBrier)` when the raw gap is positive; otherwise null. Here **0%** is closed and the full **0.03359212** Brier gap remains. Negative closure would mean widening; above 100% would mean beating the market. No cap or misleading fallback is applied.

The predeclared validation status is **IDENTITY_RETAINED**. For a selected non-identity map, a recent advantage lower bound >0 would give `CALIBRATION_IMPROVEMENT_SUPPORTED`, upper bound <0 would give `CALIBRATION_HARM_SUPPORTED`, otherwise `INCONCLUSIVE`, including exactly-zero bounds. Only supported non-identity improvement permits the separate research label `dixon-coles-calibrated-v1`. **No new model is promoted here.** The underlying `dixon-coles-v1` remains immutable.

| Recent season | Matches | Raw = selected Brier | Market Brier | Raw = selected log loss | Market log loss |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 340 | 0.60773435 | 0.56221880 | 1.02401253 | 0.94875809 |
| 2022-23 | 340 | 0.60290470 | 0.57207845 | 1.01297111 | 0.96491693 |
| 2023-24 | 328 | 0.58090600 | 0.54315631 | 0.98442729 | 0.92292551 |
| 2024-25 | 340 | 0.60884269 | 0.58476886 | 1.01118044 | 0.97910508 |
| 2025-26 | 340 | 0.64670620 | 0.61676415 | 1.07937120 | 1.02555887 |

### Fixed calibration, confidence and residual diagnostics

Classwise and top-confidence calibration use **ten bins** `[0,.1), [.1,.2), …, [.9,1]`, with 1.0 in the final bin for the generic helper. Classwise ECE = `Σ binCount/N * abs(mean probability−observed frequency)`. Top-confidence ECE substitutes the top-pick confidence and correctness. Empty bins report null means/frequencies; counts sum to N separately for every forecast/outcome. The page exposes all bin tables in a disclosure. Sharpness is described by mean max probability and positive entropy `−Σp log p`, without treating greater confidence as better accuracy.

Raw-confidence buckets were fixed before results and use the raw top probability. Selected confidence/Brier equals raw because identity was retained.

| Raw-confidence bucket | Matches | Raw = selected confidence | Raw accuracy | Raw = selected Brier | Market Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1/3–<0.40 | 192 | 37.92% | 39.58% | 0.65898107 | 0.62768147 |
| 0.40–<0.50 | 472 | 44.95% | 39.19% | 0.67450229 | 0.64354294 |
| 0.50–<0.60 | 392 | 54.63% | 52.81% | 0.60621546 | 0.59685331 |
| 0.60–<0.70 | 282 | 65.03% | 58.87% | 0.56802687 | 0.51735804 |
| 0.70–<0.80 | 191 | 74.21% | 58.64% | 0.59538384 | 0.55749295 |
| 0.80–1.00 | 159 | 87.34% | 72.96% | 0.45668719 | 0.38822535 |

Market-disagreement buckets use the raw **maximum absolute class difference per fixture**. The calibrated comparison uses that same maximum-absolute metric, averaged across fixtures, so both columns share a norm. These are diagnostic slices, never fitting targets or strategy filters.

| Raw disagreement | Matches | Raw = selected Brier | Market Brier | Raw = selected mean absolute disagreement |
| --- | ---: | ---: | ---: | ---: |
| <5 pp | 432 | 0.58408456 | 0.58463542 | 3.10 pp |
| 5–<10 pp | 521 | 0.54325073 | 0.53774881 | 7.45 pp |
| 10–<20 pp | 549 | 0.62375232 | 0.58189707 | 14.22 pp |
| 20+ pp | 186 | 0.81313376 | 0.64594859 | 27.03 pp |

| Outcome | Raw = selected mean signed residual | Raw = selected mean absolute difference |
| --- | ---: | ---: |
| HOME | −0.14 pp | 9.02 pp |
| DRAW | −0.50 pp | 4.48 pp |
| AWAY | +0.64 pp | 7.90 pp |

### Artifacts, reproducibility and interpretation

```sh
pnpm calibration:model:build  # verify frozen artifacts, select/fit older, validate recent, attach benchmark
pnpm calibration:build        # existing value:data:build, then calibration:model:build
```

[Public calibration summary](src/data/generated/calibration-v09-summary.json): **59,073 bytes**, including configuration, frozen hashes, fold parameters/diagnostics, candidate scores/intervals, final parameters, validation metrics/bins/slices and status. No fixture identities, outcomes, individual probability triplets, odds or team names are published. `data/private/generated/calibration-v09-audit.json` retains **1,351 rolling-fold + 1,688 recent records** and is gitignored. React imports only aggregate data; no optimiser, private source or audit enters the page dependency graph.

The code/protocol fingerprint fixed before the historical calibration run is `f12d9ba47a45a9d69693d698d2453ba40a6c5ef242c3e9eab21a164ee4262e65`. Source versions, fixed initialization, deterministic example ordering, Node **24.21.0**, numeric **1.2.6**, fixed seed, JSON order/newline and absence of timestamps/absolute paths/random IDs make regeneration deterministic. Tests reproduce the public artifact and private audit byte-for-byte. V0.6/V0.7/V0.8 artifact hashes remain exact; no dependency was added.

Raw Dixon–Coles shows meaningful calibration problems: high-confidence buckets overstate observed accuracy, and classwise/top-confidence ECE exceeds the market’s. All fitted fold temperatures soften forecasts and both candidates improve pooled secondary log loss. However temperature worsens pooled Brier, and multinomial Brier gains are not robustly separated from zero under the predeclared development interval. These results **do not establish that calibration is the primary cause of the market gap**, or that either simple map fixes it out of sample. Identity is retained, no gap is closed, and neither candidate is tried on recent seasons after its failure to qualify. Historical dependence, prior outcome inspection, four folds and fixed-bin ECE limit interpretation.

No source, fitting or selection-protocol deviations occurred. The pre-evaluation interpretation choice for calibrated market disagreement is explicitly recorded as the same per-fixture maximum absolute class norm as raw disagreement. No V0.9 betting metrics or altered V0.8 strategy were calculated. No V1.0 work is implemented.

## Fictional scanner value analysis and ranking

Only `MATCH_WINNER` is supported. A quote's selection chooses its probability from the independent prediction:

- `HOME` → `homeProbability`
- `DRAW` → `drawProbability`
- `AWAY` → `awayProbability`

The V0.1 formulas and ranking rules are retained:

```text
implied probability = 1 / decimalOdds
edge = modelProbability - impliedProbability
expected ROI = modelProbability × decimalOdds - 1
qualification = edge >= minimumEdge      (default 0.02)
ranking = expected ROI descending, then opportunity/quote ID ascending for exact ties
```

All probabilities and thresholds are fractions in [0, 1] internally. Edge is displayed in percentage points, while ROI is a percentage. For odds `2.14` and probability `0.50`, expected ROI remains `0.07` (7%). Display rounding does not affect calculations, filtering, or ranking. The inclusive threshold comparison retains V0.1's one-machine-epsilon allowance for subtraction noise.

Raw implied probabilities are used directly: there is no bookmaker-margin removal or exchange-commission adjustment. Multiple selections from one fixture are analysed independently; this is not a staking or portfolio model.

## Validation

Invalid model or market inputs throw `RangeError` rather than being silently skipped or replaced:

- Empty profile datasets; blank or duplicate team identities
- Zero, negative, fractional, non-finite, or unsafe match counts
- Negative, fractional, non-finite, or unsafe goal totals
- Aggregate totals beyond safe integer precision, or zero/non-finite league baselines
- Invalid fixture identities, self matches, missing/mismatched team profiles, or duplicate fixture IDs
- Negative/non-finite expected goals or unusable score-grid probability mass
- Invalid prediction probabilities, a probability sum more than `1e-10` from 1, or blank model versions
- Invalid/duplicate quote IDs, unknown or mismatched fixture references, unsupported markets/selections, or non-finite decimal odds ≤ 1
- Invalid thresholds outside [0, 1] or non-finite analysed values supplied to ranking

History validation additionally rejects duplicate match IDs, self-matches, blank identities, invalid final scores, malformed timestamps, invalid calendar dates, and invalid venue minimums. Timestamps must include seconds and an explicit `Z` or numeric timezone offset; optional fractional seconds have at most millisecond precision. Metric helpers reject invalid outcome probabilities or calibration observations. Insufficient venue history is the explicit skip case, not an exception.

Venue totals need not balance for arbitrary caller-supplied historical samples; the supplied fictional league does balance. The pipeline accepts an empty or partial quote list, while the bundled dataset supplies every outcome for every fixture. It never invents a missing price or prediction.

## Retained poisson-v1 / V0.5 limitations

The model ignores:

- Recent form weighting
- Player availability
- Expected-goals (xG) data
- Strength of schedule
- Promotions/relegations
- Lineup changes
- Injuries
- Market margin
- Exchange commission

It also assumes independent, constant-rate Poisson scoring. Real scorelines can show dependence, changing match states, low-score effects, and variance that this model does not capture. Small aggregate samples have no shrinkage or priors; V0.5 estimates uncertainty in pooled comparative performance, not individual predicted probabilities. The fixed 0–10 grid conditions away the discarded goal tails. Zero observed scoring rates can produce extreme probabilities.

V0.5 evaluates the frozen model without fitting, tuning, or adjusting its predictions. It uses raw goals rather than xG, with no opponent-strength adjustment, recency weighting, prior-season carryover, promoted-team priors, shrinkage, or player/injury information. Season resets discard potentially useful established-club history, and warm-up excludes early fixtures; metrics apply to the eligible subset only.

Five seasons from one league provide limited evidence, and match outcomes are not independent experimental samples. The paired intervals cross zero, despite positive pooled and leave-one-season-out skill. ECE depends on binning; top-pick and the three one-vs-rest ECEs answer different questions. Passing causal tests does not establish model quality. The fictional scanner prices remain artificial; the retained V0.5 backtest has no historical odds or profitability metrics. V0.8 adds a separate, unchanged-model price evaluation.

V0.5 supplied the development evidence motivating the separately versioned V0.6 comparison: uncertain pooled gains, positive season-exclusion estimates, improving history-depth performance, and weaker DRAW forecasts. V0.6 preserves those recorded results and uses the already requested older seasons for an external check. Future result-model changes require separate scope and fresh prespecified evaluation; V0.6 remains frozen and V0.7 corner research is evaluated independently.

## Verification

```sh
pnpm data:build
pnpm model:build
pnpm corners:build
pnpm value:build
pnpm calibration:build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:watch` runs Vitest in watch mode. All **374 V0.1–V0.8 tests** remain intact. V0.9 adds **137 tests across five files** covering strict probabilities/softmax, both transforms and initializations, analytic/numerical gradients, deterministic fits and explicit failure, rolling causality/coverage, older-only selection/final fit, market isolation, proper scores, ECE bins, sharpness, confidence/disagreement boundaries, paired bootstrap, gap closure, conditional research naming, artifact privacy/frozen hashes and byte-for-byte regeneration. Total: **511 tests**. Real private-source checks run when local files are present; synthetic and committed aggregate checks do not require them. No dependencies were added.

If an execution sandbox blocks Turbopack's local CSS-worker port, `pnpm build --webpack` is the supported alternative for verifying the production build; the project's default bundler remains unchanged.

V0.8 verification: `data:build`, `model:build`, `corners:build`, `value:build`, all **374 tests in 33 files**, `typecheck` and `lint` passed. Prior generated artifacts remained byte-for-byte unchanged. `pnpm build` encountered the known Turbopack CSS-worker port-binding sandbox restriction; `pnpm build --webpack` passed and prerendered all six routes. Production HTTP checks returned 200 for `/`, `/backtest`, `/diagnostics`, `/models`, `/corners`, `/value` and all 14 referenced local assets, with six navigation links and the correct active page. Value results, all ten seasons and diagnostic groups rendered without private row data. The in-app browser was unavailable, so visual screenshot verification was not performed; rendered HTML and production dependency traces were checked instead.

V0.9 verification: `data:build`, `model:build`, `corners:build`, `value:build`, `calibration:build`, all **511 tests in 38 files**, `typecheck` and `lint` passed. The existing model-build commands were run solely as required preservation checks; calibration itself consumes recorded V0.6 predictions without refitting Dixon–Coles. All **110 frozen prior files**, including V0.6/V0.7/V0.8 artifacts, and all **12 pre-evaluation calibration implementation files** remained unchanged. Repeated calibration generation reproduced identical public and private artifacts. `pnpm build` encountered the known Turbopack CSS-worker port-binding sandbox restriction; `pnpm build --webpack` passed and prerendered all seven routes. Production HTTP checks returned 200 for `/`, `/backtest`, `/diagnostics`, `/models`, `/corners`, `/value`, `/calibration` and all **18 referenced local assets**, with seven navigation links and the correct active page on every route. Calibration statuses, metrics, every recent season and diagnostic tables rendered without private row data; prior V0.8 results remained intact. The calibration production dependency trace contains no private data, optimizer or build-script dependencies. The in-app browser was unavailable, so visual screenshot verification was not performed. A new real-data isolation test required an explicit integration-test timeout under concurrent verification load; its assertions were unchanged. A concurrent build/type-check race was resolved by rerunning type checking after the build completed.
