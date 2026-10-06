import { describe, expect, it } from "vitest";
import { calculateBrierScore } from "../backtest/metrics";
import { calculateBrierComponents, diagnoseOutcomes } from "./outcome-calibration";
import type { OutcomeObservation } from "./types";

function observation(home: number, draw: number, actualOutcome: OutcomeObservation["actualOutcome"]): OutcomeObservation {
  const prediction = { homeProbability: home, drawProbability: draw, awayProbability: 1 - home - draw };
  return { prediction, leagueBaseRateProbabilities: prediction, leaguePoissonPrediction: prediction, actualOutcome };
}

describe("outcome Brier components and one-vs-rest calibration", () => {
  it("matches known components and reconstructs the multiclass score for each outcome", () => {
    const probabilities = { homeProbability: 0.6, drawProbability: 0.3, awayProbability: 0.1 };
    const components = calculateBrierComponents(probabilities, "HOME");
    expect(components.HOME).toBeCloseTo(0.16, 12);
    expect(components.DRAW).toBeCloseTo(0.09, 12);
    expect(components.AWAY).toBeCloseTo(0.01, 12);
    for (const actual of ["HOME", "DRAW", "AWAY"] as const) {
      const values = calculateBrierComponents(probabilities, actual);
      expect(values.HOME + values.DRAW + values.AWAY).toBeCloseTo(calculateBrierScore(probabilities, actual), 12);
    }
  });

  it("uses half-open bins for every outcome and includes probability one in the final bucket", () => {
    const outcomes = diagnoseOutcomes([observation(0.1, 0.9, "DRAW"), observation(1, 0, "HOME")]);
    expect(outcomes[0].calibrationBuckets[0].count).toBe(0);
    expect(outcomes[0].calibrationBuckets[1].count).toBe(1);
    expect(outcomes[0].calibrationBuckets[9].meanPredictedProbability).toBe(1);
    expect(outcomes[1].calibrationBuckets[9].meanPredictedProbability).toBe(0.9);
    expect(outcomes[2].calibrationBuckets[0].count).toBe(2);
  });

  it("calculates a known HOME ECE and bin means from all matches, including those not picked HOME", () => {
    const rows = diagnoseOutcomes([
      observation(0.55, 0.25, "HOME"), observation(0.55, 0.25, "DRAW"),
      observation(0.85, 0.1, "HOME"), observation(0.85, 0.1, "HOME"),
    ]);
    expect(rows[0].calibrationECE).toBeCloseTo(0.1, 12);
    expect(rows[0].calibrationBuckets[5].observedFrequency).toBe(0.5);
    expect(rows[0].calibrationBuckets[8].observedFrequency).toBe(1);
    expect(rows[1].evaluatedMatches).toBe(4);
  });

  it("calculates mean predictions, observed rates, signed gaps, and component means for all three forecasts", () => {
    const data = [observation(0.6, 0.3, "HOME"), observation(0.2, 0.3, "AWAY"), observation(0.4, 0.3, "DRAW")];
    const rows = diagnoseOutcomes(data);
    expect(rows[0].meanPredictedProbability).toBeCloseTo(0.4, 12);
    expect(rows[0].observedFrequency).toBeCloseTo(1 / 3, 12);
    expect(rows[0].predictionGap).toBeCloseTo(0.4 - 1 / 3, 12);
    expect(rows.reduce((sum, row) => sum + row.meanPredictedProbability!, 0)).toBeCloseTo(1, 12);
    expect(rows.reduce((sum, row) => sum + row.observedFrequency!, 0)).toBeCloseTo(1, 12);
    const meanBrier = data.reduce((sum, record) => sum + calculateBrierScore(record.prediction, record.actualOutcome), 0) / data.length;
    for (const field of ["modelBrierComponent", "leagueBaseRateBrierComponent", "leaguePoissonBrierComponent"] as const) {
      expect(rows.reduce((sum, row) => sum + row[field]!, 0)).toBeCloseTo(meanBrier, 12);
    }
  });

  it("returns null quality metrics and ten empty bins per outcome for empty data; invalid vectors fail", () => {
    for (const row of diagnoseOutcomes([])) {
      expect(row.evaluatedMatches).toBe(0);
      expect(row.meanPredictedProbability).toBeNull();
      expect(row.observedFrequency).toBeNull();
      expect(row.predictionGap).toBeNull();
      expect(row.calibrationECE).toBeNull();
      expect(row.modelBrierComponent).toBeNull();
      expect(row.leagueBaseRateBrierComponent).toBeNull();
      expect(row.leaguePoissonBrierComponent).toBeNull();
      expect(row.calibrationBuckets).toHaveLength(10);
      expect(row.calibrationBuckets.every((bin) => bin.count === 0 && bin.meanPredictedProbability === null && bin.observedFrequency === null)).toBe(true);
    }
    expect(() => calculateBrierComponents({ homeProbability: NaN, drawProbability: 0.5, awayProbability: 0.5 }, "HOME")).toThrow(RangeError);
  });
});
