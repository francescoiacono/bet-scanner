# Bet Scanner V0.3

A local football research dashboard with two views. The **scanner** derives current team profiles from fictional completed matches, predicts upcoming fixtures, and joins those predictions to separate fictional prices for value analysis. The **backtest** walks through the same history chronologically and evaluates predictions against eventual outcomes using Brier scores and top-pick calibration.

**SIMULATION / FICTIONAL DATA:** all teams, dates, results, fixtures, and prices are fictional. These are not current matches or real betting recommendations. This is intentionally a simple baseline model, not a production betting model. The application uses no bookmakers, external HTTP calls, sports APIs, AI services, database, authentication, or real-money systems. Assets and fonts are local.

This evaluates whether `poisson-v1` produces sensible probabilities on fictional historical data. It does not evaluate betting profitability because V0.3 contains no historical market prices.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000 for the scanner or http://localhost:3000/backtest for model evaluation. Shared navigation links the views. The scanner retains six fictional upcoming fixtures and 18 market selections (HOME, DRAW, and AWAY for every fixture).

Apply a minimum probability edge in percentage points; the default is 2 pp (`0.02` internally). Reset restores it. A threshold of 100 pp demonstrates `NO BET — no opportunities meet the current threshold`.

## Architecture

```text
Completed fictional matches → derived team profiles → league averages
                                                     ↓
Upcoming fixtures → expected goals → frozen poisson-v1 predictions

Independent market quotes + fixture predictions
        → selection-specific probability
        → implied probability / edge / expected ROI
        → minimum-edge filter → ROI ranking → dashboard

Completed fictional matches → chronological kickoff batches
        → strictly earlier history → eligible poisson-v1 predictions
        → actual outcomes → Brier / uniform benchmark / calibration
        → backtest dashboard
```

- `src/data/mock-played-matches.ts`: 48 fictional completed matches; the shared source of historical data
- `src/data/mock-fixtures.ts`: fixture IDs and team identities
- `src/data/mock-markets.ts`: fictional decimal prices only; no model probabilities
- `src/lib/football/types.ts`: fixtures, profiles, baselines, and predictions
- `src/lib/football/validation.ts`: explicit model-input validation
- `src/lib/football/league-averages.ts`: calculates venue-specific league baselines
- `src/lib/football/expected-goals.ts`: pure attack/defence-strength calculations
- `src/lib/football/poisson.ts`: score probabilities and normalized match outcomes
- `src/lib/football/predict-match.ts`: pure prediction API; model version `poisson-v1`
- `src/lib/betting/types.ts`: separate `MarketQuote` inputs and derived `AnalysedBet` outputs
- `src/lib/betting/analyse-bet.ts`: joins a quote, fixture, and prediction after checking their fixture IDs
- `src/lib/betting/rank-bets.ts`: filters and sorts already analysed selections
- `src/lib/scan-markets.ts`: pure orchestration and identity joins
- `src/lib/backtest/types.ts`: played matches, audit records, skipped matches, configuration, and nullable summary metrics
- `src/lib/backtest/history.ts`: history validation, derived venue totals, readiness checks, and historical league baselines
- `src/lib/backtest/run-backtest.ts`: pure walk-forward orchestration with a barrier between kickoff batches
- `src/lib/backtest/metrics.ts`: outcomes, Brier scoring, uniform benchmark, top picks, calibration, and summaries
- `src/app/page.tsx`: runs the local scan and passes analysed results to the dashboard
- `src/app/scanner-dashboard.tsx`: existing visual design, local threshold state, and ranked results
- `src/app/research-header.tsx`: shared Scanner / Backtest navigation and simulation labels
- `src/app/backtest/page.tsx`: server-rendered evaluation metrics, match audit table, calibration, and warm-up skips

Model predictions do not read market prices. Changing a quote changes its value calculation, never its football prediction. Predictions are generated once on the server; the client filters and ranks in memory. There are no API routes or persistence. The leading candidate displays expected home goals, expected away goals, and model version alongside its existing value metrics.

