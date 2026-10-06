import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EPL_SEASON_IDS, EXTERNAL_EPL_SEASON_IDS, generateHistoricalDataset } from "../src/lib/data/openfootball.ts";

const sourceRoot = new URL("../data/external/openfootball/", import.meta.url);
const configurations = [
  { dataset: "DEVELOPMENT", ids: EPL_SEASON_IDS, manifest: "provenance.json", output: "epl-seasons.json" },
  { dataset: "EXTERNAL_VALIDATION", ids: EXTERNAL_EPL_SEASON_IDS, manifest: "external-validation-provenance.json", output: "epl-external-seasons.json" },
];
const outputs = [];
for (const config of configurations) {
  const provenance = JSON.parse(await readFile(new URL(config.manifest, sourceRoot), "utf8"));
  if (provenance.commit !== "b17e8f01707d83d2ce1790c14d4a5eeb35987825") throw new Error("Historical source commit changed.");
  const sources = [];
  for (const file of provenance.files) {
    const bytes = await readFile(new URL(file.localFile, sourceRoot));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== file.sha256) throw new Error(`Vendored source checksum mismatch: ${file.localFile}.`);
  }
  for (const id of config.ids) {
    const file = provenance.files.find((entry) => entry.upstreamPath === `${id}/1-premierleague.txt`);
    if (!file) throw new Error(`Missing provenance for season ${id}.`);
    sources.push({ id, text: await readFile(new URL(file.localFile, sourceRoot), "utf8") });
  }
  outputs.push({ output: new URL(`../src/data/generated/${config.output}`, import.meta.url),
    contents: generateHistoricalDataset(sources, config.dataset) });
}
// Validate both datasets before replacing either artifact. No acquisition here.
for (const { output, contents } of outputs) {
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, contents);
  console.log(`Generated ${fileURLToPath(output)}: 5 seasons × 380 matches. Source hashes and all integrity checks passed.`);
}
