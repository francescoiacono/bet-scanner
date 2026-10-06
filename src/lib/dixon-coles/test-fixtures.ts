import type { PlayedMatch } from "../backtest/types";

/** Small deterministic balanced schedule, with stronger scoring evidence for Alpha. */
export function syntheticHistory(rounds = 6): readonly PlayedMatch[] {
  const teams = ["Alpha", "Bravo", "Charlie", "Delta"];
  const matches: PlayedMatch[] = [];
  for (let round = 0; round < rounds; round++) for (let home = 0; home < teams.length; home++) for (let away = 0; away < teams.length; away++) if (home !== away) {
    matches.push({ id: `synthetic-${round}-${home}-${away}`, homeTeam: teams[home], awayTeam: teams[away],
      kickoffAt: `2020-01-${String(round + 1).padStart(2, "0")}T12:00:00Z`,
      homeGoals: (round + home + away) % 3 + Number(home === 0) * 2,
      awayGoals: (round + home * 2 + away) % 3 + Number(away === 0) * 2 });
  }
  return matches;
}
