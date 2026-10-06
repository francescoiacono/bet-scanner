import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import summary from "../../data/generated/value-v08-summary.json";
import { modelComparison } from "../../data/model-comparison";
import { historicalProfitabilityStatus } from "./bootstrap";
import { VALUE_PROTOCOL } from "./config";
import { recordedValuePrediction } from "./frozen-predictions";
import { valueCohortSummary } from "./summary";
import type { HistoricalThreeWayPrice, ValueRecord } from "./types";

const root = fileURLToPath(new URL("../../../", import.meta.url)), publicPath = join(root, "src/data/generated/value-v08-summary.json");
const hash = (path: string) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
const manifest = JSON.parse(readFileSync(join(root, "data/provenance/football-data-corners-v07.json"), "utf8")) as { files: { season: string; localFile: string; sha256: string }[] };
const localSources = manifest.files.every((f) => existsSync(join(root, "data/private/football-data", f.localFile)));
const localAudit = localSources && existsSync(join(root, "data/private/generated/value-v08-audit.json"));

describe("public price-research artifact and frozen inputs", () => {
  it("contains only compact aggregates, with no individual prices, identities or picks", () => {
    expect(readFileSync(publicPath).length).toBeLessThan(150_000);
    const forbidden = new Set(["records", "prices", "fixtureId", "homeTeam", "awayTeam", "sourceDate", "kickoffAt", "actualOutcome", "homeGoals", "awayGoals", "homeOdds", "drawOdds", "awayOdds", "decimalOdds", "rawImplied", "expectedROIs", "fairMarketEdges", "settlement"]);
    const inspect = (value: unknown): void => { if (Array.isArray(value)) value.forEach(inspect); else if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) { expect(forbidden.has(key), key).toBe(false); inspect(nested); } };
    inspect(summary);
  });
  it("records the sole predeclared protocol and exact V0.7 source hashes", () => {
    for (const key of Object.keys(VALUE_PROTOCOL) as (keyof typeof VALUE_PROTOCOL)[]) expect(summary.configuration[key]).toEqual(VALUE_PROTOCOL[key]);
    expect(summary.configuration.extractedColumns).toEqual(["Date", "HomeTeam", "AwayTeam", "B365H", "B365D", "B365A"]);
    expect(summary.provenance.sourceHashes).toEqual(manifest.files);
    const specification = createHash("sha256");
    for (const name of ["config", "types", "aliases", "data", "market", "selection", "settlement", "frozen-predictions", "backtest", "statistics", "bootstrap", "summary"]) specification.update(readFileSync(join(root, `src/lib/value/${name}.ts`)));
    for (const path of ["src/lib/diagnostics/bootstrap.ts", "src/lib/backtest/metrics.ts", "scripts/value-sources.mjs", "scripts/build-value-models.mjs"]) specification.update(readFileSync(join(root, path)));
    expect(specification.digest("hex")).toBe(summary.protocolSha256);
  });
  it("locks unchanged V0.6 content, recorded regressions and V0.7 artifact", () => {
    const v06Hash = "deb9fac92ebd104fcc15cf713b5e2600cfba5e56a8f58b30d219f469dccf8262";
    expect(hash("src/data/generated/model-comparison-v06.json")).toBe(v06Hash); expect(summary.provenance.frozenV06ArtifactSha256).toBe(v06Hash);
    expect(hash("src/data/generated/corners-v07-summary.json")).toBe("bf4475b082608bf78a9f92b7986355745c62279d54b05509497a0699494fa4a7");
    expect(modelComparison.development.summary.poissonV1Brier).toBe(0.634404090022038);
    expect(modelComparison.development.summary.dixonColesBrier).toBe(0.6096214837100087);
    expect(summary.recent.probability.dixonColesBrier).toBe(0.6096214837100087);
    expect(summary.older.probability.dixonColesBrier).toBe(0.5931332816914757);
  });
  it("projects every already recorded forecast exactly without goals or fitting imports", () => {
    for (const dataset of [modelComparison.development, modelComparison.externalValidation]) for (const r of dataset.records) {
      const projected = recordedValuePrediction(r), p = r.dixonColesPrediction;
      expect(projected.modelProbabilities).toEqual({ homeProbability: p.homeProbability, drawProbability: p.drawProbability, awayProbability: p.awayProbability });
      expect(projected.modelBrier).toBe(r.dixonColesBrierScore); expect(projected.actualOutcome).toBe(r.actualOutcome); expect("homeGoals" in projected).toBe(false);
    }
    for (const name of ["frozen-predictions", "backtest", "market", "selection", "summary"]) expect(readFileSync(join(root, `src/lib/value/${name}.ts`), "utf8")).not.toMatch(/from\s+["'][^"']*(?:dixon-coles\/(?:fit|model)|run-model-comparison)/);
  });
  it("covers exactly 1688 recent and 1691 older records with complete diagnostics", () => {
    expect(summary.recent.evaluatedMatches).toBe(1688); expect(summary.older.evaluatedMatches).toBe(1691); expect(summary.coverage).toHaveLength(10);
    for (const row of summary.coverage) { expect(row.alignedFixtures).toBe(380); expect(row.completePriceTriplets).toBe(380); expect(row.pricedEvaluatedRecords).toBe(row.evaluatedRecords); expect(row.pricedCoverage).toBe(1); }
    for (const c of [summary.recent, summary.older]) {
      expect(c.seasons.reduce((n, r) => n + r.strategy.evaluatedMatches, 0)).toBe(c.evaluatedMatches);
      expect(c.strategy.bets + c.strategy.noBets).toBe(c.evaluatedMatches);
      expect(c.outcomes.reduce((n, r) => n + r.strategy.bets, 0)).toBe(c.strategy.bets);
      expect(c.evBuckets.reduce((n, r) => n + r.strategy.bets, 0)).toBe(c.strategy.bets);
      expect(c.evBuckets.at(-1)!.strategy.bets).toBe(c.extremes.selectionsAtLeast20Percent);
      expect(c.strategy.roi).toBeCloseTo(c.strategy.netProfit / c.strategy.totalStaked, 14);
      expect(c.roiBootstrap.interval.observedMean).toBe(c.strategy.roi); expect(c.roiBootstrap.interval.zeroStakeReplicates).toBe(0);
      expect(c.brierBootstrap.interval.observedMean).toBeCloseTo(c.probability.marketFairBrier - c.probability.dixonColesBrier, 13);
    }
    expect(summary.status).toBe(historicalProfitabilityStatus(summary.recent.roiBootstrap.interval, summary.older.roiBootstrap.interval));
  });
  it.skipIf(!localSources)("verifies all ten local hashes, 380/380 joins and every eligible triplet", async () => {
    const { loadValueSources } = await import("../../../scripts/value-sources.mjs");
    const sources = await loadValueSources();
    expect(sources.coverage).toHaveLength(10);
    const prices = new Map<string, HistoricalThreeWayPrice>(sources.normalized.flatMap((s: { prices: HistoricalThreeWayPrice[] }) => s.prices).map((p: HistoricalThreeWayPrice) => [p.fixtureId, p]));
    expect(prices.size).toBe(3800);
    for (const dataset of [modelComparison.development, modelComparison.externalValidation]) for (const r of dataset.records) {
      expect(prices.has(r.id)).toBe(true); expect(prices.get(r.id)!.sourceDate).toBe(r.kickoffAt); expect(prices.get(r.id)!.seasonId).toBe(r.seasonId);
    }
    for (const f of manifest.files) { const path = `data/private/football-data/${f.localFile}`; expect(hash(path)).toBe(f.sha256); expect(execFileSync("git", ["check-ignore", path], { cwd: root, encoding: "utf8" }).trim()).toBe(path); }
    for (const path of ["data/private/generated/value-v08-prices.json", "data/private/generated/value-v08-audit.json"]) expect(execFileSync("git", ["check-ignore", path], { cwd: root, encoding: "utf8" }).trim()).toBe(path);
    expect(execFileSync("git", ["ls-files", "data/private"], { cwd: root, encoding: "utf8" })).toBe("");
  });
  it.skipIf(!localAudit)("reproduces every aggregate from private rows and checks settlement separation", () => {
    const audit = JSON.parse(readFileSync(join(root, "data/private/generated/value-v08-audit.json"), "utf8")) as { recent: ValueRecord[]; older: ValueRecord[] };
    for (const [key, cohort] of [["recent", "RECENT"], ["older", "OLDER"]] as const) {
      expect(valueCohortSummary(audit[key], cohort)).toEqual(summary[key]);
      const canonical = new Map((key === "recent" ? modelComparison.development : modelComparison.externalValidation).records.map((r) => [r.id, r]));
      for (const r of audit[key]) { expect(r.modelProbabilities).toEqual(recordedValuePrediction(canonical.get(r.fixtureId)!).modelProbabilities); expect(r.selection === null ? r.settlement.stake === 0 : r.settlement.stake === 1).toBe(true); }
    }
  });
  it.skipIf(!localSources)("regenerates aggregate and private audit byte-for-byte without touching frozen artifacts", () => {
    const temporary = mkdtempSync(join(tmpdir(), "bet-scanner-v08-repro-"));
    try {
      const output = join(temporary, "summary.json"), audit = join(temporary, "audit.json");
      execFileSync(process.execPath, ["--import", join(root, "scripts/register-typescript.mjs"), join(root, "scripts/build-value-models.mjs"), "--output", output, "--audit-output", audit], { cwd: root, timeout: 60000 });
      if (process.versions.node === summary.runtime.node) expect(readFileSync(output, "utf8")).toBe(readFileSync(publicPath, "utf8"));
      else { const regenerated = JSON.parse(readFileSync(output, "utf8")); delete regenerated.runtime; const expected = structuredClone(summary) as Partial<typeof summary>; delete expected.runtime; expect(regenerated).toEqual(expected); }
      if (localAudit) expect(readFileSync(audit, "utf8")).toBe(readFileSync(join(root, "data/private/generated/value-v08-audit.json"), "utf8"));
      expect(hash("src/data/generated/model-comparison-v06.json")).toBe(summary.provenance.frozenV06ArtifactSha256);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }, 60000);
});
