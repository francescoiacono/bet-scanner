import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import summary from "../../data/generated/calibration-v09-summary.json";
import { modelComparison } from "../../data/model-comparison";
import { calibrationValidationStatus, selectCalibrationFamily } from "./bootstrap";
import { CALIBRATION_PROTOCOL, FROZEN_ARTIFACT_HASHES } from "./config";
import { applyHistoricalCalibration, developCalibration } from "./development";
import { attachMarketBenchmark } from "./market-benchmark";
import { canonicalCalibrationRecords, recordedCalibrationPrediction } from "./records";
import { summarizeHistoricalCalibration } from "./summary";
import type { CandidateEvidence } from "./bootstrap";
import type { HistoricalThreeWayPrice } from "../value/types";
import type { MarketValidationRecord, ScoredCalibrationRecord } from "./types";

const root = fileURLToPath(new URL("../../../", import.meta.url)), publicPath = join(root, "src/data/generated/calibration-v09-summary.json");
const hash = (path: string) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
const manifest = JSON.parse(readFileSync(join(root, "data/provenance/football-data-corners-v07.json"), "utf8")) as { files: { season: string; localFile: string; sha256: string }[] };
const sourcesAvailable = manifest.files.every((f) => existsSync(join(root, "data/private/football-data", f.localFile)));
const auditAvailable = existsSync(join(root, "data/private/generated/calibration-v09-audit.json"));
const older = canonicalCalibrationRecords(modelComparison.externalValidation.records.map(recordedCalibrationPrediction), "DEVELOPMENT");
const recent = canonicalCalibrationRecords(modelComparison.development.records.map(recordedCalibrationPrediction), "VALIDATION");

