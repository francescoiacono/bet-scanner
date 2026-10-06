import { calculateExpectedGoals } from "./expected-goals";
import { calculateMatchProbabilities } from "./poisson";
import type { FootballFixture, LeagueAverages, MatchPrediction, TeamProfile } from "./types";
import { validateFixture, validatePrediction } from "./validation";

export const MODEL_VERSION = "poisson-v1";

export function predictMatch(
  fixture: FootballFixture,
  homeProfile: TeamProfile,
  awayProfile: TeamProfile,
  leagueAverages: LeagueAverages,
): MatchPrediction {
  validateFixture(fixture);
  if (homeProfile.team !== fixture.homeTeam || awayProfile.team !== fixture.awayTeam) {
    throw new RangeError("Team profiles must match their fixture's home and away teams.");
  }
  const goals = calculateExpectedGoals(homeProfile, awayProfile, leagueAverages);
  const prediction: MatchPrediction = {
    fixtureId: fixture.id,
    ...goals,
    ...calculateMatchProbabilities(goals.expectedHomeGoals, goals.expectedAwayGoals),
    modelVersion: MODEL_VERSION,
  };
  validatePrediction(prediction);
  return prediction;
}
