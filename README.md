# Bet Scanner V0.6

A local football research dashboard with four research views:

- **Model comparison (`/models`)**: compare frozen `poisson-v1` with independently fitted `dixon-coles-v1`, reporting development and external historical validation separately.
- **Real historical backtest (`/backtest`)**: evaluate the frozen `poisson-v1` model against uniform, causal league-base-rate, and league-average Poisson forecasts on five completed Premier League seasons.
- **Model diagnostics (`/diagnostics`)**: investigate paired uncertainty, fixed history-depth slices, outcome calibration, and season robustness without changing the model.
- **Fictional market scanner (`/`)**: retain the existing fictional match history, upcoming fixtures, and independent mock prices for implied probability, edge, and expected ROI analysis.

V0.6 adds a separate fitted score model and external historical validation. `poisson-v1` remains frozen. V0.6 does not tune Dixon–Coles after viewing the external-validation results. Neither model evaluation establishes betting profitability because no market prices are evaluated. The scanner remains a simulation, not a source of real betting recommendations. No bookmakers, live prices, sports APIs, AI services, authentication, databases, deployment, or bet execution are added. The application makes no runtime network requests for data; assets and fonts are local.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000, http://localhost:3000/backtest, http://localhost:3000/diagnostics, or http://localhost:3000/models. The scanner still has six upcoming fictional fixtures and 18 HOME / DRAW / AWAY selections. Its default minimum edge is 2 pp (`0.02`); a threshold of 100 pp demonstrates `NO BET — no opportunities meet the current threshold`.

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

External evidence is consistent with improved forecasts from the fitted Dixon–Coles model, particularly under sparse history; all ten seasons improve Brier and both separate bootstrap intervals remain positive. However, DRAW gains are small, late-history gains nearly disappear in some buckets, and numerical/boundary limitations remain. These joint findings support further separately scoped investigation, without selecting changes from this validation set or automatically promoting a model. The fictional scanner remains on `poisson-v1`; no V0.7 work is implemented.

## Value analysis and ranking

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

Five seasons from one league provide limited evidence, and match outcomes are not independent experimental samples. The paired intervals cross zero, despite positive pooled and leave-one-season-out skill. ECE depends on binning; top-pick and the three one-vs-rest ECEs answer different questions. Passing causal tests does not establish model quality. The fictional scanner prices remain artificial; there are no historical odds or profitability metrics.

V0.5 supplied the development evidence motivating the separately versioned V0.6 comparison: uncertain pooled gains, positive season-exclusion estimates, improving history-depth performance, and weaker DRAW forecasts. V0.6 preserves those recorded results and uses the already requested older seasons for an external check. Future model changes require separate scope and fresh prespecified evaluation; V0.6 does not tune to these diagnostic slices or start V0.7.

## Verification

```sh
pnpm data:build
pnpm model:build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:watch` runs Vitest in watch mode. Unit tests use a Node environment and cover mathematical properties, invalid inputs, independent data boundaries, the complete scanner pipeline, retained V0.1 value/ranking behaviour, causal walk-forward invariants, warm-up, history aggregation, Brier conventions, benchmark skill, calibration boundaries/ECE, and empty evaluation. V0.5 adds 26 focused tests for paired/clustered/stratified bootstrap invariants, invalid configuration and empty data, the league-Poisson benchmark, fixed history boundaries and causal counts, outcome components/calibration, pooled season exclusions, dynamic weakest-season selection, and exact V0.4 metric regressions. Existing causal tests also check the new benchmark on every evaluated real match, including previous-season, same-date, and future-result isolation. V0.6 adds 23 focused tests for tau/zero-rho invariants, parameter signs and identification, analytic gradient checks, deterministic fitting and failure, causal paired eligibility, external data/provenance, dataset separation, model-specification locking, and full-artifact regeneration. All 220 tests pass, retaining all 197 meaningful V0.1–V0.5 tests. The only new dependency is the pinned numerical optimiser described above.

If an execution sandbox blocks Turbopack's local CSS-worker port, `pnpm build --webpack` is the supported alternative for verifying the production build; the project's default bundler remains unchanged.
