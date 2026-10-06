import { kickoffTimestamp } from "../backtest/history";
import { parseCsv } from "../corners/data";
import { normalizePriceTeam, resolvePriceTeam } from "./aliases";
import { OLDER_PRICE_SEASONS, PRICE_COLUMNS, RECENT_PRICE_SEASONS, lexical } from "./config";
import { validateDecimalOdds } from "./market";
import type { FixtureIdentity, HistoricalThreeWayPrice, ParsedPriceRow } from "./types";

const selectedSeasons: readonly string[] = [...OLDER_PRICE_SEASONS, ...RECENT_PRICE_SEASONS];
function validateSeason(id: string) { if (!selectedSeasons.includes(id)) throw new RangeError(`Unselected price season: ${id}.`); }
export function normalizePriceDate(value: string, seasonId: string): string {
  validateSeason(seasonId);
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) throw new RangeError(`Invalid price source date: ${value}.`);
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0), month = Number(match[2]), day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError(`Invalid calendar date: ${value}.`);
  const start = Number(seasonId.slice(0, 4));
  if (date.getTime() < Date.UTC(start, 6, 1) || date.getTime() >= Date.UTC(start + 1, 6, 1)) throw new RangeError(`Price date ${value} outside ${seasonId}.`);
  return date.toISOString().replace(".000Z", "Z");
}
export function validatePriceDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(date)) throw new RangeError("Price alignment requires normalized noon-UTC date keys.");
  kickoffTimestamp(date);
}
function parseOdd(value: string): number {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new RangeError("Missing or malformed numeric Bet365 price.");
  const odd = Number(value); validateDecimalOdds(odd); return odd;
}
export class PriceSourceError extends RangeError {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) { super(`Invalid required historical prices/identity:\n${issues.join("\n")}`); this.name = "PriceSourceError"; this.issues = issues; }
}
/** Six-column projection only; no score/result, closing price or other stats. */
export function parseHistoricalPrices(source: string, seasonId: string): ParsedPriceRow[] {
  validateSeason(seasonId);
  const [header, ...rows] = parseCsv(source);
  if (!header || new Set(header).size !== header.length || PRICE_COLUMNS.some((key) => !header.includes(key))) throw new PriceSourceError([`${seasonId}: missing/duplicate required identity or B365H/B365D/B365A column.`]);
  const indexes = PRICE_COLUMNS.map((key) => header.indexOf(key));
  const issues: string[] = [], records: ParsedPriceRow[] = [];
  for (const [i, row] of rows.entries()) {
    const context = `${seasonId} CSV record ${i + 2}`;
    if (row.length !== header.length) { issues.push(`${context}: malformed field count.`); continue; }
    const [date, home, away, hc, dc, ac] = indexes.map((index) => row[index]);
    const prices: number[] = []; let valid = true;
    for (const [index, value] of [hc, dc, ac].entries()) {
      try { prices.push(parseOdd(value)); }
      catch (error) { issues.push(`${context} (${date}, ${home} vs ${away}), ${PRICE_COLUMNS[index + 3]}: ${(error as Error).message}`); valid = false; }
    }
    try {
      const sourceDate = normalizePriceDate(date, seasonId), homeTeam = normalizePriceTeam(home), awayTeam = normalizePriceTeam(away);
      if (homeTeam === awayTeam) throw new RangeError("Self price fixture.");
      if (valid) records.push({ seasonId, sourceDate, homeTeam, awayTeam, homeOdds: prices[0], drawOdds: prices[1], awayOdds: prices[2] });
    } catch (error) { issues.push(`${context}: ${(error as Error).message}`); }
  }
  if (issues.length) throw new PriceSourceError(issues);
  const fixtures = new Set(records.map((r) => JSON.stringify([r.homeTeam, r.awayTeam])));
  if (fixtures.size !== records.length) throw new PriceSourceError([`${seasonId}: duplicate directed price fixture.`]);
  return records.sort((a, b) => lexical(a.sourceDate, b.sourceDate) || lexical(a.homeTeam, b.homeTeam) || lexical(a.awayTeam, b.awayTeam));
}
export function validatePricedSeason(rows: readonly ParsedPriceRow[], seasonId: string): void {
  validateSeason(seasonId);
  const counts = new Map<string, { home: number; away: number }>(), fixtures = new Set<string>();
  for (const row of rows) {
    if (row.seasonId !== seasonId) throw new RangeError("Price seasons must not mix.");
    validatePriceDate(row.sourceDate);
    normalizePriceDate(`${row.sourceDate.slice(8, 10)}/${row.sourceDate.slice(5, 7)}/${row.sourceDate.slice(0, 4)}`, seasonId);
    const home = normalizePriceTeam(row.homeTeam), away = normalizePriceTeam(row.awayTeam);
    if (home !== row.homeTeam || away !== row.awayTeam || home === away) throw new RangeError("Invalid normalized price teams.");
    [row.homeOdds, row.drawOdds, row.awayOdds].forEach(validateDecimalOdds);
    const key = JSON.stringify([home, away]); if (fixtures.has(key)) throw new RangeError("Duplicate price fixture."); fixtures.add(key);
    for (const [team, venue] of [[home, "home"], [away, "away"]] as const) { const count = counts.get(team) ?? { home: 0, away: 0 }; count[venue]++; counts.set(team, count); }
  }
  if (rows.length !== 380 || counts.size !== 20 || [...counts.values()].some((r) => r.home !== 19 || r.away !== 19)) throw new RangeError(`${seasonId} requires 380 complete priced matches, 20 teams and 19 home / 19 away fixtures per team.`);
}
const joinKey = (row: Pick<FixtureIdentity, "seasonId" | "sourceDate" | "homeTeam" | "awayTeam">) => JSON.stringify([row.seasonId, row.sourceDate, row.homeTeam, row.awayTeam]);
export function alignHistoricalPrices(rows: readonly ParsedPriceRow[], fixtures: readonly FixtureIdentity[], seasonId: string): HistoricalThreeWayPrice[] {
  validateSeason(seasonId);
  const canonical = new Map<string, FixtureIdentity>(), ids = new Set<string>(), teams = new Set<string>();
  for (const fixture of fixtures) {
    if (!fixture.fixtureId.trim() || fixture.seasonId !== seasonId || ids.has(fixture.fixtureId)) throw new RangeError("Duplicate/invalid canonical fixture identity.");
    validatePriceDate(fixture.sourceDate); ids.add(fixture.fixtureId);
    const key = joinKey(fixture); if (canonical.has(key)) throw new RangeError("Ambiguous canonical fixture match."); canonical.set(key, fixture);
    teams.add(fixture.homeTeam); teams.add(fixture.awayTeam);
  }
  const used = new Set<string>();
  const aligned = rows.map((row): HistoricalThreeWayPrice => {
    if (row.seasonId !== seasonId) throw new RangeError("Price alignment cannot mix seasons.");
    validatePriceDate(row.sourceDate); [row.homeOdds, row.drawOdds, row.awayOdds].forEach(validateDecimalOdds);
    const homeTeam = resolvePriceTeam(row.homeTeam, teams), awayTeam = resolvePriceTeam(row.awayTeam, teams);
    const match = canonical.get(joinKey({ ...row, homeTeam, awayTeam }));
    if (!match) throw new RangeError(`Unmatched price fixture: ${seasonId} ${row.sourceDate} ${homeTeam} vs ${awayTeam}.`);
    if (used.has(match.fixtureId)) throw new RangeError(`Duplicate price match: ${match.fixtureId}.`);
    used.add(match.fixtureId);
    return { fixtureId: match.fixtureId, seasonId, sourceDate: match.sourceDate, homeOdds: row.homeOdds, drawOdds: row.drawOdds, awayOdds: row.awayOdds };
  });
  if (used.size !== canonical.size) throw new RangeError(`${seasonId} price coverage is ${used.size}/${canonical.size}; one-to-one full fixture coverage required.`);
  return aligned.sort((a, b) => lexical(a.sourceDate, b.sourceDate) || lexical(a.fixtureId, b.fixtureId));
}
