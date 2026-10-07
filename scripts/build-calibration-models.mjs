import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CALIBRATION_PROTOCOL, FROZEN_ARTIFACT_HASHES } from "../src/lib/calibration/config.ts";
import { applyHistoricalCalibration, developCalibration } from "../src/lib/calibration/development.ts";
import { attachMarketBenchmark } from "../src/lib/calibration/market-benchmark.ts";
import { canonicalCalibrationRecords, recordedCalibrationPrediction } from "../src/lib/calibration/records.ts";
import { finalParameterSummary, summarizeHistoricalCalibration } from "../src/lib/calibration/summary.ts";
import { loadValueSources, privatePriceUrl, projectRoot, sha256 } from "./value-sources.mjs";

const { values } = parseArgs({ options: { output: { type: "string" }, "audit-output": { type: "string" } } });
const inputs = {};
for (const [file, pinned] of Object.entries(FROZEN_ARTIFACT_HASHES)) {
  const bytes = await readFile(new URL(`src/data/generated/${file}`, projectRoot));
  if (sha256(bytes) !== pinned) throw new Error(`${file} differs from the frozen V0.6/V0.7/V0.8 artifact. Calibration will not modify or accommodate it.`);
  inputs[file] = bytes;
}
const specification = createHash("sha256");
for (const name of ["config", "types", "transforms", "objective", "fit", "records", "metrics", "bootstrap", "development", "market-benchmark", "summary"]) specification.update(await readFile(new URL(`src/lib/calibration/${name}.ts`, projectRoot)));
for (const path of ["scripts/build-calibration-models.mjs", "src/lib/diagnostics/bootstrap.ts", "src/lib/backtest/metrics.ts"]) specification.update(await readFile(new URL(path, projectRoot)));
const calibrationSpecificationSha256 = specification.digest("hex");
console.log(`Predeclared calibration specification: ${calibrationSpecificationSha256}`);
console.log(JSON.stringify(CALIBRATION_PROTOCOL));
const v06 = JSON.parse(inputs["model-comparison-v06.json"]);
const older = canonicalCalibrationRecords(v06.externalValidation.records.map(recordedCalibrationPrediction), "DEVELOPMENT");
const assertCounts = (records, expected) => {
  if (records.length !== Object.values(expected).reduce((s, n) => s + n, 0) || Object.entries(expected).some(([season, count]) => records.filter((r) => r.seasonId === season).length !== count)) throw new Error("Frozen calibration eligible counts differ from the predeclared protocol.");
};
assertCounts(older, { "2014-15": 340, "2015-16": 340, "2016-17": 337, "2017-18": 337, "2018-19": 337 });
// Gate 1: no recent outcomes or prices enter rolling selection or the final fit.
const development = developCalibration(older);
if (development.publicSummary.rollingValidationRecords !== 1351 || development.finalFit.trainingRecords !== 1691) throw new Error("Calibration rolling/final training coverage mismatch.");
console.log(`Older-only selection: ${development.publicSummary.selectedFamily}; final parameters frozen on 1691 older records.`);
// Gate 2: apply exactly one frozen map to all recent forecasts before loading market data.
const recent = canonicalCalibrationRecords(v06.development.records.map(recordedCalibrationPrediction), "VALIDATION");
assertCounts(recent, { "2021-22": 340, "2022-23": 340, "2023-24": 328, "2024-25": 340, "2025-26": 340 });
const calibrated = applyHistoricalCalibration(recent, development.finalFit);
// Gate 3: revalidate the SAME V0.8 price sources/alignment, solely as a benchmark.
const { normalized, sourceHashes, coverage } = await loadValueSources();
if (await readFile(privatePriceUrl, "utf8") !== JSON.stringify(normalized, null, 2) + "\n") throw new Error("Private prices differ from verified V0.8 sources. Run value:data:build.");
const v08 = JSON.parse(inputs["value-v08-summary.json"]);
if (JSON.stringify(sourceHashes) !== JSON.stringify(v08.provenance.sourceHashes) || JSON.stringify(v08.configuration.priceFields) !== JSON.stringify(["B365H", "B365D", "B365A"])) throw new Error("Calibration benchmark differs from the frozen V0.8 price definition/hashes.");
const prices = new Map(normalized.flatMap((s) => s.prices).map((p) => [p.fixtureId, p]));
const benchmark = attachMarketBenchmark(calibrated, recent.map((r) => { const p = prices.get(r.fixtureId); if (!p) throw new Error(`Missing calibration benchmark price ${r.fixtureId}`); return p; }));
const validation = summarizeHistoricalCalibration(benchmark, development.publicSummary.selectedFamily);
const summary = { schemaVersion: 1, calibrationSpecificationSha256, runtime: { node: process.versions.node, numeric: "1.2.6" },
  configuration: CALIBRATION_PROTOCOL, provenance: { frozenArtifactHashes: FROZEN_ARTIFACT_HASHES, sourceHashes, valueV08ProtocolSha256: v08.protocolSha256 },
  coverage: { olderTrainingRecords: older.length, rollingValidationRecords: 1351, recentValidationRecords: recent.length, pricedValidationRecords: benchmark.length,
    sourceSeasons: coverage.map((r) => ({ seasonId: r.seasonId, alignedFixtures: r.alignedFixtures })) },
  development: development.publicSummary, finalFit: development.finalFit, finalParameters: finalParameterSummary(development.finalFit), validation };
const audit = { schemaVersion: 1, calibrationSpecificationSha256, development: development.records, validation: benchmark };
const publicText = JSON.stringify(summary, null, 2) + "\n";
if (Buffer.byteLength(publicText) >= 150_000) throw new Error("Calibration aggregate artifact exceeds 150 KB.");
const atomicWrite = async (url, text) => { await mkdir(dirname(fileURLToPath(url)), { recursive: true }); const temporary = new URL(`${url.href}.tmp`); await writeFile(temporary, text); await rename(temporary, url); };
const publicOutput = values.output ? pathToFileURL(resolve(values.output)) : new URL("src/data/generated/calibration-v09-summary.json", projectRoot);
const privateOutput = values["audit-output"] ? pathToFileURL(resolve(values["audit-output"])) : new URL("data/private/generated/calibration-v09-audit.json", projectRoot);
await atomicWrite(privateOutput, JSON.stringify(audit, null, 2) + "\n"); await atomicWrite(publicOutput, publicText);
console.log(`Generated ${Buffer.byteLength(publicText)}-byte aggregate; 1351 rolling + 1688 recent audit records remain private. Status: ${validation.status}; research model: ${validation.researchModelVersion ?? "not promoted"}.`);
