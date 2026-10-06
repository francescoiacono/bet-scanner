import { describe, expect, it } from "vitest";
import { mockFixtures } from "../../data/mock-fixtures";
import type { TeamProfile } from "./types";
import { MODEL_VERSION, predictMatch } from "./predict-match";

const fixture = mockFixtures[0];
// Fixed test inputs retain V0.2's known mathematical example independently
// of the application dataset; they are not production model inputs.
const home: TeamProfile = {
  team: fixture.homeTeam, homeMatches: 20, homeGoalsFor: 36, homeGoalsAgainst: 18,
  awayMatches: 20, awayGoalsFor: 26, awayGoalsAgainst: 24,
};
const away: TeamProfile = {
  team: fixture.awayTeam, homeMatches: 20, homeGoalsFor: 24, homeGoalsAgainst: 30,
  awayMatches: 20, awayGoalsFor: 18, awayGoalsAgainst: 36,
};
const averages = { homeGoalsPerMatch: 1.5, awayGoalsPerMatch: 1.2 };

describe("match prediction API", () => {
  it("returns expected goals, all outcomes, fixture identity, and model version", () => {
    const prediction = predictMatch(fixture, home, away, averages);
    expect(prediction.fixtureId).toBe(fixture.id);
    expect(prediction.modelVersion).toBe(MODEL_VERSION);
    expect(MODEL_VERSION).toBe("poisson-v1");
    expect(prediction.expectedHomeGoals).toBeCloseTo(2.16, 12);
    expect(prediction.expectedAwayGoals).toBeCloseTo(0.675, 12);
    expect(prediction.homeProbability + prediction.drawProbability + prediction.awayProbability).toBeCloseTo(1, 12);
    expect(prediction.homeProbability).toBeGreaterThan(prediction.awayProbability);
  });

  it("is deterministic across repeated calls", () => {
    expect(predictMatch(fixture, home, away, averages)).toEqual(predictMatch(fixture, home, away, averages));
  });

  it.each(["id", "homeTeam", "awayTeam"] as const)("rejects blank fixture %s", (field) => {
    expect(() => predictMatch({ ...fixture, [field]: " " }, home, away, averages)).toThrow(RangeError);
  });

  it("rejects self matches and mismatched team profiles", () => {
    expect(() => predictMatch({ ...fixture, awayTeam: fixture.homeTeam }, home, home, averages)).toThrow(RangeError);
    expect(() => predictMatch(fixture, away, home, averages)).toThrow(/must match/);
    expect(() => predictMatch(fixture, home, home, averages)).toThrow(/must match/);
  });

  it("rejects invalid aggregate or league inputs", () => {
    expect(() => predictMatch(fixture, { ...home, homeMatches: 0 }, away, averages)).toThrow(RangeError);
    expect(() => predictMatch(fixture, home, { ...away, awayGoalsAgainst: -1 }, averages)).toThrow(RangeError);
    expect(() => predictMatch(fixture, home, away, { ...averages, awayGoalsPerMatch: NaN })).toThrow(RangeError);
  });

  it("does not mutate the fixture, profiles, or baselines", () => {
    const frozenFixture = Object.freeze({ ...fixture });
    const frozenHome = Object.freeze({ ...home });
    const frozenAway = Object.freeze({ ...away });
    const frozenAverages = Object.freeze({ ...averages });
    predictMatch(frozenFixture, frozenHome, frozenAway, frozenAverages);
    expect(frozenFixture).toEqual(fixture);
    expect(frozenHome).toEqual(home);
    expect(frozenAway).toEqual(away);
    expect(frozenAverages).toEqual(averages);
  });
});