The obsolete hand-entered `mock-team-profiles.ts` has been removed. The scanner derives profiles from all 48 completed matches and treats the existing upcoming fixtures as occurring after that history. Backtests derive a fresh profile snapshot from the permitted prior matches for each kickoff batch. No model formulas, parameters, cutoff, or normalization have changed; the version remains `poisson-v1`.

## Fictional history and walk-forward protocol

The history contains the same 12 teams, with eight weekly rounds of six matches from 4 January to 22 February 2025. Each team plays once per round. All six matches in a round share one kickoff instant. After four rounds each team has exactly two home and two away appearances; after eight rounds each has four of each. Match records contain IDs, timezone-qualified ISO timestamps, team identities, and non-negative integer final scores, with no prices or model probabilities.

`runBacktest(matches, { minimumVenueMatches: 2 })` validates the entire dataset, sorts a copy by parsed kickoff instant, and sorts exact-time ties by match ID in code-point order. Equivalent timezone representations of the same instant share a batch. Neither the input array nor its records are mutated.

For each batch:

1. Derive team totals and league baselines using only matches with `kickoffAt < target kickoffAt`.
2. Require **both teams** to have at least `minimumVenueMatches` prior home appearances **and** prior away appearances. The default is 2; configuration must be a positive safe integer.
3. Record ineligible fixtures as `INSUFFICIENT_HISTORY`. Do not guess, smooth, or borrow future samples.
4. Predict every eligible fixture from that same prior-history snapshot. The model receives fixture identity, not its final score.
5. Only after the complete batch has been predicted and scored, append its results to history. Skipped fixtures also become available to later batches.

League baselines use `sum(prior home goals) / prior match count` and `sum(prior away goals) / prior match count`, counting each match once and including prior matches involving unready teams. Empty or zero-baseline histories cannot supply valid model baselines and fail explicitly if requested; warm-up fixtures are skipped before prediction. Zero individual scoring rates remain valid and are not smoothed.

The default dataset skips the first **24 matches** during four warm-up rounds and evaluates the final **24 matches**. Each evaluated record retains match identity, kickoff, final score, prediction, training-match count, latest training kickoff, league baselines, actual outcome, Brier scores, and top-pick correctness. Skips retain the match, prior-history count, and reason. Neither record type contains odds or financial returns.

The invariant is that changing a future result cannot change an earlier prediction. Matches at an identical instant cannot affect one another. Tests independently reconstruct strictly prior histories, alter simultaneous/future/earlier results, reverse input order, and freeze inputs to check these boundaries. This protocol uses kickoff order as the fictional data-availability rule; it does not model real-world result publication times.

## Evaluation metrics

The actual outcome is HOME when home goals exceed away goals, DRAW when they are equal, and AWAY otherwise.

**Multiclass Brier score** is the primary metric:

```text
Brier = (pHOME - yHOME)^2 + (pDRAW - yDRAW)^2 + (pAWAY - yAWAY)^2
```

The actual outcome is encoded as a one-hot vector. There is **no division by 3**. Scores range from 0 to 2, and lower is better. The summary averages these scores over evaluated matches only.

**Uniform benchmark:** predict `1/3` for every outcome, on the same evaluated matches. Its per-match and mean Brier score are `2/3` regardless of the result.

```text
Brier skill score = 1 - mean model Brier / mean uniform Brier
```

Positive skill means the model beat the uniform baseline, zero means equal performance, and negative skill means worse performance. This is a simple probability benchmark, not evidence of useful betting returns.

**Top-pick accuracy** is the fraction of evaluated matches whose highest-probability outcome occurred. Exact probability ties prefer HOME, then DRAW, then AWAY. The correct count is reported too. Accuracy is supplementary to Brier because it ignores the rest of the probability distribution.

**Top-pick confidence calibration** compares the highest predicted probability with whether that selected outcome was correct. Ten bins cover `[0.0, 0.1)`, `[0.1, 0.2)`, …, `[0.9, 1.0]`; probability 1 belongs in the last bin. Each non-empty bin reports its count, mean confidence, and observed accuracy. The UI hides empty bins; the result retains all ten with null means for empty bins.

