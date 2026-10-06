import type { ExpectedGoals, LeagueAverages, TeamProfile } from "./types";
import {
  validateAggregate,
  validateExpectedGoals,
  validateLeagueAverage,
  validateLeagueAverages,
  validateTeamProfile,
} from "./validation";

function calculateStrength(goals: number, matches: number, leagueAverage: number): number {
  validateAggregate(goals, matches);
  validateLeagueAverage(leagueAverage);
  const strength = (goals / matches) / leagueAverage;
  if (!Number.isFinite(strength)) {
    throw new RangeError("Team strength must be finite.");
  }
  return strength;
}

export function calculateAttackingStrength(
  goalsFor: number,
  matches: number,
  leagueAverage: number,
): number {
  return calculateStrength(goalsFor, matches, leagueAverage);
}

/** A higher ratio means more goals conceded, hence a weaker defence. */
export function calculateDefensiveWeakness(
  goalsAgainst: number,
  matches: number,
  leagueAverage: number,
): number {
  return calculateStrength(goalsAgainst, matches, leagueAverage);
}

/** Intentionally simple venue-specific attack/defence baseline. */
export function calculateExpectedGoals(
  home: TeamProfile,
  away: TeamProfile,
  averages: LeagueAverages,
): ExpectedGoals {
  validateTeamProfile(home);
  validateTeamProfile(away);
  validateLeagueAverages(averages);

  const homeAttack = calculateAttackingStrength(
    home.homeGoalsFor, home.homeMatches, averages.homeGoalsPerMatch,
  );
  const awayDefence = calculateDefensiveWeakness(
    away.awayGoalsAgainst, away.awayMatches, averages.homeGoalsPerMatch,
  );
  const awayAttack = calculateAttackingStrength(
    away.awayGoalsFor, away.awayMatches, averages.awayGoalsPerMatch,
  );
  const homeDefence = calculateDefensiveWeakness(
    home.homeGoalsAgainst, home.homeMatches, averages.awayGoalsPerMatch,
  );

  const expectedHomeGoals = averages.homeGoalsPerMatch * homeAttack * awayDefence;
  const expectedAwayGoals = averages.awayGoalsPerMatch * awayAttack * homeDefence;
  validateExpectedGoals(expectedHomeGoals);
  validateExpectedGoals(expectedAwayGoals);
  return { expectedHomeGoals, expectedAwayGoals };
}
