import type { PlayedCornerMatch } from "./types";

/** Fictional scoring evidence, never a substitute for real source data. */
export function syntheticCornerHistory(rounds = 5): PlayedCornerMatch[] {
  const teams = ["Alpha", "Beta", "Gamma", "Delta"], attack = [9, 5, 4, 2], concede = [0, 2, 3, 4];
  const multipliers = [0.3, 1.7, 0.5, 1.5, 1];
  const matches: PlayedCornerMatch[] = [];
  for (let round = 0; round < rounds; round++) for (let h = 0; h < 4; h++) for (let a = 0; a < 4; a++) if (h !== a) {
    matches.push({ id: `synthetic/${round}/${teams[h]}/${teams[a]}`, kickoffAt: `2021-08-${String(round + 1).padStart(2, "0")}T12:00:00Z`,
      homeTeam: teams[h], awayTeam: teams[a], homeCorners: Math.round((attack[h] + concede[a] + 1) * multipliers[round % 5]),
      awayCorners: Math.round((attack[a] + concede[h]) * multipliers[round % 5]) });
  }
  return matches;
}