```text
ECE = sum((bin count / evaluated count) × abs(mean confidence - observed accuracy))
```

ECE is a fraction in [0, 1] internally and is displayed in percentage points. This is **top-pick** calibration, not full multiclass calibration. When no matches are evaluated, all aggregate quality metrics are `null`, the correct count is zero, and all bins are empty. No NaN or invented zero-quality scores are returned.

With the bundled history and default warm-up:

| Metric | Fictional result |
| --- | --- |
| Historical / evaluated / skipped matches | 48 / 24 / 24 |
| Mean model Brier | 0.5714 |
| Mean uniform Brier | 0.6667 |
| Brier skill | +0.1429 (+14.29%) |
| Top-pick accuracy | 12/24 (50%) |
| Top-pick calibration ECE | 0.2838 (28.38 pp) |

These results describe this small fictional sample only. Beating uniform here does not establish real-world prediction quality or profitability.

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

A higher defensive-weakness ratio means more goals conceded. Each team's attack and its opponent's defence use the baseline for the side scoring the goals. No extra home-advantage multiplier is applied; home advantage is already represented by the separate venue baselines and profiles. Zero individual scoring/conceding totals and zero expected goals are valid. These expected goal counts are derived from actual goal totals in the fictional dataset, not from shot-based expected-goals (xG) data.

### Poisson score matrix

Home and away goal counts are independent Poisson variables with constant intensities equal to their respective expected goals:

```text
P(X = k) = exp(-lambda) × lambda^k / k!
P(home = h, away = a) = P(home = h) × P(away = a)
```

The implementation evaluates the same probability in log space to avoid power/factorial overflow. At `lambda = 0`, zero goals have probability 1 and all higher scores have probability 0.

The grid includes **0 through 10 goals, inclusive**, for both sides. Cells with `h > a` sum into HOME, cells with `h = a` into DRAW, and cells with `h < a` into AWAY. Divide all three raw totals by their combined retained probability mass so that the final probabilities sum approximately to 1. This conditions the distribution on both teams scoring at most 10; it does not model the discarded tails. Very large intensities can make that conditioning misleading. A score grid whose retained mass numerically underflows to zero fails explicitly.

Predictions carry fixture identity, both expected goal counts, all three outcome probabilities, and `modelVersion: "poisson-v1"`. No model fitting, training, confidence score, or statistical dependency is introduced.

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

## Current limitations

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

It also assumes independent, constant-rate Poisson scoring. Real scorelines can show dependence, changing match states, low-score effects, and variance that this model does not capture. Small aggregate samples have no shrinkage, priors, or uncertainty estimates. The fixed 0–10 grid conditions away the discarded goal tails. Zero observed scoring rates can produce extreme probabilities.

V0.3 measures the frozen model without fitting, tuning, or calibrating its predictions. Only 24 fictional matches are evaluated; their scores are deliberately artificial and are not representative real-world evidence. Calibration bins have small samples, ECE depends on binning, and top-pick calibration does not evaluate all three probabilities individually. Passing causal tests does not establish model quality. The artificial prices and results can create apparent value by construction, and no historical prices exist to evaluate profitability.

These weaknesses should guide a separately scoped V0.4: representative data and evaluation design, larger samples and uncertainty, fuller calibration diagnostics, and sensitivity to unsmoothed rates and the fixed goal cutoff. None of that future work is implemented here.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:watch` runs Vitest in watch mode. Unit tests use a Node environment and cover mathematical properties, invalid inputs, independent data boundaries, the complete scanner pipeline, retained V0.1 value/ranking behaviour, causal walk-forward invariants, warm-up, history aggregation, Brier conventions, benchmark skill, calibration boundaries/ECE, and empty evaluation. V0.3 adds 29 focused tests; all 151 tests pass. No dependencies were added for V0.3.

If an execution sandbox blocks Turbopack's local CSS-worker port, `pnpm build --webpack` is the supported alternative for verifying the production build; the project's default bundler remains unchanged.
