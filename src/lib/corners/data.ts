import { kickoffTimestamp } from "../backtest/history";
import { DEVELOPMENT_CORNER_SEASONS, EXTERNAL_CORNER_SEASONS, REQUIRED_CORNER_COLUMNS, lexical } from "./config";
import type { CornerDataset, CornerSeason, PlayedCornerMatch } from "./types";

export function selectedCornerSeasons(dataset: CornerDataset): readonly string[] {
  if (dataset === "DEVELOPMENT") return DEVELOPMENT_CORNER_SEASONS;
  if (dataset === "EXTERNAL_VALIDATION") return EXTERNAL_CORNER_SEASONS;
  throw new RangeError("Unknown corner dataset.");
}
function validateSeasonId(id: string) {
  if (!([...DEVELOPMENT_CORNER_SEASONS, ...EXTERNAL_CORNER_SEASONS] as readonly string[]).includes(id)) throw new RangeError(`Unselected corner season: ${id}.`);
}
export function normalizeCornerTeam(team: string): string {
  const normalized = team.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) throw new RangeError("Corner team names must not be blank.");
  return normalized;
}
/** Small strict CSV state machine: quoted commas/newlines and escaped quotes. */
export function parseCsv(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  const text = source.replace(/^\uFEFF/, "");
  const finishField = () => { row.push(field); field = ""; closed = false; };
  // Football-Data may end with an entirely empty delimiter row. Any row
  // containing content remains mandatory and must parse as a complete match.
  const finishRow = () => { finishField(); if (row.some((value) => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw new RangeError("Malformed CSV quoting.");
      quoted = true;
    } else if (c === ",") finishField();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; finishRow(); }
    else { if (closed) throw new RangeError("Unexpected content after a quoted CSV field."); field += c; }
  }
  if (quoted) throw new RangeError("Unclosed quoted CSV field.");
  if (field || row.length || closed) finishRow();
  return rows;
}
function sourceDate(value: string, seasonId: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) throw new RangeError(`Invalid source date for ${seasonId}: ${value}.`);
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError(`Invalid calendar date: ${value}.`);
  const start = Number(seasonId.slice(0, 4));
  if (date.getTime() < Date.UTC(start, 6, 1) || date.getTime() >= Date.UTC(start + 1, 6, 1)) throw new RangeError(`Source date ${value} is outside declared season ${seasonId}.`);
  return date.toISOString().replace(".000Z", "Z");
}
function cornerCount(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new RangeError("HC and AC must be complete non-negative integer counts.");
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new RangeError("Unsafe corner count.");
  return count;
}
export function validateCornerMatches(matches: readonly PlayedCornerMatch[]): void {
  const ids = new Set<string>();
  for (const match of matches) {
    if (!match.id.trim() || ids.has(match.id)) throw new RangeError("Corner match IDs must be non-empty and unique.");
    ids.add(match.id);
    if (!/^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(match.kickoffAt)) throw new RangeError("Corner source dates require normalized noon-UTC keys.");
    kickoffTimestamp(match.kickoffAt);
    if (normalizeCornerTeam(match.homeTeam) !== match.homeTeam || normalizeCornerTeam(match.awayTeam) !== match.awayTeam || match.homeTeam === match.awayTeam) throw new RangeError("Invalid normalized corner fixture teams.");
    if ([match.homeCorners, match.awayCorners, match.homeCorners + match.awayCorners].some((v) => !Number.isSafeInteger(v) || v < 0)) throw new RangeError("Corner counts and totals must be non-negative safe integers.");
  }
}
export function parseCornerCsv(source: string, seasonId: string): PlayedCornerMatch[] {
  validateSeasonId(seasonId);
  const [header, ...rows] = parseCsv(source);
  if (!header || new Set(header).size !== header.length || REQUIRED_CORNER_COLUMNS.some((key) => !header.includes(key))) throw new RangeError(`Missing or duplicate required CSV columns for ${seasonId}.`);
  const indexes = REQUIRED_CORNER_COLUMNS.map((key) => header.indexOf(key));
  const matches = rows.map((row, i): PlayedCornerMatch => {
    if (row.length !== header.length) throw new RangeError(`Malformed apparent match row ${i + 2} in ${seasonId}: wrong field count.`);
    try {
      // Only these five fields enter the domain. Odds/statistics are never copied.
      const [date, home, away, hc, ac] = indexes.map((index) => row[index]);
      const kickoffAt = sourceDate(date, seasonId), homeTeam = normalizeCornerTeam(home), awayTeam = normalizeCornerTeam(away);
      return { id: `epl-corners/${seasonId}/${kickoffAt.slice(0, 10)}/${encodeURIComponent(homeTeam)}/${encodeURIComponent(awayTeam)}`,
        kickoffAt, homeTeam, awayTeam, homeCorners: cornerCount(hc), awayCorners: cornerCount(ac) };
    } catch (error) { throw new RangeError(`${seasonId} CSV row ${i + 2}: ${(error as Error).message}`); }
  });
  validateCornerMatches(matches);
  const fixtures = new Set(matches.map((match) => JSON.stringify([match.homeTeam, match.awayTeam])));
  if (fixtures.size !== matches.length) throw new RangeError(`Duplicate directed corner fixture in ${seasonId}.`);
  return matches.sort((a, b) => lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id));
}
export function validateCornerSeason(season: CornerSeason): void {
  validateSeasonId(season.id); validateCornerMatches(season.matches);
  const teams = new Map<string, { home: number; away: number }>(), fixtures = new Set<string>();
  for (const match of season.matches) {
    const fixture = JSON.stringify([match.homeTeam, match.awayTeam]);
    if (fixtures.has(fixture)) throw new RangeError(`Duplicate corner fixture in ${season.id}.`);
    fixtures.add(fixture);
    for (const [team, venue] of [[match.homeTeam, "home"], [match.awayTeam, "away"]] as const) {
      const counts = teams.get(team) ?? { home: 0, away: 0 }; counts[venue]++; teams.set(team, counts);
    }
    sourceDate(`${match.kickoffAt.slice(8, 10)}/${match.kickoffAt.slice(5, 7)}/${match.kickoffAt.slice(0, 4)}`, season.id);
    const expectedId = `epl-corners/${season.id}/${match.kickoffAt.slice(0, 10)}/${encodeURIComponent(match.homeTeam)}/${encodeURIComponent(match.awayTeam)}`;
    if (match.id !== expectedId) throw new RangeError(`Non-canonical corner match ID in ${season.id}.`);
  }
  if (season.matches.length !== 380 || teams.size !== 20 || [...teams.values()].some((team) => team.home !== 19 || team.away !== 19)) throw new RangeError(`${season.id} requires 380 matches, 20 teams and 19 home / 19 away fixtures per team.`);
}
