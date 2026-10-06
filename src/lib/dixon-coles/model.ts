import { MAX_GOALS, poissonProbability } from "../football/poisson";
import type { FootballFixture, OutcomeProbabilities } from "../football/types";
import { validateExpectedGoals, validateFixture } from "../football/validation";
import type { DixonColesParameters, DixonColesPrediction } from "./types";

export const DIXON_COLES_VERSION = "dixon-coles-v1";
export const RHO_BOUND = 0.20;

export function validateRho(rho: number): void {
  if (!Number.isFinite(rho) || Math.abs(rho) >= RHO_BOUND) throw new RangeError("Dixon–Coles rho must be strictly inside (-0.20, +0.20).");
}

export function lowScoreTau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  validateExpectedGoals(lambda); validateExpectedGoals(mu); validateRho(rho);
  if (![x, y].every((goals) => Number.isSafeInteger(goals) && goals >= 0)) throw new RangeError("Score goals must be non-negative safe integers.");
  const tau = x === 0 && y === 0 ? 1 - lambda * mu * rho
    : x === 0 && y === 1 ? 1 + lambda * rho
      : x === 1 && y === 0 ? 1 + mu * rho
        : x === 1 && y === 1 ? 1 - rho : 1;
  if (!Number.isFinite(tau) || tau < 0) throw new RangeError("Invalid Dixon–Coles tau: score probability would be negative or non-finite.");
  return tau;
}

export function dixonColesExpectedGoals(fixture: FootballFixture, parameters: DixonColesParameters) {
  validateFixture(fixture); validateRho(parameters.rho);
  if (!Number.isFinite(parameters.homeAdvantage)) throw new RangeError("Home advantage must be finite.");
  const ratings = new Map<string, typeof parameters.teams[number]>();
  for (const rating of parameters.teams) {
    if (!rating.team.trim() || ratings.has(rating.team) || !Number.isFinite(rating.attack) || !Number.isFinite(rating.defenceWeakness)) {
      throw new RangeError("Team ratings require unique identities and finite parameters.");
    }
    ratings.set(rating.team, rating);
  }
  const home = ratings.get(fixture.homeTeam), away = ratings.get(fixture.awayTeam);
  if (!home || !away) throw new RangeError("Fixture teams must exist in the successful fit.");
  const expectedHomeGoals = Math.exp(parameters.homeAdvantage + home.attack + away.defenceWeakness);
  const expectedAwayGoals = Math.exp(away.attack + home.defenceWeakness);
  if (![expectedHomeGoals, expectedAwayGoals].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Fitted expected goals must be finite and positive.");
  }
  return { expectedHomeGoals, expectedAwayGoals };
}

/** Same frozen Poisson PMFs and 0–10 grid; only the four low-score cells differ. */
export function dixonColesProbabilities(lambda: number, mu: number, rho: number): OutcomeProbabilities {
  const home = Array.from({ length: MAX_GOALS + 1 }, (_, goals) => poissonProbability(lambda, goals));
  const away = Array.from({ length: MAX_GOALS + 1 }, (_, goals) => poissonProbability(mu, goals));
  let homeProbability = 0, drawProbability = 0, awayProbability = 0;
  for (let x = 0; x <= MAX_GOALS; x++) for (let y = 0; y <= MAX_GOALS; y++) {
    const probability = lowScoreTau(x, y, lambda, mu, rho) * home[x] * away[y];
    if (!Number.isFinite(probability) || probability < 0) throw new RangeError("Invalid Dixon–Coles score probability.");
    if (x > y) homeProbability += probability;
    else if (x === y) drawProbability += probability;
    else awayProbability += probability;
  }
  const mass = homeProbability + drawProbability + awayProbability;
  if (!Number.isFinite(mass) || mass <= 0) throw new RangeError("Dixon–Coles score grid retains no usable probability mass.");
  return { homeProbability: homeProbability / mass, drawProbability: drawProbability / mass, awayProbability: awayProbability / mass };
}

export function predictDixonColes(fixture: FootballFixture, parameters: DixonColesParameters): DixonColesPrediction {
  const goals = dixonColesExpectedGoals(fixture, parameters);
  return { fixtureId: fixture.id, ...goals,
    ...dixonColesProbabilities(goals.expectedHomeGoals, goals.expectedAwayGoals, parameters.rho),
    rho: parameters.rho, modelVersion: DIXON_COLES_VERSION };
}
