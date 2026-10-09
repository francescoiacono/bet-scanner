# Frozen football research

This archive records the methods and conclusions of V0.1–V0.9. It is not a
probability service, a live betting recommendation or a claim of profitable
execution. V1.0's price-comparison engine is independent of these models;
V1.0.1 changes their presentation only. Detailed historical reports remain
recoverable from Git, including baseline
`b91812800e5accd15fa719ae6baccca4eda25f26`.

## Sources, provenance and information boundaries

Result research uses [OpenFootball / england](https://github.com/openfootball/england)
at commit
[`b17e8f01707d83d2ce1790c14d4a5eeb35987825`](https://github.com/openfootball/england/tree/b17e8f01707d83d2ce1790c14d4a5eeb35987825),
dated 21 September 2026. Ten original Premier League season files, CC0 license and
acquisition instructions remain in [data/external/openfootball](../data/external/openfootball/README.md).
SHA-256 manifests are [provenance.json](../data/external/openfootball/provenance.json)
and [external-validation-provenance.json](../data/external/openfootball/external-validation-provenance.json).
No original results, names or source bytes were rewritten for this cleanup.

| Cohort | Seasons | Source matches |
| --- | --- | --- |
| Recent / development | 2021-22 through 2025-26 | 1,900 |
| Older external historical validation | 2014-15 through 2018-19 | 1,900 |

Each selected season has 380 completed matches, 20 teams, 38 appearances per team
(19 at each venue). Seasons 2019-20, 2020-21 and 2026-27 are excluded. Older
external validation is historical, not unseen future data. Recent outcomes had
already been inspected in earlier milestones.

The parser rejects incomplete seasons, malformed results, impossible dates,
duplicate fixture/IDs, self-matches and incorrect source hashes. It preserves
source names, normalizes whitespace and sorts stable date/fixture identifiers.
Score-independent IDs prevent outcome changes from silently changing identity.
Scores and upstream weekday/date headings are parsed; optional historical time
and half-time fields are not used.

Corner and market-price evaluations use ten manually supplied
[Football-Data.co.uk CSVs](https://www.football-data.co.uk/englandm.php), under
`data/private/football-data/{1415,1516,1617,1718,1819,2122,2223,2324,2425,2526}-E0.csv`.
There is no scraper or downloader. Raw CSVs and normalized/audit rows stay ignored
and untracked because redistribution rights are not assumed. The committed
[corner provenance](../data/provenance/football-data-corners-v07.json) records each
source hash and acquisition policy; value/calibration artifacts also record
their original hashes. Use the exact files in those manifests, never replacements
or edited outputs to make a check pass.

Corners parse only date, exact home/away names and HC/AC. Value research parses
only date, names and B365H/B365D/B365A. Unused source price, goal, corner or other
columns cannot leak into a model. Explicit deterministic team aliases and exact
source-date/home/away joins align each season 380/380; malformed, duplicate,
missing or extra rows fail instead of being dropped.

All historical results on one calendar date form a batch at
`YYYY-MM-DDT12:00:00Z`. Noon UTC is an ordering convention, **not a historical
kickoff time**. Predict all eligible fixtures before admitting any result from
that batch. Only strictly earlier source dates are available. History resets
each season; no prior-season carryover. Both teams require at least two earlier
HOME and two AWAY appearances. Warm-up skips later contribute to history.
Comparisons retain identical eligible fixtures: 1,688 recent / 212 skips and
1,691 older / 209 skips.

## Scores and uncertainty

For result outcomes, Brier is the three-component sum
`sum((p_i - 1{i=actual})²)`, range 0–2, with no division by three. Lower is better.
Top-pick accuracy is descriptive, not a profitability measure. Uniform, causal
league-base-rate and causal league-average independent-Poisson forecasts provide
benchmarks using the same available history.

Calibration uses ten fixed probability bins: [0,.1), …, [.9,1], with one in the
last bin. Empty bins stay empty. ECE is a count-weighted absolute
forecast–frequency difference, displayed in percentage points. Top-confidence
and three classwise ECEs answer different questions. History-depth slices use the
minimum of the four target-team venue counts with fixed 2–3 / 4–6 / 7–10 /
11–15 / 16+ buckets. Diagnostic slices do not tune models.

Paired uncertainty uses a deterministic season-stratified, source-date-clustered
percentile bootstrap: keep every same-date fixture together, sample each season's
original number of date clusters with replacement, retain paired predictions and
weight pooled scores by match count. Canonical season/date/ID order and local
Mulberry32 random state make resampling deterministic. Use 5,000 replicates,
95% bounds and linear percentile interpolation at `(n−1)*p`.
Seeds are **202605** (V0.5), **202606** (V0.6), **202607** (V0.7),
**202608** (V0.8) and **202609** (V0.9). Fits remain fixed during resampling.
Intervals do not account for all temporal dependence or model/strategy selection.
A positive point estimate with an interval crossing zero does not establish
superiority, and proper-score superiority does not establish betting profit.

## Early Poisson

### V0.1–V0.5 methods

`poisson-v1` estimates venue-specific scoring/conceding rates from strictly earlier
matches. Let Lh/La be prior league home/away mean goals. Home attack is home goals
for per appearance / Lh; home defence weakness is home goals against / La.
Away attack and defence weakness use away goals for / La and away goals against
/ Lh. Expected goals multiply the appropriate league baseline, attack and
opponent defence weakness.

```text
lambdaHome = Lh × homeAttack × awayDefenceWeakness
lambdaAway = La × awayAttack × homeDefenceWeakness
Poisson(k;lambda) = exp(-lambda) × lambda^k / k!
P(h,a) = Poisson(h;lambdaHome) × Poisson(a;lambdaAway)
```

Evaluate log probabilities for numerical stability. At lambda=0, P(0)=1.
Sum HOME / DRAW / AWAY over the frozen 0–10 inclusive score grid, then normalize
retained mass to one. This conditions away the discarded goal tails; underflow
or invalid inputs fail explicitly. No clipping, fitted parameter, confidence
score, xG, recency, lineup or opponent-strength adjustment is added.

The original fictional scanner's pure research pipeline and tests remain:
`scan-markets.ts`, `lib/betting/` and three mock-data fixtures. Predictions are
independent of prices. Its now-retired product UI used
`implied=1/odds`, `edge=p-implied`, `expectedROI=p*odds-1`; default edge
threshold 0.02 inclusive, with a one-machine-epsilon subtraction allowance.
Ranks use expected ROI then exact opportunity ID. These retained regression
utilities do not constitute a current live value-betting feature.

### Finding and limitations

Recent Poisson Brier was **0.634404090022038** versus league-base-rate
**0.6495926545501354** and league-average-Poisson **0.648719016880322**.
V0.5 paired Brier advantages were approximately 0.0152
[−0.0028, +0.0328] and 0.0143 [−0.0038, +0.0320]. Point gains and deterministic
causality did not prove model quality or profitability. The weakest
leave-one-season diagnostic was 2025-26; this was a diagnostic, not a tuning step.

The model remains a frozen baseline, not promoted to the live scanner. One
league, finite grid conditioning, weak priors, small early histories and
independent constant-rate scoring limit interpretation. Source dates, warm-up
eligibility and prior inspection constrain the population represented by scores.

## Dixon–Coles

### V0.6 definition and fitting

`dixon-coles-v1` implements the score model in Dixon & Coles (1997),
[DOI: 10.1111/1467-9876.00065](https://doi.org/10.1111/1467-9876.00065).

```text
lambda = exp(homeAdvantage + attack_home + defenceWeakness_away)
mu     = exp(attack_away + defenceWeakness_home)
P(x,y) = tau(x,y) × Poisson(x;lambda) × Poisson(y;mu)

tau(0,0)=1-lambda*mu*rho   tau(0,1)=1+lambda*rho
tau(1,0)=1+mu*rho         tau(1,1)=1-rho
tau(other)=1
```

Attacks sum structurally to zero; optimize N−1 attacks, N defence weaknesses,
home advantage and one correlation coordinate (2N+1 parameters). Teams sort
lexically. Minimize equally weighted mean negative log likelihood over all
earlier current-season completed matches. The likelihood has full score support;
prediction uses the same 0–10 conditioned result grid. At rho=0 it reduces to
independent Poisson at the same expected goals.

Correlation is strictly inside both the fixed ±0.20 bound and tau-validity bounds
for every ordered fitted-team pairing:

```text
M=max(lambda_ij,mu_ij); Q=max(lambda_ij*mu_ij), for i!=j
L=max(-0.20,-1/M); U=min(+0.20,+1/Q)
s=(1+tanh(rawRho))/2; rho=(1-s)*L+s*U
```

The analytic gradient includes that transformation; exact maximum ties use the
first lexical pair. Invalid rates, negative tau, boundary saturation or unusable
probability mass fail. Infeasible trials have infinite objective for line-search
backtracking, not fitted fallback parameters.

Pinned **numeric@1.2.6** BFGS performs each independent date fit from zeros:
2,000 maximum library iterations, step tolerance 1e-10, mean-gradient L2 tolerance
1e-6, relative objective tolerance 1e-10 for five accepted stable iterations.
Finite valid gradient, sustained objective stability or declared library
small-step convergence is required; non-convergence aborts generation.
No random initialization, warm starts, decay, shrinkage or regularization.
Convergence does not establish a global maximum or zero gradient at a piecewise
validity boundary. Numeric's MIT notice remains in
[data/licenses](../data/licenses/numeric-1.2.6-LICENSE.txt).

### Recorded comparison

| Cohort | Independent Poisson Brier | Dixon–Coles Brier | Paired advantage, 95% interval |
| --- | --- | --- | --- |
| Recent | 0.63440409 | **0.6096214837100087** | +0.02478 [+0.01470, +0.03504] |
| Older historical | 0.61527116 | 0.5931332816914757 | +0.02214 [+0.01180, +0.03291] |

Advantage is Poisson Brier minus Dixon–Coles Brier. The comparison supports lower
Brier in both cohorts. It changes joint team fitting and low-score dependence
together, so it does not isolate which component caused the improvement.
`dixon-coles-v1` remains research; it is not a live product probability model.
The later market comparison was unfavorable. Warm-up, sparse fits, one league,
historical external validation and missing player/recency features remain limits.

The complete [V0.6 artifact](../src/data/generated/model-comparison-v06.json)
retains predictions and fit audits for later reproducibility. It stays committed
and byte-identical, but is not imported by either product page or sent to browser
bundles.

## Corners

### V0.7 methods

Frozen names: `corner-poisson-v1` and `corner-negative-binomial-v1`.
Both share the jointly fitted log mean attack/defence/home-advantage structure
with zero-sum attacks. Home and away corner counts are independent.
Negative Binomial uses mean mu and alpha>0, variance `mu+alpha*mu²`,
shape `r=1/alpha`; alpha approaches zero toward Poisson. Alpha is
`exp(rawAlpha)`, initialized at 0.1; mean coordinates start at zero.
Fits are independent per eligible date, with the same frozen BFGS stopping
settings as V0.6. Mean gradients are analytic; rawAlpha uses centered differences
with epsilon 1e-5. Invalid/non-converged fits abort without substitution.

Convolve home/away distributions into total corners. Categories are
0,1,…,30,31+, with **all tail mass retained**, not renormalized.
Primary normalized RPS is
`sum(k=0..30)((forecastCDF(k)-observedCDF(k))²)/31`.
Secondary Over lines are 7.5, 8.5, 9.5, 10.5, 11.5 and 12.5.
Binary Brier `(pOver-yOver)²` is in [0,1], unlike three-class result Brier.
Over probabilities use the finite CDF at each integer boundary.

Prespecified external preference uses Poisson RPS − NB RPS: a wholly positive
95% interval prefers NB, wholly negative prefers Poisson, otherwise
**NONE / INCONCLUSIVE**. That label does not automatically promote a scanner
model. All choices were locked before external evaluation.

### Finding

| Cohort | Poisson RPS | NB RPS | Advantage interval |
| --- | --- | --- | --- |
| Recent | 0.06578721 | 0.06567643 | [−0.000023, +0.000249] |
| Older | 0.06641981 | 0.06642274 | [−0.000130, +0.000127] |

Both intervals cross zero. External preference remains **NONE / INCONCLUSIVE**;
neither model was promoted. Both had worse RPS than simple causal empirical and
league-Poisson benchmarks. Descriptive variance-to-mean around 1.11 did not prove
conditional NB superiority. One league, limited features, independent counts and
line-dependent calibration error remain important limits. No corner price or
profitability strategy was evaluated.

## Historical value

### V0.8 fixed price evaluation

Only recorded V0.6 probabilities enter this evaluation; no model refit or
threshold search. Source odds are **B365H/B365D/B365A**, non-closing Bet365 source
prices; C-suffixed and other bookmaker prices are not substituted. Collection
timing varies across eras, so these are not uniform closing-price observations.

```text
implied_i = 1/decimalOdds_i
overround = sum(implied_H,D,A)-1
fairMarketProbability_i = implied_i/sum(implied_H,D,A)
expectedROI_i = frozenModelProbability_i*decimalOdds_i-1
fairMarketEdge_i = frozenModelProbability_i-fairMarketProbability_i
```

Odds must be finite and greater than one. Proportional normalization is the sole
margin-removal method. Overround is descriptive. Expected ROI and settlement use
raw offered prices; fair-market edge is not the eligibility threshold.

Predeclared paper rule: expected ROI **≥0.02**, at most one pick per fixture.
Choose highest expected ROI, then larger fair-market edge, then HOME/DRAW/AWAY.
Selection sees only forecasts and prices, before outcomes enter settlement.
Each selected pick uses one paper unit; win returns odds, loss returns zero.
ROI is total profit / stakes; zero stakes produce null. Maximum drawdown tracks
the largest earlier peak to later trough from an initial zero, in stable
season/source-date/fixture-ID order. No bankroll or Kelly sizing.

Paired Brier advantage is fair-market Brier minus model Brier, so positive
favours the model. ROI bootstrap retains original evaluated date clusters,
including no-bets, and calculates replicate profit/stakes without reselecting.
A zero-stake replicate makes the whole interval unavailable; it is not dropped.
Both ROI lower bounds >0 would support historical paper edge; both upper bounds
<0 would label it negative; otherwise the fixed status is INCONCLUSIVE.

### Recorded finding

| Metric | Recent | Older |
| --- | --- | --- |
| Dixon–Coles Brier | **0.6096214837100087** | 0.5931332816914757 |
| Fair-market Brier | **0.5760293595563422** | 0.5589914216582492 |
| Paper bets | 1,480 | 1,543 |
| Net paper units | −70.11 | −114.78 |
| ROI | **−4.737162162162161%** | **−7.438755670771229%** |
| ROI 95% interval | [−12.24248%, +2.84983%] | [−14.50635%, −0.19170%] |

The market outperformed Dixon–Coles in both cohorts. The strategy lost money in
both; the fixed combined status remains **INCONCLUSIVE** because the recent
interval crosses zero. No value strategy is promoted. Prior outcome inspection,
one league/bookmaker, non-uniform source-price timing, dependency and absent
execution/limits/commission evidence prevent prospective profitability claims.
No research threshold or cohort was changed after seeing losses.

## Calibration

### V0.9 development and validation

The only fitting inputs are frozen V0.6 HOME/DRAW/AWAY probability triplets and
outcomes, projected without goals, teams, model parameters, prices or paper
selections. Market prices enter only after calibrated forecasts, as a benchmark.

Exactly three candidates:
identity `q=p`;
temperature-v1 `T=exp(rawT); q=softmax(log(p)/T)`;
multinomial-logit-v1 uses
`x=(1, log(pH)-log(pA), log(pD)-log(pA))`, two three-coefficient logits and AWAY
reference zero. Initial raw temperature is zero; logit coefficients implement
identity. Differences of logs and stable softmax avoid avoidable overflow.
Finite probabilities must lie strictly inside (0,1), sum within 1e-10; no
clipping, regularization or epsilon is introduced.

The objective is mean multiclass natural-log loss with analytic gradients.
Pinned BFGS settings: 2,000 iterations, 1e-10 step tolerance, 1e-8 mean-gradient
target, 1e-10 relative objective change for five stable iterations. Invalid or
non-converged fitting aborts rather than falling back.

Older rolling-origin folds train on 2014-15, then increasing prefixes through
2017-18, validating respectively on 2015-16 through 2018-19. Models restart in
each fold. The 2014-15 season is training-only; 1,351 validation fixtures support
selection. Primary criterion: identity Brier − candidate Brier with a strictly
positive lower 95% bound. Choose largest observed advantage; ties within 1e-12
prefer temperature. Otherwise keep identity. No recent score or market price
selects a family. The selected family uses all 1,691 older records before recent
validation.

Temperature's advantage was −0.00196427 [−0.00932456, +0.00565472];
multinomial logit's was +0.00354516 [−0.00608857, +0.01281448].
Neither qualified. Secondary log loss improvement did not override Brier.
Both fitted candidates soften overconfident forecasts, but development evidence
does not establish that calibration is the primary market-gap cause.

### Recorded finding

Selected family: **identity**. Recent status: **IDENTITY_RETAINED**.
Raw and selected Brier remain **0.6096214837100087**; market Brier remains
**0.5760293595563422**. Calibration advantage and interval are exactly zero.
**0% of the market Brier gap is closed**. No calibrated model was promoted, and
failed candidates were not tried on recent seasons after failing selection.

Fixed confidence/ECE/sharpness/residual slices are diagnostics. Disagreement is
the maximum absolute class difference per fixture, using fixed <5 / 5–<10 /
10–<20 / 20+ percentage-point buckets. It is not evidence of value betting.
Four historical folds, dependence, fixed bin choices and prior outcome
inspection remain limits. No V0.9 betting metric or altered V0.8 strategy exists.

## Frozen artifacts

These SHA-256 hashes must remain unchanged; V1.0.1 does not rewrite or relocate
their contents.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| model-comparison-v06.json | 14,262,766 | `deb9fac92ebd104fcc15cf713b5e2600cfba5e56a8f58b30d219f469dccf8262` |
| corners-v07-summary.json | 77,886 | `bf4475b082608bf78a9f92b7986355745c62279d54b05509497a0699494fa4a7` |
| value-v08-summary.json | 35,212 | `d1fbf53cfd513bd9329893f5cb9205d039f455ed725c2cebc55a4b7de1990bb9` |
| calibration-v09-summary.json | 59,073 | `0324c424c7acbccd7bcf531d8375690078a11a087b3874f3a1f896f3e3b27449` |

Public corner/value/calibration artifacts contain aggregates, configuration and
hashes, not private fixture/price rows. Detailed audits remain under ignored
`data/private/generated/`. The V0.6 artifact contains full historical
predictions/fit details for reproduction; only the new **2,078-byte** aggregate
index reaches the archive import graph. That projection cannot change scientific
inputs or results.

Protocol fingerprints remain in their artifacts and tests. In particular V0.8
is `f05feb53bcf54b2c9c887404db2d9d8e1a0784e646640db6a10e200437949c31`;
V0.9 is `f12d9ba47a45a9d69693d698d2453ba40a6c5ef242c3e9eab21a164ee4262e65`.
Original source/provenance and model implementations remain protected.

## Reproduction

Run from repository root with the locked dependencies and Node **24.21.0** for
byte-identical recorded output:

```sh
pnpm data:build
pnpm model:build
pnpm corners:build
pnpm value:build
pnpm calibration:build
pnpm research:build
pnpm test
```

No command performs a provider request. Data/model builds verify committed
OpenFootball inputs. Corners/value/calibration also verify the exact local CSVs
and write ignored normalized/audit data plus committed public aggregates.
Private sources unavailable means source-dependent verification is unavailable,
not permission to invent data. On another Node version, retained tests use
12-decimal numeric comparisons where documented; frozen output must not be
overwritten with different results.

Every season's data validation must complete before replacement. Deterministic
source order, IDs, initialization, local seeded resampling, JSON formatting and
absence of generation timestamps/random IDs/machine paths support reproducibility.
The aggregate index records all four artifact hashes and regenerates
byte-for-byte without fitting, private files or network.

No model, research threshold, price family, seed, source manifest or historical
finding was changed during consolidation. Older verbose methodology and all
per-season diagnostic tables remain recoverable in Git and frozen artifacts.
