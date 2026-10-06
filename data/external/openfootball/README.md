# OpenFootball Premier League source snapshot

Source: [openfootball/england](https://github.com/openfootball/england).

Pinned commit: [`b17e8f01707d83d2ce1790c14d4a5eeb35987825`](https://github.com/openfootball/england/tree/b17e8f01707d83d2ce1790c14d4a5eeb35987825), committed 2026-09-21T10:35:47Z.

Two explicit datasets are used: development / diagnostic seasons 2021-22 through 2025-26, and external historical validation seasons 2014-15 through 2018-19. Each upstream path is `<season>/1-premierleague.txt`; no snapshot update is made. Their exact bytes are vendored as `<season>-premierleague.txt`. The exact upstream `LICENSE.md` is retained: CC0 1.0 Universal / public domain. This license applies to the vendored data; it does not change the application's licensing.

`provenance.json` retains the original development provenance unchanged. `external-validation-provenance.json` records the five added paths, exact-byte SHA-256 hashes, and the same pinned commit/license. Source files are not reformatted or manually edited. Some contain upstream trailing whitespace.

To deterministically retrieve the same snapshot from the repository root:

```sh
upstream_commit=b17e8f01707d83d2ce1790c14d4a5eeb35987825
for season in 2014-15 2015-16 2016-17 2017-18 2018-19 2021-22 2022-23 2023-24 2024-25 2025-26; do
  curl --fail --location "https://raw.githubusercontent.com/openfootball/england/$upstream_commit/$season/1-premierleague.txt" \
    --output "data/external/openfootball/$season-premierleague.txt"
done
curl --fail --location "https://raw.githubusercontent.com/openfootball/england/$upstream_commit/LICENSE.md" \
  --output data/external/openfootball/LICENSE.md
pnpm data:build
```

The download is a manual acquisition step. `pnpm data:build` is entirely offline: it verifies source/license hashes, parses results, requires exactly five complete 380-match seasons per explicit dataset, each with 20 teams and 19 home/19 away appearances per team, then generates separate `src/data/generated/epl-seasons.json` and `epl-external-seasons.json` artifacts deterministically. Both are validated before either is replaced. Do not silently accept a changed upstream snapshot or a partial season.

Normalization uses noon UTC only as a source-calendar-date ordering key. It does not preserve or claim historical kickoff times. Half-time scores, scorer details, and unrelated metadata are excluded; malformed apparent match rows fail explicitly. The final application loads local generated data and never downloads it at runtime.
