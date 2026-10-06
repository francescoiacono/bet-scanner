import type { LeagueAverages, TeamProfile } from "./types";
import { validateLeagueAverages, validateTeamProfile } from "./validation";

/** Weight each team's scored goals by its actual number of matches. */
export function calculateLeagueAverages(
  profiles: readonly TeamProfile[],
): LeagueAverages {
  if (profiles.length === 0) {
    throw new RangeError("League averages require at least one team profile.");
  }

  let homeGoals = 0;
  let homeMatches = 0;
  let awayGoals = 0;
  let awayMatches = 0;
  const teams = new Set<string>();

  for (const profile of profiles) {
    validateTeamProfile(profile);
    if (teams.has(profile.team)) {
      throw new RangeError(`Duplicate team profile: ${profile.team}.`);
    }
    teams.add(profile.team);
    homeGoals += profile.homeGoalsFor;
    homeMatches += profile.homeMatches;
    awayGoals += profile.awayGoalsFor;
    awayMatches += profile.awayMatches;
  }
  if (![homeGoals, homeMatches, awayGoals, awayMatches].every(Number.isSafeInteger)) {
    throw new RangeError("League aggregate totals exceed safe integer precision.");
  }

  const averages = {
    homeGoalsPerMatch: homeGoals / homeMatches,
    awayGoalsPerMatch: awayGoals / awayMatches,
  };
  validateLeagueAverages(averages);
  return averages;
}
