import type { HistoricalSeason, PlayedMatch } from "../backtest/types";

export const EPL_SEASON_IDS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_HEADER = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Za-z]{3}) (\d{1,2})(?: (\d{4}))?$/;

function seasonStartYear(id: string): number {
  if (!(EPL_SEASON_IDS as readonly string[]).includes(id)) {
    throw new RangeError(`Unsupported completed EPL season: ${id}. Expected 2021-22 through 2025-26.`);
  }
  return Number(id.slice(0, 4));
}

function normalizeDate(monthName: string, dayText: string, explicitYear: string | undefined, seasonId: string): string {
  const startYear = seasonStartYear(seasonId);
  const month = MONTHS.indexOf(monthName) + 1;
  if (!month) throw new RangeError(`Unknown month: ${monthName}.`);
  // Resolve missing years from the season, never from row order or today's date.
  const year = month >= 7 ? startYear : startYear + 1;
  if (explicitYear !== undefined && Number(explicitYear) !== year) {
    throw new RangeError(`Date year does not belong to season ${seasonId}.`);
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${dayText.padStart(2, "0")}`;
  const timestamp = `${date}T12:00:00Z`;
  if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp.replace("Z", ".000Z")) {
    throw new RangeError(`Invalid calendar date: ${date}.`);
  }
  return timestamp;
}

function normalizedTeam(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L}\p{N} &'’.-]*[\p{L}\p{N}]$/u.test(name)) {
    throw new RangeError(`Invalid team identity in match row: ${value}.`);
  }
  return name;
}

function slug(team: string): string {
  return team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Parse the two result layouts used by the five vendored Football.TXT files. */
export function parseOpenFootballSeason(source: string, seasonId: string): PlayedMatch[] {
  seasonStartYear(seasonId);
  const matches: PlayedMatch[] = [];
  let kickoffAt: string | undefined;
  let detailDepth = 0;
  let foundSeasonHeader = false;
  let inResultsSection = false;
  const ids = new Set<string>();

  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      if (detailDepth > 0) {
        if (/^\d{1,2}:\d{2}\s|\s+v\s+|\d+\s*-\s*\d+/.test(line)) {
          throw new RangeError("Apparent match row inside an unclosed scorer detail.");
        }
        detailDepth += [...line].filter((c) => c === "(").length - [...line].filter((c) => c === ")").length;
        if (detailDepth < 0) throw new RangeError("Unbalanced scorer detail.");
        continue;
      }
      if (line.startsWith("=")) {
        const header = line.match(/Premier League (\d{4})\/(\d{2})$/);
        if (header) {
          if (`${header[1]}-${header[2]}` !== seasonId) throw new RangeError("Source header does not match the requested season.");
          foundSeasonHeader = true;
        }
        inResultsSection = Boolean(header);
        continue;
      }
      // Other Football.TXT sections may contain squads/player rosters. They
      // are metadata, not Premier League match results.
      if (!inResultsSection) continue;
      if (line.startsWith("▪")) continue;
      const date = line.match(DATE_HEADER);
      if (date) {
        kickoffAt = normalizeDate(date[2], date[3], date[4], seasonId);
        continue;
      }
      if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(line)) throw new RangeError("Malformed date header.");
      if (line.startsWith("(")) {
        detailDepth = [...line].filter((c) => c === "(").length - [...line].filter((c) => c === ")").length;
        if (detailDepth < 0) throw new RangeError("Unbalanced scorer detail.");
        continue;
      }

      const clock = line.match(/^(\d{1,2}):(\d{2})\s+/);
      if (clock && (Number(clock[1]) > 23 || Number(clock[2]) > 59)) throw new RangeError("Invalid time prefix.");
      const row = clock ? line.slice(clock[0].length) : line;
      // Full time is outside parentheses. Half-time scores never enter the model.
      const versus = row.match(/^(.+?)\s+v\s+(.+?)\s+(\d+)-(\d+)(?:\s+\(\d+-\d+\))?$/);
      const centered = /\s+v\s+/.test(row) ? null : row.match(/^(.+?)\s+(\d+)-(\d+)(?:\s+\(\d+-\d+\))?\s+(.+)$/);
      if (!versus && !centered) {
        // Unknown indented content under a date is unsafe to discard: it may be
        // a missing/malformed result. Only recognized metadata/details are ignored.
        if (clock || /\s+v\s+|\d+\s*[-:]\s*\d+/.test(line) || (kickoffAt && /^\s/.test(raw))) {
          throw new RangeError("Unrecognized apparent match row; refusing to drop it.");
        }
        continue;
      }
      if (!kickoffAt) throw new RangeError("Match row has no calendar date.");
      const homeTeam = normalizedTeam((versus ?? centered)![1]);
      const awayTeam = normalizedTeam(versus ? versus[2] : centered![4]);
      const homeGoals = Number(versus ? versus[3] : centered![2]);
      const awayGoals = Number(versus ? versus[4] : centered![3]);
      if (![homeGoals, awayGoals].every((goals) => Number.isSafeInteger(goals) && goals >= 0)) throw new RangeError("Invalid full-time goals.");
      if (homeTeam === awayTeam) throw new RangeError("A team cannot play itself.");
      const id = `epl-${seasonId}-${kickoffAt.slice(0, 10)}-${slug(homeTeam)}-vs-${slug(awayTeam)}`;
      if (ids.has(id)) throw new RangeError(`Duplicate normalized match ID: ${id}.`);
      ids.add(id);
      matches.push({ id, kickoffAt, homeTeam, awayTeam, homeGoals, awayGoals });
    } catch (error) {
      throw new RangeError(`${seasonId}, source line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (detailDepth !== 0) throw new RangeError(`${seasonId}: Unclosed scorer detail.`);
  if (!foundSeasonHeader) throw new RangeError(`${seasonId}: Missing matching Premier League season header.`);
  return matches.sort((a, b) => a.kickoffAt < b.kickoffAt ? -1 : a.kickoffAt > b.kickoffAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Strict, complete-season integrity boundary; no partial evaluation is allowed. */
export function validateHistoricalSeason(season: HistoricalSeason): void {
  const startYear = seasonStartYear(season.id);
  if (season.league !== "EPL") throw new RangeError("Historical season league must be EPL.");
  const ids = new Set<string>();
  const pairs = new Set<string>();
  const teams = new Map<string, { home: number; away: number }>();
  for (const match of season.matches) {
    if (typeof match.id !== "string" || !match.id.startsWith(`epl-${season.id}-`)) throw new RangeError("Match ID does not belong to its season.");
    if (ids.has(match.id)) throw new RangeError(`Duplicate normalized match ID: ${match.id}.`);
    ids.add(match.id);
    if (typeof match.kickoffAt !== "string" || !/^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(match.kickoffAt) ||
      !Number.isFinite(Date.parse(match.kickoffAt)) || new Date(match.kickoffAt).toISOString() !== match.kickoffAt.replace("Z", ".000Z")) {
      throw new RangeError("Historical timestamp must be a valid date at normalized noon UTC.");
    }
    if (match.kickoffAt < `${startYear}-07-01T12:00:00Z` || match.kickoffAt >= `${startYear + 1}-07-01T12:00:00Z`) {
      throw new RangeError(`Match date does not belong to season ${season.id}.`);
    }
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (typeof team !== "string" || !team.trim() || team !== team.trim()) throw new RangeError("Invalid historical team identity.");
      if (!teams.has(team)) teams.set(team, { home: 0, away: 0 });
    }
    if (match.homeTeam === match.awayTeam) throw new RangeError("Historical self-match.");
    if (![match.homeGoals, match.awayGoals].every((goals) => Number.isSafeInteger(goals) && goals >= 0)) throw new RangeError("Missing or invalid final score.");
    const pair = JSON.stringify([match.homeTeam, match.awayTeam]);
    if (pairs.has(pair)) throw new RangeError("Duplicate home/away fixture within a season.");
    pairs.add(pair);
    teams.get(match.homeTeam)!.home++;
    teams.get(match.awayTeam)!.away++;
  }
  if (season.matches.length !== 380) throw new RangeError(`${season.id}: Expected 380 completed matches, got ${season.matches.length}.`);
  if (teams.size !== 20) throw new RangeError(`${season.id}: Expected 20 teams, got ${teams.size}.`);
  for (const [team, counts] of teams) {
    if (counts.home !== 19 || counts.away !== 19) throw new RangeError(`${season.id}: ${team} must have 19 home and 19 away matches (38 total).`);
  }
}

export interface SeasonSource {
  readonly id: string;
  readonly text: string;
}

/** Stable key/record ordering and one trailing newline; no timestamps of generation. */
export function generateHistoricalDataset(sources: readonly SeasonSource[]): string {
  const ids = new Set<string>();
  const seasons = [...sources].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((source): HistoricalSeason => {
    if (ids.has(source.id)) throw new RangeError(`Duplicate season ID: ${source.id}.`);
    ids.add(source.id);
    const season: HistoricalSeason = { id: source.id, league: "EPL", matches: parseOpenFootballSeason(source.text, source.id) };
    validateHistoricalSeason(season);
    return season;
  });
  if (seasons.length !== EPL_SEASON_IDS.length || EPL_SEASON_IDS.some((id) => !ids.has(id))) {
    throw new RangeError("Generation requires exactly the five selected completed EPL seasons.");
  }
  return JSON.stringify(seasons, null, 2) + "\n";
}
