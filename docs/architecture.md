# Architecture

## Two product destinations

`/` is the Odds Scanner. Its server page obtains an offline demo and a server-key
configuration boolean, then renders the client dashboard. It does not construct
a provider service or fetch data. Configured clients start in LIVE, configured but
unverified; unconfigured clients start in offline DEMO. Hydration, navigation,
browser refresh, mode changes, Strict Mode replay and hot reload trigger no
provider requests. `/research` is a server-rendered archive.

`SiteHeader` exposes exactly Scanner and Research. It receives explicit page and
source state, with no global provider context or request. Shared CSS variables
live in `globals.css`; structural controls/cards/tables are in `ui.module.css`;
scanner and archive styles remain separate.

Next configuration uses permanent 308 redirects:

| Old URL | Destination |
| --- | --- |
| `/odds` | `/` |
| `/backtest`, `/diagnostics` | `/research#early-poisson` |
| `/models` | `/research#dixon-coles` |
| `/corners` | `/research#corners` |
| `/value` | `/research#historical-value` |
| `/calibration` | `/research#calibration` |

There are no duplicate legacy page components. Section anchors retain useful
destinations; query parameters pass through Next's redirect implementation.

## Price comparison boundary

```text
explicit manual discovery / quote / confirmation
  -> unchanged POST /api/odds
  -> strict handler / local origin / owner cookie
  -> server-only runtime
  -> existing OddsScannerService
  -> OddsRelay HTTP + official-contract adapter
  -> provider-independent snapshot
  -> pure arbitrage engine
  -> local dashboard
```

The domain owns exact fixture/competition identity, identical settlement, BACK
side, source evidence, validation and arbitrage math. Provider-specific parsing
stays outside it. Exchange LAY offers are not domain inputs for this product.

The server-only runtime is the sole reader of `ODDSRELAY_KEY`. A changed key
fingerprint creates a new service, discarding prior approvals/cache. Raw keys,
Authorization headers and provider error bodies never reach browser props,
bundles, logs or persisted data. Type-only imports from service definitions do not
pull server implementation into the browser.

The initial V1.0.1 consolidation preserved these provider/domain/server modules.
A later discovery repair trims catalogue display titles and computes effective
regions from the authenticated account list, intersected with an explicit key
restriction when present. An empty key-region list inherits account regions.
Exact event/market matching, financial formulas and all charge controls remain
unchanged; errors appear beside the source status.

## Approval and UI state

Free discovery precedes a literal free quote. The service stores a UUID approval
with owner, canonical parameters, quoted cost and creation time. Confirmation
consumes it synchronously before any await, verifies fresh usage/scope/expiry and
performs one potentially charged request. All failure paths require a new quote;
there is no automatic charged retry.

The UI reducer owns mode, selection, displayed quote, warning acknowledgment,
results and errors. Selection/mode changes discard quote and acknowledgment.
Starting confirmation clears the displayed approval before awaiting; an in-flight
ref blocks duplicate submissions. **Refresh discovery · free** is the only
discovery trigger; the obsolete automatic-discovery hook and its tests were removed
in V1.0.2. Pricing, event discovery, quotes and scans also require explicit controls.
There are no automatic retries or provider polling.

`discoveryFreshness` accepts an explicit clock, parses the strict UTC `capturedAt`
timestamp with the existing validator and uses `APPROVAL_LIFETIME_MS` (60 seconds).
It rejects missing, invalid and future times, and expires at the exact boundary.
`discoveryStatus` supplies the same readiness for account labels, bookmaker
controls and new quotes. Its states are not configured, configured but unverified,
verifying, verified, discovery expired, insufficient coverage and provider error.

The dashboard keeps a presentation clock updated by explicit actions and local
expiry callbacks. A one-shot discovery timer schedules the remaining lifetime,
marks that discovery expired, and never clears a quote or requests data. It is
cleaned up when discovery changes or the dashboard unmounts. Its reducer action
includes `capturedAt`, so an old callback cannot expire a newer discovery.
Expired/invalid discovery remains unavailable until refreshed, including through
mode changes. Click handlers recheck the current clock before selecting books or
requesting a quote, even if a local timer is delayed.

Discovery and approval lifetimes are independent. The separate existing quote
timer remains in place; discovery expiry blocks only new quotes and preserves an
existing approval/acknowledgment until its own expiry. Refresh still clears both.
The server's confirmation rules and lifetime checks are unchanged. Neither local
timer performs HTTP, quotes or confirmations, and neither uses an interval.

Previous discovery timestamps/coverage stay visible with refresh guidance and
disabled selection/new-quote controls. Refresh replaces discovery, drops old
selections and selects only eligible exact `bet365` and `ladbrokes` IDs. Missing
or unavailable defaults receive no substitute.

The server remains authoritative even if client state or clocks are manipulated.
The 500-token cap, actual-balance checks, 60-second expiry and one-time approval
are server rules. UI state tests exercise transitions without any HTTP; all
provider tests mock HTTP.

A LIVE error clears live results and never restores demo data. Ordinary
non-arbitrage, insufficient valid evidence, provider error and no requested scan
have distinct descriptions. Source/budget and approval controls remain visible;
technical information and educational fractions use native expandable details.

`scanDiagnostics` derives coverage counts, affected-fixture reason counts and
table ordering from the engine's recorded analysis. It never revalidates prices,
changes classifications or requests data. Complete markets appear before the
collapsed insufficient-data table; theoretical opportunities keep the engine's
ranking, other complete markets sort by S ascending with kickoff/event-ID ties.
Reasons count each affected fixture once, including its price exclusions; reason
counts can overlap. A no-arbitrage statement is scoped to the complete subset.
Discovery counts describe individual bookmakers, not their shared fixtures.

## Cache and process limits

| State | Bound / expiry | Behavior |
| --- | --- | --- |
| Free HTTP bodies and ETags | 32 entries / 120 seconds | 304 may reuse body; no polling |
| Discovery | 60 seconds | Fresh verification required before quote |
| Server approvals | 128 entries / 60 seconds | Owner-bound, one-time; process-local |
| Odds snapshots and ETags | 8 entries / 5 minutes | Exact request identity; approved conditional fetch only |

304 never changes source evidence timestamps. Price eligibility is always
recomputed at the current evaluation clock, with the existing 120-second maximum.
Cache loss/restart cannot authorize a scan or trigger a fallback request.

One process serializes charged scans. This is a trusted loopback app, not a
multi-user/distributed service. Memory state is intentionally not shared between
processes; database, cloud coordination, login and deployment are outside scope.

## Frozen research boundary

Historical numerical modules, tests, source manifests, licensing and generated
artifacts remain for reproducibility. The original model names, parameters,
thresholds, seeds and scientific conclusions are unchanged.

`scripts/build-research-index.mjs` reads four committed artifacts offline, selects
a few aggregate results and records source SHA-256 hashes. It writes the small
`src/data/generated/research-index.json` deterministically. It never reads private
CSV/audit rows or runs a fitter. The archive page imports only this index;
reproduction tests can still read full artifacts outside the product.

Build scripts remain available independently of Next. The retained mock fixtures
are referenced by football/backtest/betting regression tests and are not reachable
from either product page. Presentation-only value/calibration adapters and the
fictional React scanner were removed after import searches.

See [research.md](research.md) for immutable scientific methods and sources,
and [cleanup-v101.md](cleanup-v101.md) for the dependency inventory and deletion
reasons.
