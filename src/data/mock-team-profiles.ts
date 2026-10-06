import type { TeamProfile } from "../lib/football/types";

// Fictional historical totals. Every team has 20 home and 20 away matches.
// Scored/conceded totals balance across venues for this mock league.
export const mockTeamProfiles: readonly TeamProfile[] = [
  { team: "Aldermere FC", homeMatches: 20, homeGoalsFor: 36, homeGoalsAgainst: 18,
    awayMatches: 20, awayGoalsFor: 26, awayGoalsAgainst: 24 },
  { team: "Bracken Athletic", homeMatches: 20, homeGoalsFor: 24, homeGoalsAgainst: 30,
    awayMatches: 20, awayGoalsFor: 18, awayGoalsAgainst: 36 },
  { team: "Westhaven Rovers", homeMatches: 20, homeGoalsFor: 30, homeGoalsAgainst: 24,
    awayMatches: 20, awayGoalsFor: 24, awayGoalsAgainst: 28 },
  { team: "Eastford United", homeMatches: 20, homeGoalsFor: 28, homeGoalsAgainst: 22,
    awayMatches: 20, awayGoalsFor: 32, awayGoalsAgainst: 34 },
  { team: "Stonebridge City", homeMatches: 20, homeGoalsFor: 34, homeGoalsAgainst: 20,
    awayMatches: 20, awayGoalsFor: 22, awayGoalsAgainst: 26 },
  { team: "Kingswell FC", homeMatches: 20, homeGoalsFor: 26, homeGoalsAgainst: 28,
    awayMatches: 20, awayGoalsFor: 20, awayGoalsAgainst: 34 },
  { team: "Northwick Town", homeMatches: 20, homeGoalsFor: 32, homeGoalsAgainst: 26,
    awayMatches: 20, awayGoalsFor: 24, awayGoalsAgainst: 32 },
  { team: "Fairmont Athletic", homeMatches: 20, homeGoalsFor: 30, homeGoalsAgainst: 24,
    awayMatches: 20, awayGoalsFor: 28, awayGoalsAgainst: 30 },
  { team: "Oakfield United", homeMatches: 20, homeGoalsFor: 38, homeGoalsAgainst: 16,
    awayMatches: 20, awayGoalsFor: 28, awayGoalsAgainst: 22 },
  { team: "Rivergate FC", homeMatches: 20, homeGoalsFor: 22, homeGoalsAgainst: 34,
    awayMatches: 20, awayGoalsFor: 16, awayGoalsAgainst: 38 },
  { team: "Silverbrook Town", homeMatches: 20, homeGoalsFor: 28, homeGoalsAgainst: 24,
    awayMatches: 20, awayGoalsFor: 22, awayGoalsAgainst: 28 },
  { team: "Dunmere Rovers", homeMatches: 20, homeGoalsFor: 32, homeGoalsAgainst: 22,
    awayMatches: 20, awayGoalsFor: 28, awayGoalsAgainst: 28 },
];
