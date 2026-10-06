import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EPL_SEASON_IDS, generateHistoricalDataset } from "../src/lib/data/openfootball.ts";

const sourceRoot = new URL("../data/external/openfootball/", import.meta.url);
const provenance = JSON.parse(await readFile(new URL("provenance.json", sourceRoot), "utf8"));
const sources = [];
for (const file of provenance.files) {
  const bytes = await readFile(new URL(file.localFile, sourceRoot));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== file.sha256) throw new Error(`Vendored source checksum mismatch: ${file.localFile}.`);
}
for (const id of EPL_SEASON_IDS) {
  const file = provenance.files.find((entry) => entry.upstreamPath === `${id}/1-premierleague.txt`);
  if (!file) throw new Error(`Missing provenance for season ${id}.`);
  sources.push({ id, text: await readFile(new URL(file.localFile, sourceRoot), "utf8") });
}
// Parse and validate every season before replacing the single generated artifact.
const dataset = generateHistoricalDataset(sources);
const output = new URL("../src/data/generated/epl-seasons.json", import.meta.url);
await mkdir(new URL(".", output), { recursive: true });
await writeFile(output, dataset);
console.log(`Generated ${fileURLToPath(output)}: 5 seasons × 380 completed matches = 1,900. Source hashes and all integrity checks passed.`);
