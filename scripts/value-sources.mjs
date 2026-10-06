import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { OLDER_PRICE_SEASONS, RECENT_PRICE_SEASONS } from "../src/lib/value/config.ts";
import { alignHistoricalPrices, parseHistoricalPrices, validatePricedSeason } from "../src/lib/value/data.ts";

export const projectRoot = new URL("../", import.meta.url);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const privatePriceUrl = new URL("data/private/generated/value-v08-prices.json", projectRoot);
/** Read local files only. Project canonical identity fields before any price join. */
export async function loadValueSources() {
  const manifest = JSON.parse(await readFile(new URL("data/provenance/football-data-corners-v07.json", projectRoot), "utf8"));
  const canonical = [];
  for (const file of ["epl-external-seasons.json", "epl-seasons.json"]) {
    const seasons = JSON.parse(await readFile(new URL(`src/data/generated/${file}`, projectRoot), "utf8"));
    canonical.push(...seasons.map((season) => ({ seasonId: season.id, fixtures: season.matches.map((m) => ({ fixtureId: m.id, seasonId: season.id, sourceDate: m.kickoffAt, homeTeam: m.homeTeam, awayTeam: m.awayTeam })) })));
  }
  const selected = [...OLDER_PRICE_SEASONS, ...RECENT_PRICE_SEASONS], files = [], missing = [];
  if (manifest.files.length !== selected.length || new Set(manifest.files.map((f) => f.season)).size !== selected.length) throw new Error("V0.7 source manifest must contain exactly ten unique selected seasons.");
  for (const season of selected) {
    const localFile = `${season.slice(2, 4)}${season.slice(5, 7)}-E0.csv`, path = `data/private/football-data/${localFile}`;
    try { files.push({ season, localFile, bytes: await readFile(new URL(path, projectRoot)) }); }
    catch (error) { if (error.code !== "ENOENT") throw error; missing.push(path); }
  }
  if (missing.length) throw new Error(`Missing manually supplied local price sources:\n${missing.join("\n")}`);
  const normalized = [], coverage = [], sourceHashes = [];
  for (const { season, localFile, bytes } of files) {
    const hash = sha256(bytes), pinned = manifest.files.find((f) => f.season === season && f.localFile === localFile);
    if (!pinned || pinned.sha256 !== hash) throw new Error(`${season} / ${localFile}: SHA-256 differs from immutable V0.7 provenance. Stop; do not replace sources or update hashes.`);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rows = parseHistoricalPrices(source, season); validatePricedSeason(rows, season);
    const fixtures = canonical.find((s) => s.seasonId === season)?.fixtures;
    if (!fixtures || fixtures.length !== 380) throw new Error(`${season}: canonical project season must contain 380 fixtures.`);
    const prices = alignHistoricalPrices(rows, fixtures, season);
    normalized.push({ seasonId: season, prices });
    coverage.push({ seasonId: season, sourceRows: rows.length, completePriceTriplets: prices.length, canonicalFixtures: fixtures.length, alignedFixtures: prices.length,
      teams: 20, homeFixturesPerTeam: 19, awayFixturesPerTeam: 19 });
    sourceHashes.push({ season, localFile, sha256: hash });
  }
  return { normalized, coverage, sourceHashes, canonical };
}
