import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DEVELOPMENT_CORNER_SEASONS, EXTERNAL_CORNER_SEASONS, REQUIRED_CORNER_COLUMNS } from "../src/lib/corners/config.ts";
import { parseCornerCsv, validateCornerSeason } from "../src/lib/corners/data.ts";

export const projectRoot = new URL("../", import.meta.url);
export const cornerManifestUrl = new URL("data/provenance/football-data-corners-v07.json", projectRoot);
const filename = (season) => `${season.slice(2, 4)}${season.slice(5, 7)}-E0.csv`;
/** Local filesystem only. No downloader, HTTP client, odds mapping, or network access. */
export async function loadCornerSources({ allowNewManifest = false } = {}) {
  const selected = [...EXTERNAL_CORNER_SEASONS, ...DEVELOPMENT_CORNER_SEASONS];
  const files = [], missing = [];
  for (const season of selected) {
    const localFile = filename(season), path = `data/private/football-data/${localFile}`;
    try { files.push({ season, localFile, bytes: await readFile(new URL(path, projectRoot)) }); }
    catch (error) { if (error.code !== "ENOENT") throw error; missing.push(path); }
  }
  if (missing.length) throw new Error(`Missing local corner source files:\n${missing.join("\n")}`);
  const entries = files.map(({ season, localFile, bytes }) => ({ season, localFile, sha256: createHash("sha256").update(bytes).digest("hex") }));
  let manifest, isNew = false;
  try { manifest = JSON.parse(await readFile(cornerManifestUrl, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT" || !allowNewManifest) throw error;
    isNew = true;
    manifest = { schemaVersion: 1, sourceName: "Football-Data.co.uk / English Premier League", sourcePage: "https://www.football-data.co.uk/englandm.php",
      acquisitionMethod: "Manually downloaded and supplied locally by the user; no automated acquisition",
      rawSourcePolicy: "Original CSVs and normalized match rows are intentionally not redistributed; data/private/ is gitignored",
      requiredColumns: [...REQUIRED_CORNER_COLUMNS], files: entries };
  }
  if (manifest.files.length !== entries.length || JSON.stringify(manifest.requiredColumns) !== JSON.stringify([...REQUIRED_CORNER_COLUMNS])
    || entries.some((entry) => !manifest.files.some((record) => record.season === entry.season && record.localFile === entry.localFile && record.sha256 === entry.sha256))) {
    throw new Error("Corner source SHA-256 / season manifest mismatch. Existing provenance is immutable; source files were not overwritten or re-hashed.");
  }
  const seasons = files.map(({ season, bytes }) => {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const result = { id: season, matches: parseCornerCsv(source, season) }; validateCornerSeason(result); return result;
  });
  return { manifest, isNew, datasets: { development: seasons.filter((season) => DEVELOPMENT_CORNER_SEASONS.includes(season.id)),
    externalValidation: seasons.filter((season) => EXTERNAL_CORNER_SEASONS.includes(season.id)) } };
}
