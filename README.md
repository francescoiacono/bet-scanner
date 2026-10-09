# Bet Scanner

A local-first football odds-comparison app. Compare bookmaker BACK prices for
full-time HOME / DRAW / AWAY and identify **theoretical arbitrage**, before costs
and market movement. The homepage is the scanner; `/research` is a compact
archive of frozen experiments. Version **1.0.3** adds zero-token local scan history
and an explicitly approved update workflow. It introduces no betting feature or statistical model.

There is no bet placement, staking, bankroll management, value-betting model,
authentication, database, cloud infrastructure or AI service.

## Local quick start

Use Node **22.18+** for the offline research scripts; verification uses Node
**24.21.0**, pnpm **9.15.0**, Next **16.3.8**, React **19.2.8** and TypeScript.

```sh
pnpm install
pnpm dev
```

Open **http://127.0.0.1:3000/**. Development and production scripts bind to
127.0.0.1. Without a provider key, the app starts in **DEMO** and works offline.
With a configured key, it starts in **Live Source**, **Configured but unverified**.
Opening, hydrating, refreshing or navigating the app, switching modes and hot
reload make no provider requests. All external requests require an explicit user
action. Re-running the demo uses only the local API and the same pure comparison engine.

For a production run:

```sh
pnpm build
pnpm start
```

If a sandbox prevents Turbopack's CSS worker from binding its local port,
`pnpm build --webpack` is the supported verification fallback. The default
bundler is unchanged.

## Demo and optional live data

**DEMO:** all four fixtures, teams, bookmakers and prices are synthetic. Examples
cover theoretical arbitrage, ordinary non-arbitrage, missing DRAW and stale
evidence. They are not available offers or recommendations.

