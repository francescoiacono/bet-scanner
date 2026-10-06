import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cornersSummary } from "../../data/corners-summary";
import { modelComparison } from "../../data/model-comparison";
import { backtestCorners } from "./backtest";
import { selectedCornerSeasons, validateCornerSeason } from "./data";
import { preferredCornerModel } from "./summary";
import { syntheticCornerHistory } from "./test-fixtures";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const artifactPath = join(root, "src/data/generated/corners-v07-summary.json");
const manifest = JSON.parse(readFileSync(join(root, "data/provenance/football-data-corners-v07.json"), "utf8"));
const localSourcesAvailable = manifest.files.every((f: { localFile: string }) => existsSync(join(root, "data/private/football-data", f.localFile)));

describe("compact public corner artifact and private-source boundary", () => {
  it("contains aggregates only, is compact, and locks the recorded configuration/specification", () => {
    const bytes = readFileSync(artifactPath); expect(bytes.length).toBeLessThan(150_000);
    const forbidden = new Set(["records", "fits", "teams", "rawParameters", "homeTeam", "awayTeam", "homeCorners", "awayCorners", "kickoffAt", "fixtureId", "actualTotal", "decimalOdds", "odds"]);
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) { expect(forbidden.has(key), key).toBe(false); if (key === "matches") expect(typeof nested).toBe("number"); inspect(nested); }
    };
    inspect(JSON.parse(bytes.toString()));
    const specification = createHash("sha256");
    for (const name of ["config", "types", "data", "distributions", "likelihood", "fit", "prediction", "metrics", "backtest", "summary"]) specification.update(readFileSync(join(root, `src/lib/corners/${name}.ts`)));
    expect(specification.digest("hex")).toBe(cornersSummary.modelSpecificationSha256);
    expect(cornersSummary.preferredModel).toBe(preferredCornerModel(cornersSummary.externalValidation.bootstrap.interval));
    expect(modelComparison.development.summary.poissonV1Brier).toBe(0.634404090022038);
    expect(modelComparison.development.summary.dixonColesBrier).toBe(0.6096214837100087);
  });
  it("keeps datasets separate and every aggregate cohort and calibration bin complete", () => {
    for (const [key, dataset] of [["development", "DEVELOPMENT"], ["externalValidation", "EXTERNAL_VALIDATION"]] as const) {
      const data = cornersSummary[key]; expect(data.dataset).toBe(dataset); expect(data.seasonIds).toEqual(selectedCornerSeasons(dataset));
      expect(data.summary.historicalMatches).toBe(1900);
      expect(data.summary.evaluatedMatches + data.summary.warmUpSkips).toBe(1900);
      expect(data.seasons.reduce((sum, s) => sum + s.summary.evaluatedMatches, 0)).toBe(data.summary.evaluatedMatches);
      expect(data.historyDepth.reduce((sum, r) => sum + r.matches, 0)).toBe(data.summary.evaluatedMatches);
      expect(data.fitDiagnostics.successfulPoissonFits).toBe(data.bootstrap.dateClusters);
      expect(data.fitDiagnostics.successfulNegativeBinomialFits).toBe(data.bootstrap.dateClusters);
      expect(data.fitDiagnostics.failures).toBe(0);
      expect(data.bootstrap.interval.observedMean).toBeCloseTo(data.summary.poissonRPS! - data.summary.negativeBinomialRPS!, 13);
      for (const line of data.lines) {
        expect(line.evaluatedMatches).toBe(data.summary.evaluatedMatches);
        expect(line.poissonCalibrationBins.reduce((sum, bin) => sum + bin.count, 0)).toBe(line.evaluatedMatches);
        expect(line.negativeBinomialCalibrationBins.reduce((sum, bin) => sum + bin.count, 0)).toBe(line.evaluatedMatches);
      }
    }
  });
  it("never routes synthetic or partial data through complete-season ingestion", () => {
    expect(() => validateCornerSeason({ id: "2021-22", matches: syntheticCornerHistory() })).toThrow(/canonical|380/);
    // Unit-level orchestration stays usable without any private source files.
    expect(backtestCorners([], "synthetic", "DEVELOPMENT").records).toEqual([]);
  });
  it.skipIf(!localSourcesAvailable)("locally verifies hashes, private integrity/fit causality and gitignored boundaries", async () => {
    const { loadCornerSources } = await import("../../../scripts/corner-sources.mjs");
    const { datasets } = await loadCornerSources();
    for (const dataset of [datasets.development, datasets.externalValidation]) {
      expect(dataset).toHaveLength(5); dataset.forEach(validateCornerSeason);
    }
    const audit = JSON.parse(readFileSync(join(root, "data/private/generated/corners-v07-audit.json"), "utf8"));
    for (const key of ["development", "externalValidation"]) {
      const data = audit[key], fits = new Map<string, { kickoffAt: string; latestTrainingKickoffAt: string; poisson: { trainingMatchCount: number }; negativeBinomial: { trainingMatchCount: number } }>(data.fits.map((f: { id: string }) => [f.id, f]));
      const source = datasets[key as keyof typeof datasets];
      for (const row of data.records) {
        const fit = fits.get(row.fitId)!;
        expect(fit.kickoffAt).toBe(row.kickoffAt); expect(fit.latestTrainingKickoffAt < row.kickoffAt).toBe(true);
        const prior = source.find((s: { id: string }) => s.id === row.seasonId)!.matches.filter((m: { kickoffAt: string }) => m.kickoffAt < row.kickoffAt);
        expect(fit.poisson.trainingMatchCount).toBe(prior.length); expect(fit.negativeBinomial.trainingMatchCount).toBe(prior.length);
        expect([row.poisson, row.negativeBinomial, row.leaguePoisson, row.empirical].every((p) => p.fixtureId === row.id)).toBe(true);
      }
    }
    for (const file of manifest.files) {
      const path = `data/private/football-data/${file.localFile}`;
      expect(createHash("sha256").update(readFileSync(join(root, path))).digest("hex")).toBe(file.sha256);
      expect(execFileSync("git", ["check-ignore", path], { cwd: root, encoding: "utf8" }).trim()).toBe(path);
    }
    expect(execFileSync("git", ["ls-files", "data/private"], { cwd: root, encoding: "utf8" })).toBe("");
  });
  it.skipIf(!localSourcesAvailable)("regenerates the public artifact byte-for-byte locally without exposing private audit data", () => {
    const temporary = mkdtempSync(join(tmpdir(), "bet-scanner-v07-repro-"));
    try {
      const output = join(temporary, "summary.json"), audit = join(temporary, "private-audit.json");
      execFileSync(process.execPath, ["--import", join(root, "scripts/register-typescript.mjs"), join(root, "scripts/build-corners-models.mjs"), "--output", output, "--audit-output", audit], { cwd: root, timeout: 180000 });
      if (process.versions.node === cornersSummary.runtime.node) expect(readFileSync(output, "utf8")).toBe(readFileSync(artifactPath, "utf8"));
      else {
        const regenerated = JSON.parse(readFileSync(output, "utf8"));
        for (const key of ["development", "externalValidation"]) for (const metric of ["poissonRPS", "negativeBinomialRPS", "pairedAdvantage"]) {
          expect(regenerated[key].summary[metric]).toBeCloseTo(cornersSummary[key as "development" | "externalValidation"].summary[metric as "poissonRPS" | "negativeBinomialRPS" | "pairedAdvantage"]!, 12);
        }
      }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }, 180000);
});
