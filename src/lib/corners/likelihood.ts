import { CORNER_FIT_CONFIGURATION, CORNER_NB_VERSION, CORNER_POISSON_VERSION, lexical } from "./config";
import { validateCornerMatches } from "./data";
import { negativeBinomialLogPMF, poissonLogPMF, validateAlpha } from "./distributions";
import type { CornerModelVersion, CornerParameters, PlayedCornerMatch } from "./types";

export function decodeCornerParameters(teams: readonly string[], point: readonly number[], model: CornerModelVersion): CornerParameters {
  const n = teams.length;
  if (model !== CORNER_POISSON_VERSION && model !== CORNER_NB_VERSION) throw new RangeError("Unknown corner model.");
  const expectedLength = 2 * n + (model === CORNER_NB_VERSION ? 1 : 0);
  if (n < 2 || point.length !== expectedLength || point.some((v) => !Number.isFinite(v))) throw new RangeError("Invalid corner parameter vector.");
  if (teams.some((team, i) => !team.trim() || (i > 0 && lexical(teams[i - 1], team) >= 0))) throw new RangeError("Corner teams must be unique and lexically ordered.");
  const finalAttack = -point.slice(0, n - 1).reduce((sum, v) => sum + v, 0);
  const alpha = model === CORNER_NB_VERSION ? Math.exp(point[2 * n]) : null;
  if (alpha !== null) validateAlpha(alpha);
  return { teams: teams.map((team, i) => ({ team, cornerAttack: i === n - 1 ? finalAttack : point[i], cornerDefenceWeakness: point[n - 1 + i] })),
    homeCornerAdvantage: point[2 * n - 1], alpha };
}
export function expectedCornerMeans(fixture: Pick<PlayedCornerMatch, "homeTeam" | "awayTeam">, parameters: CornerParameters) {
  if (!fixture.homeTeam.trim() || !fixture.awayTeam.trim() || fixture.homeTeam === fixture.awayTeam) throw new RangeError("Invalid corner fixture.");
  if (!Number.isFinite(parameters.homeCornerAdvantage) || parameters.teams.some((t) => !t.team.trim() || !Number.isFinite(t.cornerAttack) || !Number.isFinite(t.cornerDefenceWeakness))
    || new Set(parameters.teams.map((t) => t.team)).size !== parameters.teams.length) throw new RangeError("Invalid fitted corner ratings.");
  const home = parameters.teams.find((t) => t.team === fixture.homeTeam), away = parameters.teams.find((t) => t.team === fixture.awayTeam);
  if (!home || !away) throw new RangeError("Missing fitted corner team.");
  const expectedHomeCorners = Math.exp(parameters.homeCornerAdvantage + home.cornerAttack + away.cornerDefenceWeakness);
  const expectedAwayCorners = Math.exp(away.cornerAttack + home.cornerDefenceWeakness);
  const expectedTotalCorners = expectedHomeCorners + expectedAwayCorners;
  if (![expectedHomeCorners, expectedAwayCorners, expectedTotalCorners].every((v) => Number.isFinite(v) && v > 0)) throw new RangeError("Invalid expected corner means.");
  return { expectedHomeCorners, expectedAwayCorners, expectedTotalCorners };
}
export function prepareCornerLikelihood(history: readonly PlayedCornerMatch[], model: CornerModelVersion) {
  validateCornerMatches(history);
  if (!history.length) throw new RangeError("Corner fitting requires completed earlier matches.");
  const teams = [...new Set(history.flatMap((m) => [m.homeTeam, m.awayTeam]))].sort(lexical);
  const indexes = new Map(teams.map((team, i) => [team, i]));
  const rows = [...history].sort((a, b) => lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id)).map((match) => ({
    home: indexes.get(match.homeTeam)!, away: indexes.get(match.awayTeam)!, hc: match.homeCorners, ac: match.awayCorners,
  }));
  const n = teams.length;
  function objective(point: readonly number[], withMeanGradient: boolean) {
    const parameters = decodeCornerParameters(teams, point, model);
    const attack = Array<number>(n).fill(0), defence = Array<number>(n).fill(0); let homeGradient = 0, total = 0;
    for (const row of rows) {
      const home = parameters.teams[row.home], away = parameters.teams[row.away];
      const lambda = Math.exp(parameters.homeCornerAdvantage + home.cornerAttack + away.cornerDefenceWeakness);
      const mu = Math.exp(away.cornerAttack + home.cornerDefenceWeakness);
      if (![lambda, mu].every((v) => Number.isFinite(v) && v > 0)) throw new RangeError("Invalid likelihood corner means.");
      const logHome = parameters.alpha === null ? poissonLogPMF(row.hc, lambda) : negativeBinomialLogPMF(row.hc, lambda, parameters.alpha);
      const logAway = parameters.alpha === null ? poissonLogPMF(row.ac, mu) : negativeBinomialLogPMF(row.ac, mu, parameters.alpha);
      if (![logHome, logAway].every((v) => Number.isFinite(v) && v <= 1e-10 && Math.exp(v) > 0)) throw new RangeError("Invalid/non-positive corner likelihood contribution.");
      total -= logHome + logAway;
      if (withMeanGradient) {
        const gh = (lambda - row.hc) / (1 + (parameters.alpha ?? 0) * lambda);
        const ga = (mu - row.ac) / (1 + (parameters.alpha ?? 0) * mu);
        attack[row.home] += gh; attack[row.away] += ga;
        defence[row.away] += gh; defence[row.home] += ga; homeGradient += gh;
      }
    }
    return { value: total / rows.length, negativeLogLikelihood: total, parameters,
      gradient: [...attack.slice(0, n - 1).map((v) => v - attack[n - 1]), ...defence, homeGradient].map((v) => v / rows.length) };
  }
  function evaluate(point: readonly number[]) {
    const result = objective(point, true);
    if (model === CORNER_NB_VERSION) {
      const epsilon = CORNER_FIT_CONFIGURATION.rawAlphaDifferenceEpsilon;
      const lower = [...point], upper = [...point]; lower[2 * n] -= epsilon; upper[2 * n] += epsilon;
      result.gradient.push((objective(upper, false).value - objective(lower, false).value) / (2 * epsilon));
    }
    if (!Number.isFinite(result.value) || result.gradient.some((v) => !Number.isFinite(v))) throw new RangeError("Invalid corner objective/gradient.");
    return result;
  }
  return { teams, trainingMatchCount: rows.length, evaluate };
}
