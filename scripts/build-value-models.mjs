import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateFrozenPrices } from "../src/lib/value/backtest.ts";
import { historicalProfitabilityStatus } from "../src/lib/value/bootstrap.ts";
import { PRICE_COLUMNS, VALUE_PROTOCOL } from "../src/lib/value/config.ts";
import { recordedValuePrediction } from "../src/lib/value/frozen-predictions.ts";
import { valueCohortSummary } from "../src/lib/value/summary.ts";
import { loadValueSources, privatePriceUrl, projectRoot, sha256 } from "./value-sources.mjs";

const { normalized, coverage, sourceHashes, canonical } = await loadValueSources();
if (await readFile(privatePriceUrl, "utf8") !== JSON.stringify(normalized, null, 2) + "\n") throw new Error("Private prices differ from verified sources. Run value:data:build.");
const frozenBytes = await readFile(new URL("src/data/generated/model-comparison-v06.json", projectRoot));
const frozen = JSON.parse(frozenBytes);
const specification = createHash("sha256");
for (const path of ["config", "types", "aliases", "data", "market", "selection", "settlement", "frozen-predictions", "backtest", "statistics", "bootstrap", "summary"]) specification.update(await readFile(new URL(`src/lib/value/${path}.ts`, projectRoot)));
for (const path of ["src/lib/diagnostics/bootstrap.ts", "src/lib/backtest/metrics.ts", "scripts/value-sources.mjs", "scripts/build-value-models.mjs"]) specification.update(await readFile(new URL(path, projectRoot)));
const protocolSha256 = specification.digest("hex");
console.log(`Predeclared protocol SHA-256: ${protocolSha256}`);
console.log(JSON.stringify(VALUE_PROTOCOL));
const allPrices = new Map(normalized.flatMap((s) => s.prices).map((p) => [p.fixtureId, p]));
const canonicalFixtures = new Map(canonical.flatMap((s) => s.fixtures).map((f) => [f.fixtureId, f]));
const evaluate = (dataset, cohort, expected) => {
  const predictions = dataset.records.map(recordedValuePrediction);
  if (predictions.length !== expected) throw new Error(`${cohort}: expected exactly ${expected} frozen evaluated records, found ${predictions.length}.`);
  const prices = predictions.map((p) => {
    const identity = canonicalFixtures.get(p.fixtureId), price = allPrices.get(p.fixtureId);
    if (!identity || ["seasonId", "sourceDate", "homeTeam", "awayTeam"].some((key) => identity[key] !== p[key]) || !price) throw new Error(`Frozen fixture identity/price coverage mismatch: ${p.fixtureId}`);
    return price;
  });
  const records = evaluateFrozenPrices(predictions, prices, cohort);
  return { records, summary: valueCohortSummary(records, cohort) };
};
const recent = evaluate(frozen.development, "RECENT", 1688), older = evaluate(frozen.externalValidation, "OLDER", 1691);
const status = historicalProfitabilityStatus(recent.summary.roiBootstrap.interval, older.summary.roiBootstrap.interval);
const summary = { schemaVersion: 1, status, protocolSha256, runtime: { node: process.versions.node, next: "16.3.8", numeric: "1.2.6" }, configuration: { ...VALUE_PROTOCOL, extractedColumns: PRICE_COLUMNS },
  provenance: { sourceName: "Football-Data / manually supplied local CSVs", sourceHashes, sourceManifest: "data/provenance/football-data-corners-v07.json", frozenV06ArtifactSha256: sha256(frozenBytes), frozenV06ModelSpecificationSha256: frozen.modelSpecificationSha256 },
  coverage: coverage.map((row) => { const cohort = row.seasonId.startsWith("202") ? recent : older; const evaluatedRecords = cohort.records.filter((r) => r.seasonId === row.seasonId).length;
    return { ...row, evaluatedRecords, pricedEvaluatedRecords: evaluatedRecords, pricedCoverage: 1 }; }),
  recent: recent.summary, older: older.summary };
const audit = { schemaVersion: 1, protocolSha256, frozenV06ArtifactSha256: sha256(frozenBytes), recent: recent.records, older: older.records };
const { values } = parseArgs({ options: { output: { type: "string" }, "audit-output": { type: "string" } } });
const publicOutput = values.output ? pathToFileURL(resolve(values.output)) : new URL("src/data/generated/value-v08-summary.json", projectRoot);
const privateOutput = values["audit-output"] ? pathToFileURL(resolve(values["audit-output"])) : new URL("data/private/generated/value-v08-audit.json", projectRoot);
const publicText = JSON.stringify(summary, null, 2) + "\n";
if (Buffer.byteLength(publicText) >= 150_000) throw new Error("Aggregate public summary exceeds the 150 KB limit.");
const atomicWrite = async (url, content) => { await mkdir(dirname(fileURLToPath(url)), { recursive: true }); const temporary = new URL(`${url.href}.tmp`); await writeFile(temporary, content); await rename(temporary, url); };
// Write only after all ten seasons, both cohorts and all coverage checks succeed.
await atomicWrite(privateOutput, JSON.stringify(audit, null, 2) + "\n"); await atomicWrite(publicOutput, publicText);
console.log(`Public aggregate: ${Buffer.byteLength(publicText)} bytes. Private audit: 1688 recent + 1691 older records. Research status: ${status}.`);
