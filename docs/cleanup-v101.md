# V1.0.1 dependency audit and cleanup

Starting commit: `b91812800e5accd15fa719ae6baccca4eda25f26` (clean checkout).

The inventory, counts, byte measurements and verification below record the
initial product consolidation. The separate [live discovery follow-up](#live-discovery-follow-up)
at the end records the subsequent user-reported integration repair.

The inventory was made before changing implementation files. Repository-wide
import/reference searches included `src`, `scripts`, tests, configuration and
documentation, rather than only React imports. A local pre-change manifest records
166 protected files and their SHA-256 hashes, plus every tracked file's byte size.
It includes research libraries, fixtures, generated artifacts, scripts, provenance,
licenses, the odds domain/provider/server and the API route. The four main artifact
hashes are also recorded in [research.md](research.md#frozen-artifacts).

## Inventory

| Classification | Files / evidence | Decision |
| --- | --- | --- |
| Active product | `src/lib/odds/**`, `/api/odds`, odds dashboard, server key boundary, `.env.example` | Preserve provider/domain/server behavior; relocate and redesign presentation. |
| Historical research | `src/lib/{football,backtest,diagnostics,dixon-coles,model-comparison,corners,value,calibration,betting}/`, `scan-markets.ts`, their tests, generated data, `scripts/**`, sources/provenance/licenses | Retain numerical implementations, tests, reproduction commands and frozen bytes. |
| Historical regression fixtures | `src/data/mock-fixtures.ts`, `mock-markets.ts`, `mock-played-matches.ts` | Retain: football, causal backtest, betting and scan-market tests import them. They are no longer loaded by any product page. |
| Historical artifact adapters | `src/data/model-comparison.ts`, `corners-summary.ts`, EPL season adapters | Retain: artifact and numerical regression tests consume them. |
| Obsolete presentation | Six individual research views, fictional dashboard, eight-link header and their CSS | Replace with the scanner homepage, two-link header and one compact research archive. |
| Obsolete implementation | `src/data/value-summary.ts`, `calibration-summary.ts` | Delete: only retired page components import them; retained tests import artifacts directly. Neither performs numerical research. |
| Unused assets | Five starter SVGs | Delete: no source, script, configuration or documentation references; favicon remains active via Next metadata. |

No numerical test is retired. The old provider key-boundary test follows the moved
dashboard/homepage, and rendering/state tests replace its overly broad prohibition
on all effects with verification that rendering makes no requests. The only new
timer expires a UI quote locally; it never fetches or confirms a scan.

## Explicit deletion list

Each pair below contains the complete page and its associated CSS module. Imports
were checked before deletion and are checked again after migration.

| Deleted file(s) | Reason |
| --- | --- |
| `src/app/backtest/page.tsx`, `src/app/backtest/backtest.module.css` | Replaced by `/research#early-poisson`; underlying backtest code/tests retained. |
| `src/app/diagnostics/page.tsx`, `src/app/diagnostics/diagnostics.module.css` | Replaced by `/research#early-poisson`; diagnostic code/tests retained. |
| `src/app/models/page.tsx`, `src/app/models/models.module.css` | Replaced by `/research#dixon-coles`; model comparison and 14 MB artifact retained. |
| `src/app/corners/page.tsx`, `src/app/corners/corners.module.css` | Replaced by `/research#corners`; corner models, provenance and tests retained. |
| `src/app/value/page.tsx`, `src/app/value/value.module.css` | Replaced by `/research#historical-value`; frozen paper evaluation retained. |
| `src/app/calibration/page.tsx`, `src/app/calibration/calibration.module.css` | Replaced by `/research#calibration`; fitted transforms, evaluations and tests retained. |
| `src/app/scanner-dashboard.tsx`, `src/app/scanner-dashboard.module.css` | Fictional product dashboard retired; all shared style consumers migrate to product CSS. |
| `src/app/research-header.tsx`, `src/app/research-header.module.css` | Replaced by reusable `SiteHeader` with exactly Scanner / Research. |
| `src/app/odds/page.tsx` | Scanner is now `/`; Next configuration redirects `/odds` to `/`. |
| `src/data/value-summary.ts` | Presentation-only adapter with no retained consumer. |
| `src/data/calibration-summary.ts` | Presentation-only adapter with no retained consumer. |
| `public/file.svg` | Unreferenced starter asset. |
| `public/globe.svg` | Unreferenced starter asset. |
| `public/next.svg` | Unreferenced starter asset. |
| `public/vercel.svg` | Unreferenced starter asset. |
| `public/window.svg` | Unreferenced starter asset. |

## Relocation and archive boundary

`src/app/odds/odds-dashboard.tsx` and `odds.module.css` move to
`src/app/odds-dashboard.tsx` and `odds-dashboard.module.css`, with redesigned
presentation. No research module is renamed or moved. The README is rewritten;
essential scientific definitions, findings, provenance and reproduction commands
are condensed into `docs/research.md`, rather than copying the old report.

`research:build` projects only aggregate values from committed artifacts into a
small `research-index.json`. Research rendering consumes that index, never the
large V0.6 artifact, private audits, source CSVs or numerical fitters.

## Verification

All 677 pre-existing tests remain; 24 rendering/workflow/archive tests were added
in two files. **701 tests in 44 files passed**. No test was retired. The old
key-boundary test's source paths follow the moved UI, and its timer assertion now
permits only local expiry presentation; provider/domain/server assertions remain.

`pnpm typecheck`, `pnpm lint` and `git diff --check` passed. Stale generated Next
route types were cleared after page retirement, without changing TypeScript
configuration. The default `pnpm build` stopped making progress during restricted
Turbopack compilation and was interrupted; it did not produce a successful build
or a new diagnostic. The environment has previously recorded the documented
CSS-worker port-binding restriction. **`pnpm build --webpack` passed**, producing
only `/`, `/research`, `/api/odds` and Next's built-in not-found route.

Local sources were available: `data:build`, `model:build`, `corners:build`,
`value:build`, `calibration:build` and the new `research:build` all passed. The
source files, manifests, license material, historical modules and generated
research artifacts remain unchanged. Of the original 166 protected entries,
**163 retained files match their baseline hashes**; the other three are the two
deliberately removed presentation adapters and the updated UI-boundary test.

| Frozen artifact | SHA-256 before = after |
| --- | --- |
| `model-comparison-v06.json` | `deb9fac92ebd104fcc15cf713b5e2600cfba5e56a8f58b30d219f469dccf8262` |
| `corners-v07-summary.json` | `bf4475b082608bf78a9f92b7986355745c62279d54b05509497a0699494fa4a7` |
| `value-v08-summary.json` | `d1fbf53cfd513bd9329893f5cb9205d039f455ed725c2cebc55a4b7de1990bb9` |
| `calibration-v09-summary.json` | `0324c424c7acbccd7bcf531d8375690078a11a087b3874f3a1f896f3e3b27449` |

Production HTTP verification returned 200 for both pages, ten referenced local
assets and the DEMO API action. All seven legacy URLs returned 308 to their
documented destinations, preserving queries and section anchors. GET on the
action API returned 405. DEMO provider actions, self-declared costs, unapproved
quotes/confirmations and cross-origin requests were rejected. Existing arbitrage
math and equalized payouts passed. A temporary verification-only network guard
outside the repository recorded **zero OddsRelay request attempts** during tests,
generators, builds, startup, rendering, navigation and API checks. No authenticated
or chargeable provider request was made. The temporary production server was
stopped after checking it.

The scanner's production browser bundle is about 25 KB and contains no provider
runtime, secret handling, private source references or large research records.
All three production traces exclude private data, Numeric fitting and the V0.6
artifact. The archive consumes only the 2,078-byte index. Neither `.env.local` nor
private data is tracked. The local key file and original source CSVs were not
edited; offline generators reproduced the private build outputs.

Browser discovery returned no available browser. Visual screenshots, hydrated
interaction and actual pixel overflow measurements were therefore **unavailable**.
Rendered HTML checks cover headings, labels, statuses, exact findings, collapsed
details, navigation and the key boundary. CSS checks cover 360 / 768 / 1280 px:
328 / 728 / 1160 px page containers, wrapped mobile navigation, single/two/three
bookmaker columns, contained horizontal table scrolling, zero-minimum grid widths,
44 px controls, global focus and reduced-motion rules. Text/status contrast ratios
are all above 4.5:1 (approximately 6.1–15.1:1). These are structural checks, not a
claim of browser layout measurements.

## Size comparison

Measured from the clean starting commit, including new tests in source totals.

| Group | Before bytes | After bytes | Change |
| --- | ---: | ---: | ---: |
| README | 110,631 | 10,956 | −99,675 |
| Source excluding generated artifacts | 719,469 | 631,227 | −88,242 |
| `src/app/` (included above) | 178,566 | 92,361 | −86,205 |
| Generated artifacts | 15,422,305 | 15,424,383 | +2,078 (aggregate index only) |
| Starter public assets | 3,314 | 0 | −3,314 |

All original generated bytes, the 14,262,766-byte model-comparison artifact and
the active `src/app/favicon.ico` remain unchanged.

## Files added and modified

The two relocated dashboard files are listed under Relocation above. There are
**24 deletions**, **two logical moves**, **14 additions** and **nine modified
existing files**. Git may display redesigned moves as deletion/addition because
their presentation changed substantially.

Added:

- `docs/research.md`, `docs/architecture.md`, `docs/cleanup-v101.md`
- `scripts/build-research-index.mjs`
- `src/data/generated/research-index.json`
- `src/app/site-header.tsx`, `src/app/site-header.module.css`, `src/app/site-footer.tsx`
- `src/app/ui.module.css`
- `src/app/research/page.tsx`, `src/app/research/research.module.css`
- `src/app/scanner-state.ts`, `src/app/scanner-state.test.ts`, `src/app/product.test.ts`

Modified:

- `AGENTS.md`: one durable consolidation rule; Next-generated guidance retained.
- `README.md`: concise current product/setup/guardrail guide.
- `next.config.ts`: seven documented permanent redirects.
- `package.json`: version 1.0.1 and offline `research:build`; dependencies unchanged.
- `src/app/page.tsx`: real scanner homepage.
- `src/app/layout.tsx`: accurate demo/live metadata.
- `src/app/globals.css`: shared palette, focus, type and reduced-motion rules.
- `src/lib/odds/server/handler.test.ts`: relocated source paths/local expiry assertion.
- `vitest.config.mts`: source alias and Next's empty server-only entry for Node SSR
  tests; production continues to enforce the real server-only boundary.

During the initial consolidation no live provider formula, endpoint, parser,
validation, budget or approval source changed. No dependency, bookmaker, new
statistical model, bet placement or V1.1 feature was added. Value betting and
other future milestones remain out of scope.

## Live discovery follow-up

The user subsequently reported `INVALID_ACTION_OR_DATA: Invalid competition
title.` after manual free discovery. An authenticated sports catalogue page
contained the unrelated basketball title `Lega A\t`. Strict title validation
stopped the whole catalogue before football discovery could finish.

`oddsrelay-contract.ts` now trims surrounding whitespace in catalogue display
titles only. Empty/non-string titles still fail; sport keys, groups, regions,
market identifiers and board identity matching remain strict. Discovery then
exposed a second adapter issue: `key.regions: []` was treated as denied access,
despite authenticated account regions containing `uk` and the free `/v2/regions`
endpoint explicitly returning `uk` with `requestable: true`. Effective regions
now inherit the authenticated account list when the key list is empty, or
intersect both lists when the key restricts regions. An account without UK
access and an explicitly non-UK key are still blocked.

The dashboard presents the full sanitized error beside Source & budget instead
of below the workflow. Focused tests cover title normalization, retained strict
fields, inherited/explicit region restrictions, paginated football discovery
and visible errors. No formulas, freshness windows, budget ceilings, approval
rules, endpoints, dependencies or frozen research bytes changed.

A fresh backend process completed authenticated discovery with selectable
bookmakers and no restrictions. Every diagnostic request reported
`X-Tokens-Cost: 0`. These manual checks used only free usage, sports, bookmakers,
coverage and region discovery; no quote or charged odds request was made. Keys
and raw account responses were not logged, persisted or changed. The existing
development service survives hot reloads, so `pnpm dev` must be restarted to
load the corrected adapter.

Follow-up verification: `pnpm test` passed **707 tests in 44 files** (six new
regressions), and `pnpm typecheck`, `pnpm lint`, `pnpm build --webpack` and
`git diff --check` passed. Tests and the production build used a temporary
provider network guard; the real diagnostic was a separate manual free-only
action in a fresh backend process. No research generator needed to change or
run again for this repair.

## Bookmaker usability follow-up

Configured pages now start in LIVE and make one free discovery attempt after
hydration. `useFreeDiscovery` prevents duplicate development effect replay and
does not retry or poll; manual refresh remains available. Unconfigured pages
and explicit DEMO mode stay offline. Quotes and charged scans still require
their separate explicit controls.

Discovery defaults select the exact `bet365` and `ladbrokes` IDs when eligible,
leaving unavailable/missing defaults unselected. Selected badges use a compact
28px minimum height and 5px corner radius. No domain, provider, server, scientific
or approval logic changed in this follow-up.

Verification passed: **717 tests in 45 files**, `pnpm typecheck`, `pnpm lint`,
`pnpm build --webpack` and `git diff --check`. Tests cover automatic discovery
eligibility, effect replay, callback/mode changes, preferred selection and
unavailable defaults. A temporary network guard recorded zero provider attempts
during verification. Browser preview was unavailable; hydrated visual checks were
not performed.
