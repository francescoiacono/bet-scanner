import { kickoffTimestamp, validatePlayedMatches } from "../backtest/history";
import type { PlayedMatch } from "../backtest/types";
import { lowScoreTau, RHO_BOUND, validateRho } from "./model";
import type { DixonColesParameters } from "./types";

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** These extra bounds follow algebraically from tau >= 0, not empirical tuning.
 * Map the complete feasible rho interval smoothly in its interior. Maxima are
 * piecewise differentiable; exact ties choose the first lexical team pair.
 */
function correlationTransform(teams: DixonColesParameters["teams"], homeAdvantage: number, raw: number) {
  let maximumRate = 0, maximumProduct = 0;
  let lowerPair = { home: 0, away: 1, homeRate: true }, upperPair = { home: 0, away: 1 };
  for (let i = 0; i < teams.length; i++) for (let j = 0; j < teams.length; j++) if (i !== j) {
    const lambda = Math.exp(homeAdvantage + teams[i].attack + teams[j].defenceWeakness);
    const mu = Math.exp(teams[j].attack + teams[i].defenceWeakness);
    const product = lambda * mu;
    if (![lambda, mu, product].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError("Invalid fitted score rates.");
    if (lambda > maximumRate) { maximumRate = lambda; lowerPair = { home: i, away: j, homeRate: true }; }
    if (mu > maximumRate) { maximumRate = mu; lowerPair = { home: i, away: j, homeRate: false }; }
    if (product > maximumProduct) { maximumProduct = product; upperPair = { home: i, away: j }; }
  }
  const lower = Math.max(-RHO_BOUND, -1 / maximumRate), upper = Math.min(RHO_BOUND, 1 / maximumProduct);
  const weight = (1 + Math.tanh(raw)) / 2;
  const rho = (1 - weight) * lower + weight * upper;
  validateRho(rho);
  if (!(rho > lower && rho < upper)) throw new RangeError("Rho transformation reached a score-validity boundary.");
  return { rho, rawDerivative: (upper - lower) / 2 * (1 - Math.tanh(raw) ** 2),
    lowerDerivative: lower > -RHO_BOUND ? (1 - weight) * -lower : 0,
    upperDerivative: upper < RHO_BOUND ? -weight * upper : 0,
    lowerPair, upperPair };
}

/** N−1 free attacks; final attack derived, never post-fit recentered. */
export function decodeParameters(teams: readonly string[], point: readonly number[]): DixonColesParameters {
  const count = teams.length;
  if (count < 2 || point.length !== 2 * count + 1 || point.some((value) => !Number.isFinite(value))) throw new RangeError("Invalid Dixon–Coles parameter vector.");
  if (teams.some((team, i) => !team.trim() || (i > 0 && lexical(teams[i - 1], team) >= 0))) throw new RangeError("Teams must be unique and lexically ordered.");
  const finalAttack = -point.slice(0, count - 1).reduce((sum, attack) => sum + attack, 0);
  const ratings = teams.map((team, i) => ({ team, attack: i === count - 1 ? finalAttack : point[i], defenceWeakness: point[count - 1 + i] }));
  const homeAdvantage = point[2 * count - 1];
  return { teams: ratings, homeAdvantage, rho: correlationTransform(ratings, homeAdvantage, point[2 * count]).rho };
}

function logFactorial(goals: number): number {
  let sum = 0;
  for (let i = 2; i <= goals; i++) sum += Math.log(i);
  return sum;
}

/** Prepare immutable, canonical observations once per fit; likelihood uses full score support. */
export function prepareLikelihood(history: readonly PlayedMatch[]) {
  validatePlayedMatches(history);
  if (!history.length) throw new RangeError("Dixon–Coles fitting requires completed prior matches.");
  const teams = [...new Set(history.flatMap((match) => [match.homeTeam, match.awayTeam]))].sort(lexical);
  const indexes = new Map(teams.map((team, index) => [team, index]));
  const rows = [...history].sort((a, b) => kickoffTimestamp(a.kickoffAt) - kickoffTimestamp(b.kickoffAt) || lexical(a.id, b.id))
    .map((match) => ({ home: indexes.get(match.homeTeam)!, away: indexes.get(match.awayTeam)!, x: match.homeGoals, y: match.awayGoals,
      factorial: logFactorial(match.homeGoals) + logFactorial(match.awayGoals) }));

  function evaluate(point: readonly number[]) {
    const parameters = decodeParameters(teams, point);
    const count = teams.length;
    const attackGradient = Array<number>(count).fill(0), defenceGradient = Array<number>(count).fill(0);
    let homeGradient = 0, rhoGradient = 0, negativeLogLikelihood = 0;
    for (const row of rows) {
      const home = parameters.teams[row.home], away = parameters.teams[row.away];
      const etaHome = parameters.homeAdvantage + home.attack + away.defenceWeakness;
      const etaAway = away.attack + home.defenceWeakness;
      const lambda = Math.exp(etaHome), mu = Math.exp(etaAway), rho = parameters.rho;
      const tau = lowScoreTau(row.x, row.y, lambda, mu, rho);
      if (tau <= 0) throw new RangeError("Observed Dixon–Coles likelihood contribution must be positive.");
      const logProbability = Math.log(tau) - lambda + row.x * etaHome - mu + row.y * etaAway - row.factorial;
      if (!Number.isFinite(logProbability) || Math.exp(logProbability) <= 0) throw new RangeError("Non-finite or numerically non-positive likelihood contribution.");
      negativeLogLikelihood -= logProbability;
      let tauHome = 0, tauAway = 0, tauRho = 0;
      if (row.x === 0 && row.y === 0) { tauHome = tauAway = -lambda * mu * rho; tauRho = -lambda * mu; }
      else if (row.x === 0 && row.y === 1) { tauHome = lambda * rho; tauRho = lambda; }
      else if (row.x === 1 && row.y === 0) { tauAway = mu * rho; tauRho = mu; }
      else if (row.x === 1 && row.y === 1) { tauRho = -1; }
      const gHome = lambda - row.x - tauHome / tau, gAway = mu - row.y - tauAway / tau;
      attackGradient[row.home] += gHome; attackGradient[row.away] += gAway;
      defenceGradient[row.away] += gHome; defenceGradient[row.home] += gAway;
      homeGradient += gHome; rhoGradient -= tauRho / tau;
    }
    const correlation = correlationTransform(parameters.teams, parameters.homeAdvantage, point[2 * count]);
    const lowerEffect = rhoGradient * correlation.lowerDerivative, upperEffect = rhoGradient * correlation.upperDerivative;
    const lower = correlation.lowerPair, upper = correlation.upperPair;
    if (lower.homeRate) { attackGradient[lower.home] += lowerEffect; defenceGradient[lower.away] += lowerEffect; homeGradient += lowerEffect; }
    else { attackGradient[lower.away] += lowerEffect; defenceGradient[lower.home] += lowerEffect; }
    attackGradient[upper.home] += upperEffect; attackGradient[upper.away] += upperEffect;
    defenceGradient[upper.home] += upperEffect; defenceGradient[upper.away] += upperEffect; homeGradient += upperEffect;
    const gradient = [
      ...attackGradient.slice(0, count - 1).map((value) => value - attackGradient[count - 1]),
      ...defenceGradient, homeGradient, rhoGradient * correlation.rawDerivative,
    ].map((value) => value / rows.length);
    if (!Number.isFinite(negativeLogLikelihood) || gradient.some((value) => !Number.isFinite(value))) throw new RangeError("Invalid likelihood or analytic gradient.");
    return { value: negativeLogLikelihood / rows.length, gradient, negativeLogLikelihood, parameters };
  }
  return { teams, trainingMatchCount: rows.length, evaluate };
}