describe("calibration artifacts, canonical records and isolation", () => {
  it("publishes compact aggregates without identities, outcomes, prices or individual forecasts", () => {
    expect(readFileSync(publicPath).length).toBeLessThan(150_000);
    const forbidden = new Set(["records", "fixtureId", "sourceDate", "kickoffAt", "actualOutcome", "homeTeam", "awayTeam", "homeGoals", "awayGoals", "homeProbability", "drawProbability", "awayProbability", "homeOdds", "drawOdds", "awayOdds", "decimalOdds", "profit", "roi", "bets", "stake", "maximumDrawdown"]);
    const inspect = (value: unknown): void => { if (Array.isArray(value)) value.forEach(inspect); else if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) { expect(forbidden.has(key), key).toBe(false); inspect(nested); } }; inspect(summary);
  });
  it("locks the exact predeclared configuration and implementation", () => {
    expect(summary.configuration).toEqual(CALIBRATION_PROTOCOL);
    const specification = createHash("sha256");
    for (const name of ["config", "types", "transforms", "objective", "fit", "records", "metrics", "bootstrap", "development", "market-benchmark", "summary"]) specification.update(readFileSync(join(root, `src/lib/calibration/${name}.ts`)));
    for (const path of ["scripts/build-calibration-models.mjs", "src/lib/diagnostics/bootstrap.ts", "src/lib/backtest/metrics.ts"]) specification.update(readFileSync(join(root, path)));
    expect(specification.digest("hex")).toBe(summary.calibrationSpecificationSha256);
  });
  it("preserves all three frozen artifact hashes and known V0.1–V0.8 results", () => {
    for (const [file, pinned] of Object.entries(FROZEN_ARTIFACT_HASHES)) expect(hash(`src/data/generated/${file}`)).toBe(pinned);
    expect(summary.provenance.frozenArtifactHashes).toEqual(FROZEN_ARTIFACT_HASHES);
    const corner = JSON.parse(readFileSync(join(root, "src/data/generated/corners-v07-summary.json"), "utf8")), value = JSON.parse(readFileSync(join(root, "src/data/generated/value-v08-summary.json"), "utf8"));
    expect(corner.preferredModel).toBe("NONE / INCONCLUSIVE"); expect(value.status).toBe("INCONCLUSIVE");
    expect(modelComparison.development.summary.poissonV1Brier).toBe(0.634404090022038); expect(modelComparison.development.summary.dixonColesBrier).toBe(0.6096214837100087);
    expect(value.recent.strategy.roi).toBeCloseTo(-0.04737162162162161, 14); expect(value.older.strategy.roi).toBeCloseTo(-0.07438755670771229, 14);
    expect(summary.validation.forecasts.raw.brier).toBe(value.recent.probability.dixonColesBrier); expect(summary.validation.forecasts.market.brier).toBe(value.recent.probability.marketFairBrier);
  });
  it("projects exactly the frozen probabilities/outcomes and no prohibited model fields", () => {
    expect(older).toHaveLength(1691); expect(recent).toHaveLength(1688);
    for (const dataset of [modelComparison.externalValidation, modelComparison.development]) for (const r of dataset.records) {
      const projected = recordedCalibrationPrediction(r), p = r.dixonColesPrediction;
      expect(projected.probabilities).toEqual({ homeProbability: p.homeProbability, drawProbability: p.drawProbability, awayProbability: p.awayProbability }); expect(projected.actualOutcome).toBe(r.actualOutcome);
      expect(Object.keys(projected).sort()).toEqual(["fixtureId", "seasonId", "sourceDate", "probabilities", "actualOutcome"].sort());
    }
  });
  it("reproduces all four real rolling folds, 1351 identical candidate fixtures and final selection", () => {
    const result = developCalibration(older); expect(result.publicSummary).toEqual(summary.development); expect(result.finalFit).toEqual(summary.finalFit);
    expect(result.publicSummary.folds.map((f) => f.trainingRecords)).toEqual([340, 680, 1017, 1354]); expect(result.publicSummary.folds.map((f) => f.validationRecords)).toEqual([340, 337, 337, 337]);
    expect(result.records).toHaveLength(1351); expect(result.records.every((r) => r.seasonId !== "2014-15")).toBe(true); expect(result.finalFit.trainingRecords).toBe(1691);
    expect(selectCalibrationFamily(summary.development.candidates.filter((r) => r.family !== "identity").map((r) => ({ family: r.family, interval: r.bootstrap.interval })) as CandidateEvidence[])).toBe(summary.development.selectedFamily);
  });
  it("keeps all fixed diagnostic groups and ten-bin tables complete", () => {
    const v = summary.validation;
    expect(v.matches).toBe(1688); expect(v.seasons.reduce((n, s) => n + s.matches, 0)).toBe(v.matches);
    expect(v.confidenceBuckets.reduce((n, s) => n + s.matches, 0)).toBe(v.matches); expect(v.disagreementBuckets.reduce((n, s) => n + s.matches, 0)).toBe(v.matches);
    for (const f of Object.values(v.forecasts)) { expect(f.topConfidenceBins).toHaveLength(10); expect(f.topConfidenceBins.reduce((n, b) => n + b.count, 0)).toBe(v.matches); for (const o of f.outcomes) { expect(o.bins).toHaveLength(10); expect(o.bins.reduce((n, b) => n + b.count, 0)).toBe(v.matches); } }
    expect(v.status).toBe(calibrationValidationStatus(summary.finalFit.family as "identity", v.calibrationBootstrap.interval));
    if (summary.development.selectedFamily === "identity") { expect(v.forecasts.calibrated).toEqual(v.forecasts.raw); expect(v.gapClosedFraction).toBe(0); expect(v.researchModelVersion).toBeNull(); }
  });
  it.skipIf(!sourcesAvailable)("revalidates V0.8 sources and proves real market changes cannot affect any calibration result", async () => {
    const { loadValueSources } = await import("../../../scripts/value-sources.mjs"), sources = await loadValueSources();
    expect(sources.sourceHashes).toEqual(summary.provenance.sourceHashes); expect(sources.coverage.every((r: { alignedFixtures: number }) => r.alignedFixtures === 380)).toBe(true);
    const development = developCalibration(older), validation = applyHistoricalCalibration(recent, development.finalFit);
    const allPrices = new Map<string, HistoricalThreeWayPrice>(sources.normalized.flatMap((s: { prices: HistoricalThreeWayPrice[] }) => s.prices).map((p: HistoricalThreeWayPrice) => [p.fixtureId, p]));
    const prices = recent.map((r) => allPrices.get(r.fixtureId)!), a = attachMarketBenchmark(validation, prices), altered = prices.map((p, i) => i ? p : { ...p, homeOdds: p.homeOdds * 2 }), b = attachMarketBenchmark(validation, altered);
    expect(a.map((r) => r.calibrated)).toEqual(b.map((r) => r.calibrated)); expect(a[0].market).not.toEqual(b[0].market);
    expect(summarizeHistoricalCalibration(a, development.finalFit.family)).toEqual(summary.validation);
    expect(summarizeHistoricalCalibration(b, development.finalFit.family).forecasts.market.brier).not.toBe(summary.validation.forecasts.market.brier);
    expect(developCalibration(older)).toEqual(development);
    for (const f of manifest.files) expect(hash(`data/private/football-data/${f.localFile}`)).toBe(f.sha256);
    expect(execFileSync("git", ["ls-files", "data/private"], { cwd: root, encoding: "utf8" })).toBe("");
  }, 60000);
  it.skipIf(!auditAvailable)("reproduces recent public metrics from the gitignored private audit", () => {
    const audit = JSON.parse(readFileSync(join(root, "data/private/generated/calibration-v09-audit.json"), "utf8")) as { development: ScoredCalibrationRecord[]; validation: MarketValidationRecord[] };
    expect(audit.development).toHaveLength(1351); expect(audit.validation).toHaveLength(1688);
    expect(summarizeHistoricalCalibration(audit.validation, summary.finalFit.family as "identity")).toEqual(summary.validation);
    const path = "data/private/generated/calibration-v09-audit.json"; expect(execFileSync("git", ["check-ignore", path], { cwd: root, encoding: "utf8" }).trim()).toBe(path);
  });
  it.skipIf(!sourcesAvailable)("regenerates the compact artifact and audit byte-for-byte without modifying prior artifacts", () => {
    const temporary = mkdtempSync(join(tmpdir(), "bet-scanner-v09-repro-"));
    try {
      const output = join(temporary, "summary.json"), audit = join(temporary, "audit.json");
      execFileSync(process.execPath, ["--import", join(root, "scripts/register-typescript.mjs"), join(root, "scripts/build-calibration-models.mjs"), "--output", output, "--audit-output", audit], { cwd: root, timeout: 60000 });
      if (process.versions.node === summary.runtime.node) expect(readFileSync(output, "utf8")).toBe(readFileSync(publicPath, "utf8"));
      else { const regenerated = JSON.parse(readFileSync(output, "utf8")); for (let i = 0; i < 3; i++) expect(regenerated.development.candidates[i].brier).toBeCloseTo(summary.development.candidates[i].brier, 12); expect(regenerated.development.selectedFamily).toBe(summary.development.selectedFamily); }
      if (auditAvailable && process.versions.node === summary.runtime.node) expect(readFileSync(audit, "utf8")).toBe(readFileSync(join(root, "data/private/generated/calibration-v09-audit.json"), "utf8"));
      for (const [file, pinned] of Object.entries(FROZEN_ARTIFACT_HASHES)) expect(hash(`src/data/generated/${file}`)).toBe(pinned);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }, 60000);
});
