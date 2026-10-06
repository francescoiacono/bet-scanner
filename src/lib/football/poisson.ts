import type { OutcomeProbabilities } from "./types";
import { validateExpectedGoals } from "./validation";

export const MAX_GOALS = 10;

/** e^-lambda * lambda^k / k!, evaluated in log space to avoid power overflow. */
export function poissonProbability(lambda: number, goals: number): number {
  validateExpectedGoals(lambda);
  if (!Number.isInteger(goals) || goals < 0 || goals > MAX_GOALS) {
    throw new RangeError(`Goal count must be an integer between 0 and ${MAX_GOALS}.`);
  }
  if (lambda === 0) return goals === 0 ? 1 : 0;
  let logFactorial = 0;
  for (let k = 1; k <= goals; k++) {
    logFactorial += Math.log(k);
  }
  return Math.exp(-lambda + goals * Math.log(lambda) - logFactorial);
}

/** Independent home/away Poisson scores, truncated to 0–10 and normalized. */
export function calculateMatchProbabilities(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
): OutcomeProbabilities {
  const homeGoals = Array.from({ length: MAX_GOALS + 1 }, (_, k) =>
    poissonProbability(expectedHomeGoals, k),
  );
  const awayGoals = Array.from({ length: MAX_GOALS + 1 }, (_, k) =>
    poissonProbability(expectedAwayGoals, k),
  );
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const scoreProbability = homeGoals[h] * awayGoals[a];
      if (h > a) home += scoreProbability;
      else if (h === a) draw += scoreProbability;
      else away += scoreProbability;
    }
  }

  const retainedMass = home + draw + away;
  if (!Number.isFinite(retainedMass) || retainedMass <= 0) {
    throw new RangeError("The 0–10 score grid retains no usable probability mass.");
  }
  return {
    homeProbability: home / retainedMass,
    drawProbability: draw / retainedMass,
    awayProbability: away / retainedMass,
  };
}
