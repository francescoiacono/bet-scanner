export interface FootballFixture {
  readonly id: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
}

/** Fictional historical totals, split by venue; no predicted probabilities. */
export interface TeamProfile {
  readonly team: string;
  readonly homeMatches: number;
  readonly homeGoalsFor: number;
  readonly homeGoalsAgainst: number;
  readonly awayMatches: number;
  readonly awayGoalsFor: number;
  readonly awayGoalsAgainst: number;
}

export interface LeagueAverages {
  readonly homeGoalsPerMatch: number;
  readonly awayGoalsPerMatch: number;
}

export interface ExpectedGoals {
  readonly expectedHomeGoals: number;
  readonly expectedAwayGoals: number;
}

export interface OutcomeProbabilities {
  readonly homeProbability: number;
  readonly drawProbability: number;
  readonly awayProbability: number;
}

export interface MatchPrediction extends ExpectedGoals, OutcomeProbabilities {
  readonly fixtureId: string;
  readonly modelVersion: string;
}
