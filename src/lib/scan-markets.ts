import { analyseBet } from "./betting/analyse-bet";
import type { AnalysedBet, MarketQuote } from "./betting/types";
import { calculateLeagueAverages } from "./football/league-averages";
import { predictMatch } from "./football/predict-match";
import type { FootballFixture, LeagueAverages, MatchPrediction, TeamProfile } from "./football/types";

export interface MarketScan {
  readonly leagueAverages: LeagueAverages;
  readonly predictions: readonly MatchPrediction[];
  readonly analysedBets: readonly AnalysedBet[];
}

/** Local orchestration; predictions never read quotes or their prices. */
export function scanMarkets(
  profiles: readonly TeamProfile[],
  fixtures: readonly FootballFixture[],
  quotes: readonly MarketQuote[],
): MarketScan {
  const leagueAverages = calculateLeagueAverages(profiles);
  const teams = new Map(profiles.map((profile) => [profile.team, profile]));
  const fixtureMap = new Map<string, FootballFixture>();
  const predictions = fixtures.map((fixture) => {
    if (fixtureMap.has(fixture.id)) {
      throw new RangeError(`Duplicate fixture ID: ${fixture.id}.`);
    }
    fixtureMap.set(fixture.id, fixture);
    const home = teams.get(fixture.homeTeam);
    const away = teams.get(fixture.awayTeam);
    if (!home || !away) {
      throw new RangeError(`Missing team profile for fixture: ${fixture.id}.`);
    }
    return predictMatch(fixture, home, away, leagueAverages);
  });
  const predictionMap = new Map(predictions.map((prediction) => [prediction.fixtureId, prediction]));
  const quoteIds = new Set<string>();
  const analysedBets = quotes.map((quote) => {
    if (quoteIds.has(quote.id)) {
      throw new RangeError(`Duplicate quote ID: ${quote.id}.`);
    }
    quoteIds.add(quote.id);
    const fixture = fixtureMap.get(quote.fixtureId);
    const prediction = predictionMap.get(quote.fixtureId);
    if (!fixture || !prediction) {
      throw new RangeError(`Unknown fixture for quote: ${quote.id}.`);
    }
    return analyseBet(quote, fixture, prediction);
  });
  return { leagueAverages, predictions, analysedBets };
}
