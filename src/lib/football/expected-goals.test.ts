import { describe, expect, it } from "vitest";
import { calculateAttackingStrength, calculateDefensiveWeakness, calculateExpectedGoals } from "./expected-goals";
import type { TeamProfile } from "./types";

const home: TeamProfile = {
  team: "Home", homeMatches: 20, homeGoalsFor: 40, homeGoalsAgainst: 10,
  awayMatches: 12, awayGoalsFor: 15, awayGoalsAgainst: 18,
};
const away: TeamProfile = {
  team: "Away", homeMatches: 15, homeGoalsFor: 22, homeGoalsAgainst: 11,
  awayMatches: 10, awayGoalsFor: 6, awayGoalsAgainst: 30,
};
const averages = { homeGoalsPerMatch: 1.5, awayGoalsPerMatch: 1.2 };

describe("attack/defence expected-goals baseline", () => {
  it("calculates attacking strength relative to the venue baseline", () => {
    expect(calculateAttackingStrength(40, 20, 1.5)).toBeCloseTo(4 / 3);
  });

  it("calculates defensive weakness as the conceded-goal ratio", () => {
    expect(calculateDefensiveWeakness(30, 10, 1.5)).toBeCloseTo(2);
    expect(calculateDefensiveWeakness(10, 20, 1.2)).toBeCloseTo(5 / 12);
  });

  it("uses the exact home/away attacking and opposing defensive formulas", () => {
    const result = calculateExpectedGoals(home, away, averages);
    expect(result.expectedHomeGoals).toBeCloseTo(1.5 * (2 / 1.5) * (3 / 1.5));
    expect(result.expectedHomeGoals).toBeCloseTo(4);
    expect(result.expectedAwayGoals).toBeCloseTo(1.2 * (0.6 / 1.2) * (0.5 / 1.2));
    expect(result.expectedAwayGoals).toBeCloseTo(0.25);
  });

  it("ignores the teams' unused venue totals when supplied baselines are unchanged", () => {
    expect(calculateExpectedGoals(
      { ...home, awayGoalsFor: 99, awayGoalsAgainst: 88 },
      { ...away, homeGoalsFor: 77, homeGoalsAgainst: 66 },
      averages,
    )).toEqual(calculateExpectedGoals(home, away, averages));
  });

  it("increases expected goals for a stronger attack or weaker opposing defence", () => {
    const baseline = calculateExpectedGoals(home, away, averages);
    expect(calculateExpectedGoals({ ...home, homeGoalsFor: 50 }, away, averages).expectedHomeGoals).toBeGreaterThan(baseline.expectedHomeGoals);
    expect(calculateExpectedGoals(home, { ...away, awayGoalsAgainst: 40 }, averages).expectedHomeGoals).toBeGreaterThan(baseline.expectedHomeGoals);
  });

  it("permits zero strength and zero expected goals", () => {
    expect(calculateAttackingStrength(0, 20, 1.5)).toBe(0);
    expect(calculateDefensiveWeakness(0, 20, 1.5)).toBe(0);
    expect(calculateExpectedGoals({ ...home, homeGoalsFor: 0 }, { ...away, awayGoalsFor: 0 }, averages)).toEqual({ expectedHomeGoals: 0, expectedAwayGoals: 0 });
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid league averages: %s", (value) => {
    expect(() => calculateAttackingStrength(10, 10, value)).toThrow(RangeError);
    expect(() => calculateDefensiveWeakness(10, 10, value)).toThrow(RangeError);
    expect(() => calculateExpectedGoals(home, away, { ...averages, homeGoalsPerMatch: value })).toThrow(RangeError);
    expect(() => calculateExpectedGoals(home, away, { ...averages, awayGoalsPerMatch: value })).toThrow(RangeError);
  });

  it("rejects invalid aggregates even in unused venue totals", () => {
    expect(() => calculateExpectedGoals({ ...home, awayMatches: 0 }, away, averages)).toThrow(RangeError);
    expect(() => calculateAttackingStrength(-1, 20, 1.5)).toThrow(RangeError);
    expect(() => calculateDefensiveWeakness(10, 0, 1.5)).toThrow(RangeError);
  });

  it("fails explicitly if finite inputs overflow strength or expected goals", () => {
    expect(() => calculateAttackingStrength(40, 20, Number.MIN_VALUE)).toThrow(/finite/);
    expect(() => calculateExpectedGoals(home, away, { ...averages, homeGoalsPerMatch: 1e-308 })).toThrow(RangeError);
  });

  it("does not mutate profiles or baselines", () => {
    const frozenHome = Object.freeze({ ...home });
    const frozenAway = Object.freeze({ ...away });
    const frozenAverages = Object.freeze({ ...averages });
    calculateExpectedGoals(frozenHome, frozenAway, frozenAverages);
    expect(frozenHome).toEqual(home);
    expect(frozenAway).toEqual(away);
    expect(frozenAverages).toEqual(averages);
  });
});
