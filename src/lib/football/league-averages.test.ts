import { describe, expect, it } from "vitest";
import { calculateLeagueAverages } from "./league-averages";
import type { TeamProfile } from "./types";

const profile: TeamProfile = {
  team: "Example",
  homeMatches: 2, homeGoalsFor: 4, homeGoalsAgainst: 1,
  awayMatches: 3, awayGoalsFor: 3, awayGoalsAgainst: 4,
};

describe("league averages and aggregate validation", () => {
  it("calculates venue-specific averages weighted by match counts", () => {
    const other = {
      ...profile, team: "Other",
      homeMatches: 6, homeGoalsFor: 6,
      awayMatches: 1, awayGoalsFor: 3,
    };
    const result = calculateLeagueAverages([profile, other]);
    expect(result.homeGoalsPerMatch).toBeCloseTo(10 / 8);
    expect(result.awayGoalsPerMatch).toBeCloseTo(6 / 4);
    expect(result.homeGoalsPerMatch).not.toBe((2 + 1) / 2);
  });

  it("depends on scored goals for each venue's baseline, not conceded totals", () => {
    const original = calculateLeagueAverages([profile]);
    expect(calculateLeagueAverages([{ ...profile, homeGoalsAgainst: 99, awayGoalsAgainst: 88 }])).toEqual(original);
  });

  it("rejects empty input, duplicate profiles, and blank names", () => {
    expect(() => calculateLeagueAverages([])).toThrow(RangeError);
    expect(() => calculateLeagueAverages([profile, profile])).toThrow(/Duplicate team/);
    expect(() => calculateLeagueAverages([{ ...profile, team: " " }])).toThrow(RangeError);
  });

  it.each(["homeMatches", "awayMatches"] as const)("rejects invalid %s", (field) => {
    for (const value of [0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calculateLeagueAverages([{ ...profile, [field]: value }])).toThrow(RangeError);
    }
  });

  it.each(["homeGoalsFor", "homeGoalsAgainst", "awayGoalsFor", "awayGoalsAgainst"] as const)(
    "rejects invalid %s", (field) => {
      for (const value of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => calculateLeagueAverages([{ ...profile, [field]: value }])).toThrow(RangeError);
      }
    },
  );

  it.each(["homeGoalsFor", "awayGoalsFor"] as const)("rejects a zero league baseline in %s", (field) => {
    expect(() => calculateLeagueAverages([{ ...profile, [field]: 0 }])).toThrow(/greater than zero/);
  });

  it("permits zero goals for an individual team when league baselines remain positive", () => {
    const zero = { ...profile, team: "Zero", homeGoalsFor: 0, awayGoalsFor: 0, homeGoalsAgainst: 0, awayGoalsAgainst: 0 };
    expect(calculateLeagueAverages([zero, profile]).homeGoalsPerMatch).toBeCloseTo(1);
  });

  it("rejects aggregate totals beyond safe integer precision", () => {
    const huge = { ...profile, homeMatches: Number.MAX_SAFE_INTEGER };
    expect(() => calculateLeagueAverages([huge, { ...profile, team: "Other" }])).toThrow(/precision/);
  });

  it("does not mutate profiles or the source array", () => {
    const input = Object.freeze([Object.freeze({ ...profile })]);
    expect(calculateLeagueAverages(input)).toEqual({ homeGoalsPerMatch: 2, awayGoalsPerMatch: 1 });
    expect(input).toEqual([profile]);
  });
});
