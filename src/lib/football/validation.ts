import type {
  FootballFixture,
  LeagueAverages,
  MatchPrediction,
  TeamProfile,
} from "./types";

export function validateName(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError(`${label} must be a non-empty string.`);
  }
}

export function validateAggregate(goals: number, matches: number): void {
  if (!Number.isSafeInteger(matches) || matches <= 0) {
    throw new RangeError("Match counts must be positive safe integers.");
  }
  if (!Number.isSafeInteger(goals) || goals < 0) {
    throw new RangeError("Goal totals must be non-negative safe integers.");
  }
}

export function validateTeamProfile(profile: TeamProfile): void {
  validateName(profile.team, "Team name");
  validateAggregate(profile.homeGoalsFor, profile.homeMatches);
  validateAggregate(profile.homeGoalsAgainst, profile.homeMatches);
  validateAggregate(profile.awayGoalsFor, profile.awayMatches);
  validateAggregate(profile.awayGoalsAgainst, profile.awayMatches);
}

export function validateLeagueAverage(average: number): void {
  if (!Number.isFinite(average) || average <= 0) {
    throw new RangeError("League goal averages must be finite and greater than zero.");
  }
}

export function validateLeagueAverages(averages: LeagueAverages): void {
  validateLeagueAverage(averages.homeGoalsPerMatch);
  validateLeagueAverage(averages.awayGoalsPerMatch);
}

export function validateExpectedGoals(expectedGoals: number): void {
  if (!Number.isFinite(expectedGoals) || expectedGoals < 0) {
    throw new RangeError("Expected goals must be finite and non-negative.");
  }
}

export function validateFixture(fixture: FootballFixture): void {
  validateName(fixture.id, "Fixture ID");
  validateName(fixture.homeTeam, "Home team");
  validateName(fixture.awayTeam, "Away team");
  if (fixture.homeTeam === fixture.awayTeam) {
    throw new RangeError("A fixture must contain two different teams.");
  }
}

export function validatePrediction(prediction: MatchPrediction): void {
  validateName(prediction.fixtureId, "Prediction fixture ID");
  validateName(prediction.modelVersion, "Model version");
  validateExpectedGoals(prediction.expectedHomeGoals);
  validateExpectedGoals(prediction.expectedAwayGoals);
  const probabilities = [
    prediction.homeProbability,
    prediction.drawProbability,
    prediction.awayProbability,
  ];
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("Outcome probabilities must be finite numbers between 0 and 1.");
  }
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-10) {
    throw new RangeError("Outcome probabilities must sum to 1 within 1e-10.");
  }
}
