import type { LeagueAverages, TeamProfile } from "../football/types";
import { validateFixture, validateLeagueAverages, validateName } from "../football/validation";
import type { PlayedMatch } from "./types";

export const DEFAULT_MINIMUM_VENUE_MATCHES = 2;

export function validateMinimumVenueMatches(minimum: number): void {
  if (!Number.isSafeInteger(minimum) || minimum < 1) {
    throw new RangeError("Minimum venue matches must be a positive safe integer.");
  }
}

export function validateGoals(goals: number): void {
  if (!Number.isSafeInteger(goals) || goals < 0) {
    throw new RangeError("Final goals must be non-negative safe integers.");
  }
}

/** Strict ISO timestamp with seconds, timezone, and at most millisecond precision. */
export function kickoffTimestamp(kickoffAt: string): number {
  const parts = typeof kickoffAt === "string" && kickoffAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!parts) throw new RangeError("Kickoff must be an ISO timestamp with an explicit timezone.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] ||
    Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59 ||
    (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
  ) {
    throw new RangeError("Kickoff contains an invalid calendar date or time.");
  }
  const timestamp = Date.parse(kickoffAt);
  if (!Number.isFinite(timestamp)) throw new RangeError("Kickoff timestamp is invalid.");
  return timestamp;
}

export function validatePlayedMatches(matches: readonly PlayedMatch[]): void {
  const ids = new Set<string>();
  for (const match of matches) {
    validateFixture(match);
    kickoffTimestamp(match.kickoffAt);
    validateGoals(match.homeGoals);
    validateGoals(match.awayGoals);
    if (ids.has(match.id)) throw new RangeError(`Duplicate played-match ID: ${match.id}.`);
    ids.add(match.id);
  }
}

/** Totals can have zero venue appearances; check readiness before using the model. */
export function deriveTeamProfiles(matches: readonly PlayedMatch[]): TeamProfile[] {
  validatePlayedMatches(matches);
  const teams = new Map<string, {
    team: string;
    homeMatches: number; homeGoalsFor: number; homeGoalsAgainst: number;
    awayMatches: number; awayGoalsFor: number; awayGoalsAgainst: number;
  }>();
  function teamTotals(team: string) {
    let profile = teams.get(team);
    if (!profile) {
      profile = { team, homeMatches: 0, homeGoalsFor: 0, homeGoalsAgainst: 0, awayMatches: 0, awayGoalsFor: 0, awayGoalsAgainst: 0 };
      teams.set(team, profile);
    }
    return profile;
  }
  for (const match of matches) {
    const home = teamTotals(match.homeTeam);
    const away = teamTotals(match.awayTeam);
    home.homeMatches++;
    home.homeGoalsFor += match.homeGoals;
    home.homeGoalsAgainst += match.awayGoals;
    away.awayMatches++;
    away.awayGoalsFor += match.awayGoals;
    away.awayGoalsAgainst += match.homeGoals;
  }
  const profiles = [...teams.values()].sort((a, b) => a.team < b.team ? -1 : a.team > b.team ? 1 : 0);
  for (const profile of profiles) {
    hasEnoughHistory(profile); // Validates aggregates, including safe summed totals.
  }
  return profiles;
}

export function hasEnoughHistory(
  profile: TeamProfile | undefined,
  minimumVenueMatches: number = DEFAULT_MINIMUM_VENUE_MATCHES,
): boolean {
  validateMinimumVenueMatches(minimumVenueMatches);
  if (!profile) return false;
  validateName(profile.team, "Historical team name");
  const counts = [profile.homeMatches, profile.awayMatches, profile.homeGoalsFor,
    profile.homeGoalsAgainst, profile.awayGoalsFor, profile.awayGoalsAgainst];
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError("Derived historical aggregates must be non-negative safe integers.");
  }
  return profile.homeMatches >= minimumVenueMatches && profile.awayMatches >= minimumVenueMatches;
}

/** Count each prior match once, including matches involving unready teams. */
export function calculateHistoricalLeagueAverages(matches: readonly PlayedMatch[]): LeagueAverages {
  validatePlayedMatches(matches);
  if (matches.length === 0) throw new RangeError("League baselines require historical matches.");
  const homeGoals = matches.reduce((sum, match) => sum + match.homeGoals, 0);
  const awayGoals = matches.reduce((sum, match) => sum + match.awayGoals, 0);
  if (!Number.isSafeInteger(homeGoals) || !Number.isSafeInteger(awayGoals)) {
    throw new RangeError("Historical goal totals exceed safe integer precision.");
  }
  const averages = { homeGoalsPerMatch: homeGoals / matches.length, awayGoalsPerMatch: awayGoals / matches.length };
  validateLeagueAverages(averages);
  return averages;
}
