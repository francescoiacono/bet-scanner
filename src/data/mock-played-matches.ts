import type { PlayedMatch } from "../lib/backtest/types";

// Entirely fictional dates, fixtures, and final scores. No historical prices.
// Reverse venue pairs in consecutive rounds: every team has 2 home/2 away
// appearances after round 4, and 4 home/4 away after round 8.
const rounds = [
  { kickoffAt: "2025-01-04T15:00:00Z", matches: [
    ["Aldermere FC", "Bracken Athletic", 2, 0],
    ["Westhaven Rovers", "Eastford United", 1, 2],
    ["Stonebridge City", "Kingswell FC", 3, 1],
    ["Northwick Town", "Fairmont Athletic", 1, 1],
    ["Oakfield United", "Rivergate FC", 2, 0],
    ["Silverbrook Town", "Dunmere Rovers", 0, 1],
  ] },
  { kickoffAt: "2025-01-11T15:00:00Z", matches: [
    ["Bracken Athletic", "Aldermere FC", 1, 1],
    ["Eastford United", "Westhaven Rovers", 2, 1],
    ["Kingswell FC", "Stonebridge City", 1, 2],
    ["Fairmont Athletic", "Northwick Town", 0, 1],
    ["Rivergate FC", "Oakfield United", 1, 3],
    ["Dunmere Rovers", "Silverbrook Town", 2, 0],
  ] },
  { kickoffAt: "2025-01-18T15:00:00Z", matches: [
    ["Aldermere FC", "Eastford United", 1, 2],
    ["Westhaven Rovers", "Kingswell FC", 2, 0],
    ["Stonebridge City", "Fairmont Athletic", 1, 1],
    ["Northwick Town", "Rivergate FC", 2, 1],
    ["Oakfield United", "Dunmere Rovers", 3, 1],
    ["Silverbrook Town", "Bracken Athletic", 1, 0],
  ] },
  { kickoffAt: "2025-01-25T15:00:00Z", matches: [
    ["Eastford United", "Aldermere FC", 1, 2],
    ["Kingswell FC", "Westhaven Rovers", 2, 1],
    ["Fairmont Athletic", "Stonebridge City", 1, 0],
    ["Rivergate FC", "Northwick Town", 1, 2],
    ["Dunmere Rovers", "Oakfield United", 2, 2],
    ["Bracken Athletic", "Silverbrook Town", 0, 1],
  ] },
  { kickoffAt: "2025-02-01T15:00:00Z", matches: [
    ["Aldermere FC", "Kingswell FC", 2, 1],
    ["Westhaven Rovers", "Fairmont Athletic", 1, 1],
    ["Stonebridge City", "Rivergate FC", 3, 0],
    ["Northwick Town", "Dunmere Rovers", 0, 2],
    ["Oakfield United", "Bracken Athletic", 2, 0],
    ["Silverbrook Town", "Eastford United", 1, 2],
  ] },
  { kickoffAt: "2025-02-08T15:00:00Z", matches: [
    ["Kingswell FC", "Aldermere FC", 1, 1],
    ["Fairmont Athletic", "Westhaven Rovers", 2, 1],
    ["Rivergate FC", "Stonebridge City", 0, 2],
    ["Dunmere Rovers", "Northwick Town", 1, 1],
    ["Bracken Athletic", "Oakfield United", 1, 2],
    ["Eastford United", "Silverbrook Town", 3, 0],
  ] },
  { kickoffAt: "2025-02-15T15:00:00Z", matches: [
    ["Aldermere FC", "Fairmont Athletic", 1, 0],
    ["Westhaven Rovers", "Rivergate FC", 2, 1],
    ["Stonebridge City", "Dunmere Rovers", 2, 2],
    ["Northwick Town", "Bracken Athletic", 1, 0],
    ["Oakfield United", "Eastford United", 1, 2],
    ["Silverbrook Town", "Kingswell FC", 2, 1],
  ] },
  { kickoffAt: "2025-02-22T15:00:00Z", matches: [
    ["Fairmont Athletic", "Aldermere FC", 0, 1],
    ["Rivergate FC", "Westhaven Rovers", 1, 1],
    ["Dunmere Rovers", "Stonebridge City", 2, 1],
    ["Bracken Athletic", "Northwick Town", 1, 2],
    ["Eastford United", "Oakfield United", 1, 1],
    ["Kingswell FC", "Silverbrook Town", 0, 2],
  ] },
] as const;

export const mockPlayedMatches: readonly PlayedMatch[] = rounds.flatMap((round, roundIndex) =>
  round.matches.map(([homeTeam, awayTeam, homeGoals, awayGoals], matchIndex) => ({
    id: `played-${roundIndex + 1}-${matchIndex + 1}`,
    kickoffAt: round.kickoffAt,
    homeTeam, awayTeam, homeGoals, awayGoals,
  })),
);
