import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = new URL("../src/data/generated/", import.meta.url);
const hashes = {};
function read(name) {
  const bytes = readFileSync(new URL(name, directory));
  hashes[name] = createHash("sha256").update(bytes).digest("hex");
  return JSON.parse(bytes.toString("utf8"));
}
function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError("Invalid aggregate research value.");
  return value;
}
const models = read("model-comparison-v06.json");
const corners = read("corners-v07-summary.json");
const value = read("value-v08-summary.json");
const calibration = read("calibration-v09-summary.json");

// Projection only: no fitting, source CSVs, private audits or statistical changes.
const index = {
  schemaVersion: 1,
  seasons: { recent: models.development.seasonIds, older: models.externalValidation.seasonIds },
  earlyPoisson: {
    recentBrier: finite(models.development.summary.poissonV1Brier),
    recentLeagueBaseRateBrier: finite(models.development.baselineSummary.leagueBaseRateBrier),
    recentLeaguePoissonBrier: finite(models.development.baselineSummary.leaguePoissonBrier),
  },
  dixonColes: {
    recentBrier: finite(models.development.summary.dixonColesBrier),
    olderBrier: finite(models.externalValidation.summary.dixonColesBrier),
    recentMatches: models.development.summary.evaluatedMatches,
    olderMatches: models.externalValidation.summary.evaluatedMatches,
    recentAdvantage: finite(models.development.summary.pairedAdvantage),
    olderAdvantage: finite(models.externalValidation.summary.pairedAdvantage),
    recentInterval: models.development.bootstrap.interval,
    olderInterval: models.externalValidation.bootstrap.interval,
  },
  corners: {
    status: corners.preferredModel,
    recentPoissonRPS: finite(corners.development.summary.poissonRPS),
    recentNegativeBinomialRPS: finite(corners.development.summary.negativeBinomialRPS),
    olderPoissonRPS: finite(corners.externalValidation.summary.poissonRPS),
    olderNegativeBinomialRPS: finite(corners.externalValidation.summary.negativeBinomialRPS),
  },
  historicalValue: {
    status: value.status,
    recentModelBrier: finite(value.recent.probability.dixonColesBrier),
    recentMarketBrier: finite(value.recent.probability.marketFairBrier),
    recentROI: finite(value.recent.strategy.roi),
    olderROI: finite(value.older.strategy.roi),
    recentBets: value.recent.strategy.bets,
    olderBets: value.older.strategy.bets,
  },
  calibration: {
    status: calibration.validation.status,
    selectedFamily: calibration.development.selectedFamily,
    researchModelVersion: calibration.validation.researchModelVersion,
    gapClosedFraction: finite(calibration.validation.gapClosedFraction),
  },
  artifactHashes: hashes,
};
const output = process.argv[2] ? fileURLToPath(new URL(process.argv[2], "file://" + process.cwd() + "/")) : fileURLToPath(new URL("research-index.json", directory));
writeFileSync(output, JSON.stringify(index, null, 2) + "\n");
console.log("Research aggregate index written (no models fitted or provider requests).");