**LIVE SOURCE:** OddsRelay, using the official
[reference](https://oddsrelay.io/docs/reference) and
[OpenAPI contract](https://api.oddsrelay.io/v2/openapi.json). No alternative
provider or raw-board fallback is implemented.

If `.env.local` already exists, add the following variable using your local
editor. Otherwise copy the safe [.env.example](.env.example) first.

```dotenv
ODDSRELAY_KEY=your_own_server_key_here
```

Restart the app. Keep the actual key in the ignored local file, never in chat,
URLs, Git, browser form fields or a `NEXT_PUBLIC_` variable. A server-only runtime
reads it; the page receives only a configuration boolean. DEMO needs no key.

The user's stated free-account allowance is **2,500 tokens/month**. This is not
hardcoded. Authenticated `/v2/usage` supplies the current limit, balance and reset.
Unknown balances remain unknown and block execution. Explicit unlimited balances
remain unlimited. Access depends on account/key scope, product, region and venue;
a globally listed bookmaker does not establish access for this key.

## Manual live workflow

1. With a configured key, **Live Source** opens unverified. Press **Refresh
   discovery · free** to verify usage, scope, active football competitions and
   standard-product bookmaker coverage. This is the only discovery trigger;
   duplicate submissions are blocked and failures never retry automatically.
2. Select **two or three** eligible bookmakers for a comparison across bookmakers.
   Search the compact, scrollable list by name. Selected bookmakers remain visible
   above it as compact removable badges; unavailable venues show a reason.
   **bet365 and Ladbrokes** are selected by default when eligible. Missing or
   unavailable defaults are left unselected. Changing a selection clears the
   old quote and acknowledgment.
3. Click **Get quote · free**. The upstream request always includes
   `quote=true`, retrieves no paid odds, and displays exact bookmakers, cost,
   remaining/projected tokens, reset and approval expiry.
4. Review and acknowledge the warning, then click **Confirm Scan** separately.
   This is the only action that can request charged odds.

A server-generated approval binds the browser session, canonical request and
quoted cost. It expires after **60 seconds**, is consumed synchronously once
before asynchronous confirmation work, and requires a fresh usage/scope check.
The client cannot supply a URL or self-declared cost. Double clicks, retries and
expired approvals cannot reuse it.

Discovery is fresh only while `capturedAt <= now < capturedAt + 60 seconds`,
using the server's `APPROVAL_LIFETIME_MS` policy. Missing, invalid or future
timestamps cannot verify availability. At expiry the UI shows **Discovery expired
— refresh required** and retains the checked timestamp and previous coverage for
context. Bookmaker selection and new quotes are disabled until a manual refresh.
Refreshing replaces coverage, clears the previous quote/acknowledgment and selects
only eligible preferred IDs; no other bookmaker is substituted automatically.

Discovery validity and quote approval validity are separate. Discovery expiry
blocks **new** quotes but preserves an already issued approval until its own
expiry, subject to the unchanged server usage/scope checks. Switching Demo/Live
neither requests data nor makes expired discovery fresh; it still clears any quote.

**MAX_TOKENS_PER_SCAN = 500.** Quotes above this maximum or the actual balance are
blocked. There is no subscription upgrade, wider fallback, polling or automatic
charged retry. Page loading, navigation, startup, builds and tests never execute
provider requests automatically. Two separate one-shot local timers update
discovery and approval expiry, with cleanup on replacement/unmount. Neither
timer requests data, quotes or scans; there is no polling interval.

Actual response usage uses optional `X-Tokens-Cost`, `X-Tokens-Used`,
`X-Tokens-Remaining`, `X-Tokens-Limit` and `X-Tokens-Reset` headers. Missing values
stay unknown; quoted cost is not reported as an actual charge. Errors and
Retry-After guidance are displayed without secret-bearing upstream messages.
Ambiguous network failures can leave actual token use unknown.

Discovery errors show their code and message beside **Source & budget**. After
updating provider code, restart `pnpm dev`: the development process retains its
service instance across hot reloads. Catalogue display titles trim surrounding
whitespace; identifiers and event matching remain exact. An empty key-region
list inherits the authenticated account regions, while an explicit key-region
list restricts them further.

## Provider endpoints

All upstream calls are server-side GET to `https://api.oddsrelay.io`, with a Bearer
key, gzip support, a 15-second timeout, redirects refused and no automatic retry.
Local actions use the unchanged same-origin POST **`/api/odds`**.

| Endpoint | Parameters / use |
| --- | --- |
| `/v2/usage` | No parameters; authoritative account usage, free |
| `/v2/bookmakers` | No parameters, including no region; catalogue, free |
| `/v2/sports` | `region=uk`, optional cursor; free discovery, at most 20 pages |
| `/v2/events` | `region=uk&sport=soccer`, optional cursor; manual free pages |
| `/v2/coverage` | `region=uk`; authenticated coverage, free |
| `/v2/pricing` | No parameters; free information behind Advanced details |
| `/v2/odds/standard` | `region=uk&sports=soccer&markets=h2h&bookmakers=<sorted two/three keys>`; free quote with `quote=true`, charged request only after confirmation |

Decimal odds, ISO dates and response envelopes use verified documented defaults.
Only exact active football competition identities and HOME-team / `Draw` /
AWAY-team names are mapped. The adapter imports `outcomes[].back[]`
bookmaker/price/link fields; it never imports exchange LAY prices.

The contract was checked for V1.0: version **2026-07-08**, verified
**2026-10-08**, SHA-256
`9002ede7214318b6e3ae2c77638de3ae04585b8cc7990f4be4c15bccee8b92e6`.
The initial V1.0.1 consolidation preserved the adapter without authenticated
provider calls. A subsequent manual discovery diagnosis fixed catalogue title
whitespace and inherited key regions, using free endpoints only. See the
[follow-up record](docs/cleanup-v101.md#live-discovery-follow-up).

## Results and limits

Source freshness is `meta.last_seen[bookmaker].soccer`, not response receipt time
or an individual offer timestamp. Accepted evidence age is **at most 120 seconds**.
Missing, future or stale evidence, unavailable offers, started fixtures, duplicate
identities, unknown competitions and incompatible settlement definitions are
excluded. No fuzzy fixture joins are performed.

For best eligible odds H, D and A in a complete identical-settlement market:

```text
S = 1/H + 1/D + 1/A
theoretical arbitrage when S < 1
theoretical gross ROI = 1/S - 1
educational fraction_i = (1/odds_i)/S
```

Require verified evidence from at least two bookmakers, with best arbitrage legs
spanning at least two. Rank by gross ROI, then freshest oldest supporting evidence,
then event ID. Full precision determines eligibility; displayed rounding does not.

**NO ARBITRAGE FOUND** means complete eligible comparisons produced no discrepancy.
**INSUFFICIENT VALID DATA** means a comparison could not be verified. Provider
failure is a separate state and never substitutes synthetic results for live data.

Results distinguish scanned fixtures, complete comparisons, insufficient data
and theoretical opportunities. A no-arbitrage finding applies only to the complete
subset. Complete comparisons appear first: opportunities follow the engine's ROI
ranking, then other markets sort by S ascending, kickoff and event ID. Insufficient
fixtures remain available in a collapsed table with every reason. Failure counts
show affected fixtures, count each reason once per fixture, and can overlap.
Scanned counts cover normalized fixtures; source records rejected during mapping
remain listed in Advanced details.

Bookmaker discovery event counts are individual coverage, not shared-fixture or
complete-price counts. A third fresh bookmaker or a different pair may improve
coverage, but requires a new free quote and separate scan confirmation.

Fresh upstream evidence does not guarantee price availability, accepted stakes,
compatible bookmaker execution/void rules or profit. Standard matched data may
omit outcomes without a bookmaker back offer or an exchange lay counterpart
([provider filtering rules](https://oddsrelay.io/docs/guides/matched-board-filters),
checked 2026-10-09); insufficient coverage
returns no verified opportunity rather than fetching raw boards. No fabricated
winning probability or value algorithm is shown. Illustrative fractions and
formulas are expandable educational details, not stake recommendations.

## Architecture and storage

- `src/app/page.tsx`, `odds-dashboard.tsx`: scanner workflow at `/`.
- `src/app/research/`: one server-rendered archive, loading only a small aggregate
  `research-index.json`, never the 14 MB V0.6 artifact or private audits.
- `src/app/site-header.tsx`, `ui.module.css`: two-link navigation and shared UI.
- `src/lib/odds/`: provider-independent types, validation, pure engine and demo.
- `src/lib/odds/providers/`: official-contract parsing, normalization and HTTP.
- `src/lib/odds/server/`: server-only key runtime, handler, one-time approvals
  and bounded in-memory caches.
- Retained research libraries, fixtures, artifacts and `scripts/`: offline
  reproduction; no statistical fitting occurs in the product.

Free responses have a 32-entry, 120-second memory cache; snapshots have an
eight-entry, five-minute memory cache. Approvals and these caches reset on restart
or key change. The separate private snapshot store survives a restart. ETags are
reused only for exact canonical requests, including a restored snapshot. A 304
preserves original receipt, processing and evidence timestamps and rechecks their
age. Conditional odds requests always require a new quote and confirmation,
because changed data can cost tokens. No secret headers are persisted.

### Zero-token local history

Click **View previous scan · 0 tokens** inside **Scan history** to reopen the last
saved live response, or choose **Open · 0 tokens** from the saved list. This reads
only this computer: no OddsRelay call, including usage or discovery, and no API key
or session cookie is needed. Opening the page does not load history automatically.
History survives page refreshes and local server restarts; scans made before
V1.0.3 were not saved to disk and cannot be recovered after their old cache is lost.

The read-only view shows scan time, exact source bookmaker IDs, original actual
token cost, snapshot age at the freshness check, the historical receipt, original
research results and a separate current eligibility check. Original results are
reproduced at their recorded evaluation time with the unchanged engine. Stale
prices and started fixtures never appear as current verified opportunities. A
local one-shot timer updates the view at evidence expiry/kickoff; it makes no
request. Historical balances never replace the current account budget.

**Check for updated odds** prepares the original bookmaker selection and clears
old approvals; it requests nothing. Then manually refresh discovery, get a free
quote, acknowledge its possible charge and confirm once. All original bookmakers
must be eligible; there is no automatic substitute. Changing books makes a
different request. The server sends the exact saved ETag only for a matching
request. An ETag never promises zero cost: a 304 is reported as zero actual tokens
only when the response headers document zero, otherwise cost remains unknown.
A 304 saves a new historical receipt against the original snapshot without
refreshing price evidence. Updated data creates a new snapshot with its actual
receipt. The 500-token ceiling and all approval controls remain in force.

History is an atomic JSON file at **`data/private/odds-history/history.json`**,
covered by the existing `/data/private` gitignore rule and excluded from Next
output file tracing. It retains the **20 newest successful scan receipts**, with
an **8 MiB per-record** limit and **32 MiB total-file** limit; oldest receipts are
evicted first to meet either bound. There is no storage age expiry: price evidence
still expires after 120 seconds independently. Persistence failures preserve the
completed scan and actual receipt on screen with a warning, never a paid retry.

The store uses an explicit schema, checksum, bounded reads, private directory
permissions (0700), file permissions (0600), atomic replacement and an exclusive
writer lock. It rejects symlinks, hard-linked files, malformed data, unexpected
fields and unsafe permissions rather than inventing results or calling a provider.
Only normalized odds/identities, original timestamps, selected IDs, an exact ETag
and historical usage receipts are saved. Provider links, API keys, Authorization
headers, approval IDs and session cookies are excluded. The ETag stays server-only.
Detailed saved odds are returned only by an explicit same-origin local history
POST, never in page props, public bundles or committed/generated research artifacts.

If a process crashes while writing, stop local app processes before removing a
leftover `data/private/odds-history/write.lock`. The next successful locked write
removes orphan temporary files. Corrupt history is reported explicitly and is not
silently overwritten; preserve it for inspection, then remove the local history
file to start empty if desired. Removing the history directory deletes all saved
scans and ETags. This is private local storage, not encryption or a cloud backup.

[Architecture](docs/architecture.md) explains the boundaries.
[Cleanup audit](docs/cleanup-v101.md) lists removals, retained dependencies and
verification.

## Research archive and reproduction

The archive preserves the recorded findings: Dixon–Coles improved on independent
Poisson, but the historical market outperformed Dixon–Coles; corners were
**NONE / INCONCLUSIVE**; the V0.8 paper strategy was **INCONCLUSIVE** with losses
around **−4.74% / −7.44%**; calibration retained **IDENTITY_RETAINED**, promoted no
calibrator, and closed **0%** of the market Brier gap.

[Research methods and provenance](docs/research.md) retains definitions,
evaluation limitations, frozen hashes and source requirements. Raw Football-Data
CSVs and private audits remain ignored and are not redistributed. Original
OpenFootball fixtures and licensing remain committed. Early mock datasets remain
solely as inputs to retained numerical regression tests, not production fixtures.

```sh
pnpm data:build
pnpm model:build
pnpm corners:build
pnpm value:build
pnpm calibration:build
pnpm research:build
```

The first two commands reproduce committed result research without network
access. Corner/value/calibration commands also need the documented local private
CSVs. Missing sources must be reported, never replaced or invented.
`research:build` only projects committed aggregate artifacts; it fits no model.

## Tests and local security

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:watch` runs interactive Vitest. All provider HTTP tests use mocks and
spend zero tokens. Research tests retain causality, input validation, immutable
model specifications, deterministic uncertainty and artifact reproduction.

This is a trusted local application, not a hosted multi-user service. Loopback
binding, same-origin checks, strict JSON actions and an HttpOnly/SameSite=Strict
owner cookie protect token actions; they do not protect against malicious local
software or a compromised browser. Keep the key private and do not expose the
server to a LAN or public network. No authentication or database has been added.

Account access and balance require authenticated free discovery before the first
approved real scan; live offers still require a manual quote and confirmation.
This cleanup does not add value
betting, bookmakers, automated scanning, exchange execution or future milestones.
