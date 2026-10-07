import { describe, expect, it } from "vitest";
import { calibrationValidationStatus, selectCalibrationFamily } from "./bootstrap";
import { DEVELOPMENT_SEASONS } from "./config";
import { applyHistoricalCalibration, developCalibration, rollingOriginCalibration } from "./development";
import { attachMarketBenchmark } from "./market-benchmark";
import { canonicalCalibrationRecords } from "./records";
import { calibrationRecord, olderRecords } from "./test-helpers";
import type { CandidateEvidence } from "./bootstrap";
import type { CalibrationRecord } from "./types";

describe("older rolling-origin protocol", () => {
  it.each([0, 1, 2, 3])("fold %s has only earlier declared seasons", (index) => {
    const r = rollingOriginCalibration(olderRecords()), f = r.publicSummary.folds[index];
    expect(f.trainingSeasons).toEqual(DEVELOPMENT_SEASONS.slice(0, index + 1)); expect(f.validationSeason).toBe(DEVELOPMENT_SEASONS[index + 1]);
    expect(f.trainingRecords).toBe(48 * (index + 1)); expect(f.validationRecords).toBe(48); expect(f.temperature.trainingRecords).toBe(f.trainingRecords); expect(f.logistic.trainingRecords).toBe(f.trainingRecords);
  });
  it("validation/future outcomes cannot enter an earlier fold fit or forecast", () => {
    const rows = olderRecords(), before = rollingOriginCalibration(rows), changed = rollingOriginCalibration(rows.map((r) => r.seasonId >= "2016-17" ? { ...r, actualOutcome: r.actualOutcome === "HOME" ? "DRAW" : "HOME" } : r));
    for (const i of [0, 1]) { expect(changed.publicSummary.folds[i].temperature).toEqual(before.publicSummary.folds[i].temperature); expect(changed.publicSummary.folds[i].logistic).toEqual(before.publicSummary.folds[i].logistic); }
    expect(changed.records.filter((r) => r.seasonId === "2015-16")).toEqual(before.records.filter((r) => r.seasonId === "2015-16"));
    expect(changed.records.filter((r) => r.seasonId === "2016-17").map((r) => r.forecasts)).toEqual(before.records.filter((r) => r.seasonId === "2016-17").map((r) => r.forecasts));
  });
  it("each fold excludes its own outcomes from fitting", () => {
    const rows = olderRecords(), before = rollingOriginCalibration(rows);
    for (const fold of before.publicSummary.folds) {
      const changed = rollingOriginCalibration(rows.map((r) => r.seasonId === fold.validationSeason ? { ...r, actualOutcome: r.actualOutcome === "HOME" ? "DRAW" : "HOME" } : r));
      expect(changed.publicSummary.folds[fold.fold - 1].temperature).toEqual(fold.temperature); expect(changed.publicSummary.folds[fold.fold - 1].logistic).toEqual(fold.logistic);
    }
  });
  it("recent data cannot be supplied for development selection", () => expect(() => developCalibration([...olderRecords(), calibrationRecord()])).toThrow(/cohort/));
  it("training-only first season never appears in candidate scoring", () => { const result = rollingOriginCalibration(olderRecords()); expect(result.records).toHaveLength(192); expect(result.records.every((r) => r.seasonId !== "2014-15")).toBe(true); expect(result.publicSummary.candidates.every((c) => c.matches === 192)).toBe(true); });
  it("all candidates have exactly identical validation IDs", () => { const r = rollingOriginCalibration(olderRecords()); for (const row of r.records) expect(Object.keys(row.forecasts).sort()).toEqual(["identity", "temperature-v1", "multinomial-logit-v1"].sort()); expect(new Set(r.records.map((r) => r.fixtureId)).size).toBe(r.records.length); });
  it("input order cannot change folds or fitted results", () => expect(rollingOriginCalibration(olderRecords().reverse())).toEqual(rollingOriginCalibration(olderRecords())));
  it("forbids team, market and score fields in calibration records", () => { for (const field of ["homeGoals", "homeTeam", "market", "odds"]) expect(() => canonicalCalibrationRecords([{ ...olderRecords()[0], [field]: 1 } as CalibrationRecord], "DEVELOPMENT")).toThrow(/exclude/); });
});
const evidence = (tLower: number, lLower: number, tAdv = 0.03, lAdv = 0.04): CandidateEvidence[] => [
  { family: "temperature-v1", interval: { observedMean: tAdv, lowerBound: tLower, upperBound: 0.2 } },
  { family: "multinomial-logit-v1", interval: { observedMean: lAdv, lowerBound: lLower, upperBound: 0.2 } },
];
describe("fixed calibration-family selection", () => {
  it("retains identity when neither lower bound is positive", () => expect(selectCalibrationFamily(evidence(-0.01, -0.01))).toBe("identity"));
  it("selects the only eligible temperature", () => expect(selectCalibrationFamily(evidence(0.01, -0.01))).toBe("temperature-v1"));
  it("selects the only eligible logistic map", () => expect(selectCalibrationFamily(evidence(-0.01, 0.01))).toBe("multinomial-logit-v1"));
  it("when both eligible takes the larger observed advantage", () => { expect(selectCalibrationFamily(evidence(0.01, 0.01))).toBe("multinomial-logit-v1"); expect(selectCalibrationFamily(evidence(0.01, 0.01, 0.05, 0.04))).toBe("temperature-v1"); });
  it("ties within 1e-12 prefer temperature regardless of array order", () => { expect(selectCalibrationFamily(evidence(0.01, 0.01, 0.04, 0.04))).toBe("temperature-v1"); expect(selectCalibrationFamily(evidence(0.01, 0.01, 0.04, 0.04 + 5e-13).reverse())).toBe("temperature-v1"); });
  it("zero lower bound is ineligible", () => expect(selectCalibrationFamily(evidence(0, 0))).toBe("identity"));
  it("does not accept recent validation records", () => expect(() => selectCalibrationFamily([calibrationRecord()] as unknown as CandidateEvidence[])).toThrow());
  it("does not accept market or validation metrics", () => { const rows = evidence(0.01, 0.01); for (const key of ["marketBrier", "validationBrier", "recent"]) expect(() => selectCalibrationFamily([{ ...rows[0], [key]: 1 }, rows[1]] as CandidateEvidence[])).toThrow(/only/); });
});
describe("final fit and benchmark isolation", () => {
  it("uses every older record once in the final fit and freezes parameters", () => { const d = developCalibration(olderRecords()); expect(d.finalFit.trainingRecords).toBe(240); expect(Object.isFrozen(d.finalFit.parameters)).toBe(true); expect(Object.isFrozen(d.finalFit)).toBe(true); });
  it("changing recent outcomes leaves final parameters and calibrated predictions unchanged", () => { const d = developCalibration(olderRecords()), a = applyHistoricalCalibration([calibrationRecord()], d.finalFit), b = applyHistoricalCalibration([calibrationRecord({ actualOutcome: "AWAY" })], d.finalFit); expect(a[0].calibrated).toEqual(b[0].calibrated); expect(d.finalFit).toEqual(developCalibration(olderRecords()).finalFit); });
  it("recent market prices affect only benchmark diagnostics", () => { const d = developCalibration(olderRecords()), validation = applyHistoricalCalibration([calibrationRecord()], d.finalFit), p = { fixtureId: "synthetic-a", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", homeOdds: 2, drawOdds: 4, awayOdds: 4 }; const a = attachMarketBenchmark(validation, [p]), b = attachMarketBenchmark(validation, [{ ...p, homeOdds: 3 }]); expect(a[0].market).not.toEqual(b[0].market); expect(a[0].calibrated).toEqual(b[0].calibrated); expect(d.finalFit).toEqual(developCalibration(olderRecords()).finalFit); });
  it("changing an older training outcome can alter final parameters", () => { const rows = olderRecords(), before = developCalibration(rows); rows[0] = { ...rows[0], actualOutcome: "AWAY" }; const changed = developCalibration(rows); expect(changed.finalFit.parameters).not.toEqual(before.finalFit.parameters); });
  it("never changes raw probabilities", () => { const recent = [calibrationRecord()], before = structuredClone(recent); const d = developCalibration(olderRecords()); applyHistoricalCalibration(recent, d.finalFit); expect(recent).toEqual(before); });
  it("cannot apply recent validation using older cohort records", () => expect(() => applyHistoricalCalibration([olderRecords()[0]], { family: "identity", parameters: [] })).toThrow(/cohort/));
  it("requires identical benchmark fixture sets", () => { const rows = applyHistoricalCalibration([calibrationRecord()], { family: "identity", parameters: [] }); expect(() => attachMarketBenchmark(rows, [])).toThrow(); expect(() => attachMarketBenchmark(rows, [{ fixtureId: "missing", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", homeOdds: 2, drawOdds: 4, awayOdds: 4 }])).toThrow(); });
});
describe("predeclared recent-validation status", () => {
  it("identity is retained independently of intervals", () => expect(calibrationValidationStatus("identity", { observedMean: 0, lowerBound: 0, upperBound: 0 })).toBe("IDENTITY_RETAINED"));
  it("positive lower bound supports improvement", () => expect(calibrationValidationStatus("temperature-v1", { observedMean: 0.1, lowerBound: 0.01, upperBound: 0.2 })).toBe("CALIBRATION_IMPROVEMENT_SUPPORTED"));
  it("negative upper bound supports harm", () => expect(calibrationValidationStatus("temperature-v1", { observedMean: -0.1, lowerBound: -0.2, upperBound: -0.01 })).toBe("CALIBRATION_HARM_SUPPORTED"));
  it.each([{ observedMean: 0.01, lowerBound: 0, upperBound: 0.02 }, { observedMean: -0.01, lowerBound: -0.02, upperBound: 0 }, { observedMean: null, lowerBound: null, upperBound: null }])("zero/unavailable boundaries remain inconclusive", (interval) => expect(calibrationValidationStatus("temperature-v1", interval)).toBe("INCONCLUSIVE"));
});
