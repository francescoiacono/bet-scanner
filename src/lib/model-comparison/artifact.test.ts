import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eplSeasons } from "../../data/epl-seasons";
import { externalEplSeasons } from "../../data/epl-external-seasons";
import { modelComparison } from "../../data/model-comparison";
import { runMultiSeasonBacktest } from "../backtest/run-multi-season-backtest";
import { prepareLikelihood } from "../dixon-coles/likelihood";
import { buildDatasetComparison } from "./build-comparison";
import { orderComparisonRecords, summarizeModels } from "./summaries";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const artifactPath = join(root, "src/data/generated/model-comparison-v06.json");

describe("complete deterministic model-comparison artifact", () => {
  it("pairs every real evaluation ID and preserves all V0.5 development metrics", () => {
    for (const [data, source] of [[modelComparison.development, eplSeasons], [modelComparison.externalValidation, externalEplSeasons]] as const) {
      const baseline = runMultiSeasonBacktest(source);
      expect(data.records.map((record) => record.id)).toEqual(baseline.predictions.map((record) => record.id));
      expect(data.baselineSummary).toEqual(baseline.summary);
      data.records.forEach((record, index) => {
        const expected = baseline.predictions[index];
        expect(record.prediction).toEqual(expected.prediction);
        expect(record.brierScore).toBe(expected.brierScore);
        expect(record.leaguePoissonBrierScore).toBe(expected.leaguePoissonBrierScore);
        expect(record.historyDepth).toBeGreaterThanOrEqual(2);
        expect(record.dataset).toBe(data.dataset);
      });
      expect(data.summary.historicalMatches).toBe(1900);
      expect(data.historyDepth.reduce((sum, bucket) => sum + bucket.matches, 0)).toBe(data.summary.evaluatedMatches);
      expect(data.outcomes.reduce((sum, row) => sum + row.poissonV1Component!, 0)).toBeCloseTo(data.summary.poissonV1Brier!, 12);
      expect(data.outcomes.reduce((sum, row) => sum + row.dixonColesComponent!, 0)).toBeCloseTo(data.summary.dixonColesBrier!, 12);
      expect(data.bootstrap.interval.observedMean).toBeCloseTo(data.summary.poissonV1Brier! - data.summary.dixonColesBrier!, 12);
    }
    expect(modelComparison.development.summary.evaluatedMatches).toBe(1688);
    expect(modelComparison.development.summary.warmUpSkips).toBe(212);
    expect(modelComparison.development.summary.poissonV1Brier).toBe(0.634404090022038);
    expect(modelComparison.development.summary.leagueBaseRateBrier).toBe(0.6495926545501354);
    expect(modelComparison.development.baselineSummary.topPickCalibrationECE).toBe(0.10136333169978744);
    expect(modelComparison.externalValidation.summary.evaluatedMatches).toBe(1691);
    expect(modelComparison.externalValidation.summary.warmUpSkips).toBe(209);
  });

  it("retains one successful fit per eligible date and audits season-reset likelihoods against strictly prior history", () => {
    for (const [data, source] of [[modelComparison.development, eplSeasons], [modelComparison.externalValidation, externalEplSeasons]] as const) {
      const fits = new Map(data.fits.map((audit) => [audit.id, audit]));
      expect(fits.size).toBe(new Set(data.records.map((record) => record.seasonId + record.kickoffAt)).size);
      expect(data.fitDiagnostics.failures).toBe(0);
      for (const record of data.records) {
        const audit = fits.get(record.fitId)!;
        expect(audit.seasonId).toBe(record.seasonId); expect(audit.dataset).toBe(record.dataset);
        expect(audit.kickoffAt).toBe(record.kickoffAt);
        expect(audit.latestTrainingKickoffAt < audit.kickoffAt).toBe(true);
        expect(audit.fit.trainingMatchCount).toBe(record.trainingMatchCount);
        expect(audit.fit.converged).toBe(true);
      }
      for (const season of source) {
        const first = data.fits.find((audit) => audit.seasonId === season.id)!;
        const prior = season.matches.filter((match) => match.kickoffAt < first.kickoffAt);
        expect(first.fit.trainingMatchCount).toBe(prior.length);
        const reconstructed = prepareLikelihood(prior).evaluate(first.fit.rawParameters);
        expect(reconstructed.negativeLogLikelihood).toBeCloseTo(first.fit.negativeLogLikelihood, 10);
        expect(reconstructed.parameters.teams).toEqual(first.fit.teams);
      }
    }
  });

  it("keeps development and validation separate, rejects mixed inputs, and pools records in deterministic order", () => {
    const development = modelComparison.development, external = modelComparison.externalValidation;
    expect(new Set([...development.seasonIds, ...external.seasonIds]).size).toBe(10);
    expect(() => buildDatasetComparison(externalEplSeasons, "DEVELOPMENT")).toThrow(/selected/);
    expect(() => buildDatasetComparison([...eplSeasons.slice(1), externalEplSeasons[0]], "DEVELOPMENT")).toThrow(/selected/);
    for (const data of [development, external]) {
      expect(summarizeModels(orderComparisonRecords([...data.records].reverse()), data.summary.historicalMatches, data.summary.warmUpSkips)).toEqual(data.summary);
      expect(data.records.every((record) => data.seasonIds.includes(record.seasonId))).toBe(true);
      expect(data.seasons.reduce((sum, season) => sum + season.summary.evaluatedMatches, 0)).toBe(data.summary.evaluatedMatches);
    }
  });

  it("locks the recorded model specification and regenerates all ten seasons byte-for-byte with the recorded Node version", () => {
    const specification = createHash("sha256");
    for (const path of ["src/lib/dixon-coles/types.ts", "src/lib/dixon-coles/model.ts", "src/lib/dixon-coles/likelihood.ts", "src/lib/dixon-coles/fit.ts",
      "src/lib/model-comparison/run-paired-backtest.ts"]) specification.update(readFileSync(join(root, path)));
    expect(specification.digest("hex")).toBe(modelComparison.modelSpecificationSha256);
    const temporary = mkdtempSync(join(tmpdir(), "bet-scanner-v06-repro-"));
    try {
      const output = join(temporary, "comparison.json");
      execFileSync(process.execPath, ["--import", join(root, "scripts/register-typescript.mjs"), join(root, "scripts/build-models.mjs"), "--output", output], { cwd: root, timeout: 120000 });
      const generated = readFileSync(output, "utf8"), committed = readFileSync(artifactPath, "utf8");
      if (process.versions.node === modelComparison.runtime.node) expect(generated).toBe(committed);
      else {
        // Metadata records the runtime. Cross-runtime arithmetic is checked
        // explicitly rather than promising unverified bitwise equality.
        const actual = JSON.parse(generated), expected = JSON.parse(committed);
        for (const key of ["development", "externalValidation"]) {
          expect(actual[key].records.map((record: { id: string }) => record.id)).toEqual(expected[key].records.map((record: { id: string }) => record.id));
          actual[key].records.forEach((record: { dixonColesBrierScore: number }, i: number) => expect(record.dixonColesBrierScore).toBeCloseTo(expected[key].records[i].dixonColesBrierScore, 12));
        }
      }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }, 120000);
});
