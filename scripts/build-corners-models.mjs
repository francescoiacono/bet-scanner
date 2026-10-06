import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CORNER_BOOTSTRAP, CORNER_FIT_CONFIGURATION, CORNER_OVER_LINES, CORNER_PROMOTION_RULE, MAX_EXPLICIT_TOTAL_CORNERS } from "../src/lib/corners/config.ts";
import { evaluateCornerDataset, preferredCornerModel } from "../src/lib/corners/summary.ts";
import { loadCornerSources, projectRoot } from "./corner-sources.mjs";

const { manifest, datasets } = await loadCornerSources();
const privateInput = await readFile(new URL("data/private/generated/epl-corners-v07.json", projectRoot), "utf8");
if (privateInput !== JSON.stringify(datasets, null, 2) + "\n") throw new Error("Private normalized corner data differs from verified sources. Run corners:data:build.");
const specification = createHash("sha256");
for (const path of ["config", "types", "data", "distributions", "likelihood", "fit", "prediction", "metrics", "backtest", "summary"]) {
  specification.update(await readFile(new URL(`src/lib/corners/${path}.ts`, projectRoot)));
}
const modelSpecificationSha256 = specification.digest("hex");
console.log(`Frozen corner specification: ${modelSpecificationSha256}`);
console.log(`Predeclared research preference: ${CORNER_PROMOTION_RULE}`);
const progress = (season, count) => console.log(`${season}: ${count} Poisson + ${count} NB successful causal date-batch fits`);
const development = evaluateCornerDataset(datasets.development, "DEVELOPMENT", progress);
console.log("Development complete; evaluating external history with the unchanged specification.");
const external = evaluateCornerDataset(datasets.externalValidation, "EXTERNAL_VALIDATION", progress);
const summary = { status: "AVAILABLE", schemaVersion: 1, modelSpecificationSha256, runtime: { node: process.versions.node, numeric: "1.2.6" },
  configuration: { fitting: CORNER_FIT_CONFIGURATION, minimumVenueMatches: 2, maximumExplicitTotal: MAX_EXPLICIT_TOTAL_CORNERS,
    overLines: CORNER_OVER_LINES, bootstrap: CORNER_BOOTSTRAP, promotionRule: CORNER_PROMOTION_RULE, meanStructure: "sum attacks = 0; log home = h+a_home+d_away; log away = a_away+d_home; NB alpha=exp(rawAlpha)",
    assumptions: "independent home/away counts; equal prior within-season weights; no decay, shrinkage, regularisation or previous-season prior" },
  provenance: manifest, development: development.publicSummary, externalValidation: external.publicSummary,
  preferredModel: preferredCornerModel(external.publicSummary.bootstrap.interval) };
const audit = { schemaVersion: 1, modelSpecificationSha256, development: development.privateAudit, externalValidation: external.privateAudit };
const { values } = parseArgs({ options: { output: { type: "string" }, "audit-output": { type: "string" } } });
const publicOutput = values.output ? pathToFileURL(resolve(values.output)) : new URL("src/data/generated/corners-v07-summary.json", projectRoot);
const privateOutput = values["audit-output"] ? pathToFileURL(resolve(values["audit-output"])) : new URL("data/private/generated/corners-v07-audit.json", projectRoot);
const atomicWrite = async (url, value) => {
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  const temporary = new URL(`${url.href}.tmp`); await writeFile(temporary, JSON.stringify(value, null, 2) + "\n"); await rename(temporary, url);
};
// No outputs are replaced until BOTH complete datasets have valid fits.
await atomicWrite(privateOutput, audit); await atomicWrite(publicOutput, summary);
console.log(`Generated aggregate-only public summary (${Buffer.byteLength(JSON.stringify(summary, null, 2) + "\n")} bytes); detailed rows/coefficients remain private. Preference: ${summary.preferredModel}.`);
