import { calculateMatchProbabilities } from "../football/poisson";
import type { ExpectedGoals, LeagueAverages, OutcomeProbabilities } from "../football/types";
import { validateLeagueAverages } from "../football/validation";

export const LEAGUE_POISSON_BENCHMARK = "league-poisson";
export interface LeaguePoissonPrediction extends ExpectedGoals, OutcomeProbabilities {}

/** No fixture identities or team profiles enter this benchmark. */
export function predictLeaguePoisson(averages: LeagueAverages): LeaguePoissonPrediction {
  validateLeagueAverages(averages);
  return {
    expectedHomeGoals: averages.homeGoalsPerMatch,
    expectedAwayGoals: averages.awayGoalsPerMatch,
    ...calculateMatchProbabilities(averages.homeGoalsPerMatch, averages.awayGoalsPerMatch),
  };
}
