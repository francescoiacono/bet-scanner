import type { OutcomeProbabilities } from "../football/types";
import { validatePlayedMatches } from "./history";
import { actualOutcome } from "./metrics";
import type { PlayedMatch } from "./types";

export const LEAGUE_BASE_RATE_BENCHMARK = "league-base-rate";

/** Unsmoothed frequencies. The caller supplies the same strict prior snapshot as the model. */
export function calculateLeagueBaseRate(history: readonly PlayedMatch[]): OutcomeProbabilities {
  validatePlayedMatches(history);
  if (history.length === 0) throw new RangeError("League base rate requires prior completed matches.");
  const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const match of history) counts[actualOutcome(match.homeGoals, match.awayGoals)]++;
  return {
    homeProbability: counts.HOME / history.length,
    drawProbability: counts.DRAW / history.length,
    awayProbability: counts.AWAY / history.length,
  };
}
