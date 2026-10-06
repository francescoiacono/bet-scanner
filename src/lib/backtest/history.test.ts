import { describe, expect, it } from "vitest";
import { mockFixtures } from "../../data/mock-fixtures";
import { mockPlayedMatches } from "../../data/mock-played-matches";
import { calculateHistoricalLeagueAverages, deriveTeamProfiles, hasEnoughHistory } from "./history";
import type { PlayedMatch } from "./types";

describe("fictional history and derived profiles", () => {
  it("has eight six-match rounds, the scanner's twelve teams, and balanced venue warm-up", () => {
    expect(mockPlayedMatches).toHaveLength(48);
    const timestamps = [...new Set(mockPlayedMatches.map((match) => match.kickoffAt))];
    expect(timestamps).toHaveLength(8);
    const expectedTeams = mockFixtures.flatMap((fixture) => [fixture.homeTeam, fixture.awayTeam]).sort();
    for (const timestamp of timestamps) {
      const round = mockPlayedMatches.filter((match) => match.kickoffAt === timestamp);
      expect(round).toHaveLength(6);
      expect(round.flatMap((match) => [match.homeTeam, match.awayTeam]).sort()).toEqual(expectedTeams);
    }
    const warmProfiles = deriveTeamProfiles(mockPlayedMatches.slice(0, 24));
    expect(warmProfiles).toHaveLength(12);
    for (const profile of warmProfiles) {
      expect(profile.homeMatches).toBe(2);
      expect(profile.awayMatches).toBe(2);
      expect(hasEnoughHistory(profile)).toBe(true);
    }
    for (const match of mockPlayedMatches) {
      expect(match).not.toHaveProperty("decimalOdds");
      expect(match).not.toHaveProperty("modelProbability");
    }
  });

  it("derives scored/conceded totals by venue and counts each match once in league averages", () => {
    const history: readonly PlayedMatch[] = [
      { id: "a", kickoffAt: "2025-01-01T15:00:00Z", homeTeam: "A", awayTeam: "B", homeGoals: 2, awayGoals: 1 },
      { id: "b", kickoffAt: "2025-01-02T15:00:00Z", homeTeam: "B", awayTeam: "A", homeGoals: 0, awayGoals: 3 },
    ];
    expect(deriveTeamProfiles(history)).toEqual([
      { team: "A", homeMatches: 1, homeGoalsFor: 2, homeGoalsAgainst: 1, awayMatches: 1, awayGoalsFor: 3, awayGoalsAgainst: 0 },
      { team: "B", homeMatches: 1, homeGoalsFor: 0, homeGoalsAgainst: 3, awayMatches: 1, awayGoalsFor: 1, awayGoalsAgainst: 2 },
    ]);
    expect(calculateHistoricalLeagueAverages(history)).toEqual({ homeGoalsPerMatch: 1, awayGoalsPerMatch: 2 });
    expect(hasEnoughHistory(deriveTeamProfiles(history)[0])).toBe(false);
    expect(hasEnoughHistory(deriveTeamProfiles(history)[0], 1)).toBe(true);
  });

  it("requires both venues without inventing missing appearances or smoothing zero goals", () => {
    const oneVenue = deriveTeamProfiles(mockPlayedMatches.slice(0, 6));
    expect(oneVenue.every((profile) => !hasEnoughHistory(profile, 1))).toBe(true);
    expect(hasEnoughHistory(undefined)).toBe(false);
    const bracken = deriveTeamProfiles(mockPlayedMatches).find((profile) => profile.team === "Bracken Athletic");
    expect(bracken?.awayGoalsFor).toBe(0);
    expect(hasEnoughHistory(bracken)).toBe(true);
  });

  it("rejects empty or zero league baselines and unsafe summed goal totals", () => {
    expect(deriveTeamProfiles([])).toEqual([]);
    expect(() => calculateHistoricalLeagueAverages([])).toThrow(RangeError);
    expect(() => calculateHistoricalLeagueAverages([{ ...mockPlayedMatches[0], awayGoals: 0 }])).toThrow(/greater than zero/);
    const huge = [
      { ...mockPlayedMatches[0], id: "huge-1", homeGoals: Number.MAX_SAFE_INTEGER },
      { ...mockPlayedMatches[0], id: "huge-2", homeGoals: 1 },
    ];
    expect(() => deriveTeamProfiles(huge)).toThrow(RangeError);
    expect(() => calculateHistoricalLeagueAverages(huge)).toThrow(RangeError);
  });
});
