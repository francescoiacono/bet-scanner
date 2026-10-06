import { describe, expect, it } from "vitest";
import { calculateMatchProbabilities } from "../football/poisson";
import { decodeParameters, prepareLikelihood } from "./likelihood";
import { dixonColesExpectedGoals, dixonColesProbabilities, lowScoreTau, predictDixonColes } from "./model";
import { syntheticHistory } from "./test-fixtures";

const fixture = { id: "target", homeTeam: "Alpha", awayTeam: "Bravo" };
const parameters = { teams: [{ team: "Alpha", attack: 0.3, defenceWeakness: -0.2 }, { team: "Bravo", attack: -0.3, defenceWeakness: 0.4 }], homeAdvantage: 0.2, rho: -0.1 };

describe("Dixon–Coles score model", () => {
  it("implements all four tau corrections and leaves every other scoreline neutral", () => {
    expect(lowScoreTau(0, 0, 2, 1.5, -0.1)).toBeCloseTo(1.3);
    expect(lowScoreTau(0, 1, 2, 1.5, -0.1)).toBeCloseTo(0.8);
    expect(lowScoreTau(1, 0, 2, 1.5, -0.1)).toBeCloseTo(0.85);
    expect(lowScoreTau(1, 1, 2, 1.5, -0.1)).toBeCloseTo(1.1);
    for (const [x, y] of [[0, 2], [2, 0], [2, 2], [4, 3]]) expect(lowScoreTau(x, y, 2, 1.5, -0.1)).toBe(1);
  });

  it("exactly reduces to the frozen independent Poisson engine when rho is zero", () => {
    for (const [lambda, mu] of [[0, 0], [1.8, 1.2], [3, 0.5]]) {
      for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) expect(lowScoreTau(x, y, lambda, mu, 0)).toBe(1);
      expect(dixonColesProbabilities(lambda, mu, 0)).toEqual(calculateMatchProbabilities(lambda, mu));
    }
  });

  it("uses the specified attack/defence signs and applies home advantage only to home goals", () => {
    const goals = dixonColesExpectedGoals(fixture, parameters);
    expect(goals.expectedHomeGoals).toBeCloseTo(Math.exp(0.2 + 0.3 + 0.4), 12);
    expect(goals.expectedAwayGoals).toBeCloseTo(Math.exp(-0.3 - 0.2), 12);
    const boosted = dixonColesExpectedGoals(fixture, { ...parameters, homeAdvantage: 0.7 });
    expect(boosted.expectedHomeGoals / goals.expectedHomeGoals).toBeCloseTo(Math.exp(0.5), 12);
    expect(boosted.expectedAwayGoals).toBe(goals.expectedAwayGoals);
    for (const [team, field, changedSide] of [["Alpha", "attack", "expectedHomeGoals"], ["Bravo", "attack", "expectedAwayGoals"],
      ["Bravo", "defenceWeakness", "expectedHomeGoals"], ["Alpha", "defenceWeakness", "expectedAwayGoals"]] as const) {
      const changed = dixonColesExpectedGoals(fixture, { ...parameters, teams: parameters.teams.map((rating) => rating.team === team ? { ...rating, [field]: rating[field] + 0.1 } : rating) });
      expect(changed[changedSide]).toBeGreaterThan(goals[changedSide]);
      expect(changed[changedSide === "expectedHomeGoals" ? "expectedAwayGoals" : "expectedHomeGoals"]).toBe(goals[changedSide === "expectedHomeGoals" ? "expectedAwayGoals" : "expectedHomeGoals"]);
    }
  });

  it("returns finite non-negative normalized outcomes and explicit model identity", () => {
    const prediction = predictDixonColes(fixture, parameters);
    expect(prediction.modelVersion).toBe("dixon-coles-v1"); expect(prediction.fixtureId).toBe(fixture.id);
    for (const value of [prediction.homeProbability, prediction.drawProbability, prediction.awayProbability]) {
      expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(prediction.homeProbability + prediction.drawProbability + prediction.awayProbability).toBeCloseTo(1, 12);
  });

  it("fails explicitly on invalid tau, rates, rho, identities, and unusable probability states", () => {
    expect(() => lowScoreTau(0, 0, 10, 10, 0.1)).toThrow(RangeError);
    expect(() => lowScoreTau(0, 1, 10, 1, -0.19)).toThrow(RangeError);
    expect(() => lowScoreTau(1, 0, 1, 10, -0.19)).toThrow(RangeError);
    for (const rho of [-0.2, 0.2, NaN, Infinity]) expect(() => dixonColesProbabilities(1, 1, rho)).toThrow(RangeError);
    expect(() => dixonColesProbabilities(1000, 1000, 0)).toThrow(/mass/);
    expect(() => predictDixonColes({ ...fixture, awayTeam: "Missing" }, parameters)).toThrow(/exist/);
    expect(() => predictDixonColes(fixture, { ...parameters, homeAdvantage: Infinity })).toThrow(RangeError);
  });

  it("enforces the attack sum structurally and the complete score-valid rho interval", () => {
    const decoded = decodeParameters(["Alpha", "Bravo", "Charlie"], [0.7, -0.2, 0.3, 0.4, 0.5, 0.1, -2]);
    expect(decoded.teams.reduce((sum, rating) => sum + rating.attack, 0)).toBeCloseTo(0, 14);
    expect(Math.abs(decoded.rho)).toBeLessThan(0.2);
    for (const home of decoded.teams) for (const away of decoded.teams) if (home.team !== away.team) {
      expect(() => predictDixonColes({ id: "valid", homeTeam: home.team, awayTeam: away.team }, decoded)).not.toThrow();
    }
    expect(() => decodeParameters(["Bravo", "Alpha"], [0, 0, 0, 0, 0])).toThrow(/lexically/);
  });

  it("matches the analytic likelihood gradient to numerical derivatives, including active tau-domain bounds", () => {
    const objective = prepareLikelihood(syntheticHistory(2));
    for (const point of [Array(9).fill(0), [0.5, -0.2, 0.1, 0.9, 0.4, -0.3, 0.7, 1.1, 0.4]]) {
      const gradient = objective.evaluate(point).gradient;
      for (let i = 0; i < point.length; i++) {
        const high = [...point], low = [...point]; high[i] += 1e-5; low[i] -= 1e-5;
        const numerical = (objective.evaluate(high).value - objective.evaluate(low).value) / 2e-5;
        expect(gradient[i], `parameter ${i}`).toBeCloseTo(numerical, 5);
      }
    }
  });
});
