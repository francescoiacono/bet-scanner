import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { FIT_CONFIGURATION } from "../src/lib/dixon-coles/fit.ts";
import { COMPARISON_BOOTSTRAP } from "../src/lib/model-comparison/summaries.ts";
import { buildDatasetComparison } from "../src/lib/model-comparison/build-comparison.ts";

const root = new URL("../", import.meta.url);
const load = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const developmentSource = await load("data/external/openfootball/provenance.json");
const externalSource = await load("data/external/openfootball/external-validation-provenance.json");
for (const manifest of [developmentSource, externalSource]) {
  if (manifest.commit !== "b17e8f01707d83d2ce1790c14d4a5eeb35987825") throw new Error("Model build source commit changed.");
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(`data/external/openfootball/${file.localFile}`, root));
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Source checksum mismatch: ${file.localFile}.`);
  }
}
const specification = createHash("sha256");
for (const path of ["src/lib/dixon-coles/types.ts", "src/lib/dixon-coles/model.ts", "src/lib/dixon-coles/likelihood.ts", "src/lib/dixon-coles/fit.ts",
  "src/lib/model-comparison/run-paired-backtest.ts"]) specification.update(await readFile(new URL(path, root)));
const modelSpecificationSha256 = specification.digest("hex");
console.log(`Frozen model specification: ${modelSpecificationSha256}`);
const progress = (seasonId, count) => console.log(`${seasonId}: ${count} successful date-batch fits`);
const development = buildDatasetComparison(await load("src/data/generated/epl-seasons.json"), "DEVELOPMENT", progress);
console.log("Development evaluation complete. Evaluating external historical validation without changing the specification.");
const externalValidation = buildDatasetComparison(await load("src/data/generated/epl-external-seasons.json"), "EXTERNAL_VALIDATION", progress);
const artifact = {
  schemaVersion: 1, models: ["poisson-v1", "dixon-coles-v1"], modelSpecificationSha256,
  runtime: { node: process.versions.node, numeric: "1.2.6" },
  configuration: { fitting: FIT_CONFIGURATION, rhoSafetyBound: 0.20, scoreGridMaximum: 10, minimumVenueMatches: 2,
    identifiability: "sum attacks = 0; last attack derived", bootstrap: COMPARISON_BOOTSTRAP },
  provenance: { development: developmentSource, externalValidation: externalSource }, development, externalValidation,
};
const { values } = parseArgs({ options: { output: { type: "string" } } });
const output = values.output ? pathToFileURL(resolve(values.output)) : new URL("src/data/generated/model-comparison-v06.json", root);
const temporary = new URL(`${output.href}.tmp`);
await writeFile(temporary, JSON.stringify(artifact, null, 2) + "\n");
await rename(temporary, output);
console.log("Generated model-comparison-v06.json; both datasets complete; no failed or substituted fits.");
