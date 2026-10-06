# Bet Scanner V0.2

A local football betting-market research dashboard. Fictional historical goal aggregates feed a deterministic football model; its HOME / DRAW / AWAY probabilities are joined to separate fictional market prices, analysed, filtered, and ranked by expected ROI.

**SIMULATION / FICTIONAL DATA:** all teams, historical totals, fixtures, and prices are fictional. These are not current matches or real betting recommendations. This is intentionally a simple baseline model, not a production betting model. The application uses no bookmakers, external HTTP calls, sports APIs, AI services, database, authentication, or real-money systems. Assets and fonts are local.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. The dataset contains 12 teams, six fictional upcoming fixtures, and 18 market selections (HOME, DRAW, and AWAY for every fixture).

Apply a minimum probability edge in percentage points; the default is 2 pp (`0.02` internally). Reset restores it. A threshold of 100 pp demonstrates `NO BET — no opportunities meet the current threshold`.

## Architecture

```text
Team profiles → calculated league averages → expected goals → Poisson predictions
Fixtures ────────────────────────────────────────────────────┘

Independent market quotes + fixture predictions
        → selection-specific probability
        → implied probability / edge / expected ROI
        → minimum-edge filter → ROI ranking → dashboard
```

- `src/data/mock-team-profiles.ts`: fictional historical goal totals and match counts for home and away appearances
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
- `src/app/page.tsx`: runs the local scan and passes analysed results to the dashboard
- `src/app/scanner-dashboard.tsx`: existing visual design, local threshold state, and ranked results

Model predictions do not read market prices. Changing a quote changes its value calculation, never its football prediction. Predictions are generated once on the server; the client filters and ranks in memory. There are no API routes or persistence. The leading candidate displays expected home goals, expected away goals, and model version alongside its existing value metrics.

## Exact modelling assumptions

Each profile contains historical **integer totals**, not averages or probabilities. Home and away match counts must both be positive. Team names and fixture IDs are exact identifiers; no fuzzy matching is performed. All supplied profiles are treated as one league and one equally weighted historical window, with no adjustment for recency or opponent quality.

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

It also assumes independent, constant-rate Poisson scoring. Real scorelines can show dependence, changing match states, low-score effects, and variance that this model does not capture. Small aggregate samples have no shrinkage, priors, or uncertainty estimates. The model has no calibration, backtesting, or evidence that its estimated ROI predicts actual returns. The artificial prices and goal totals can create apparent value by construction.

For a later milestone, these weaknesses should inform model evaluation, data quality, calibration, and sensitivity to the fixed goal cutoff before treating rankings as meaningful research results. V0.2 implements none of that future work.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:watch` runs Vitest in watch mode. Unit tests use a Node environment and cover mathematical properties, invalid inputs, independent data boundaries, the complete pipeline, and retained V0.1 value/ranking behaviour. No dependencies were added for V0.2.

If an execution sandbox blocks Turbopack's local CSS-worker port, `pnpm build --webpack` is the supported alternative for verifying the production build; the project's default bundler remains unchanged.
