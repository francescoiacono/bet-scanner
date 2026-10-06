import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRICE_TEAM_ALIASES, resolvePriceTeam } from "./aliases";
import { alignHistoricalPrices, normalizePriceDate, parseHistoricalPrices, validatePricedSeason } from "./data";
import type { FixtureIdentity, ParsedPriceRow } from "./types";

const csv = readFileSync(new URL("./fixtures/prices-synthetic.csv", import.meta.url), "utf8");
const rows = () => parseHistoricalPrices(csv, "2021-22");
const fixtures: FixtureIdentity[] = [
  { fixtureId: "a", seasonId: "2021-22", sourceDate: "2021-10-01T12:00:00Z", homeTeam: "Arsenal FC", awayTeam: "Manchester United FC" },
  { fixtureId: "b", seasonId: "2021-22", sourceDate: "2021-10-02T12:00:00Z", homeTeam: "Manchester United FC", awayTeam: "Arsenal FC" },
];
const replaceColumn = (name: string, value: string) => { const lines = csv.trim().split("\n"), index = lines[0].split(",").indexOf(name); return [lines[0], ...lines.slice(1).map((line) => { const cells = line.split(","); cells[index] = value; return cells.join(","); })].join("\n"); };
describe("six-field price parser and privacy", () => {
  it("extracts only six fields plus season metadata", () => expect(Object.keys(rows()[0]).sort()).toEqual(["seasonId", "sourceDate", "homeTeam", "awayTeam", "homeOdds", "drawOdds", "awayOdds"].sort()));
  it("ignores all C-suffixed odds", () => { for (const col of ["B365CH", "B365CD", "B365CA"]) expect(parseHistoricalPrices(replaceColumn(col, "bad closing price"), "2021-22")).toEqual(rows()); });
  it("ignores other bookmakers and market aggregates", () => { for (const col of ["PSH", "AvgD", "MaxA"]) expect(parseHistoricalPrices(replaceColumn(col, "bad other price"), "2021-22")).toEqual(rows()); });
  it("ignores goals and result fields", () => { for (const col of ["FTHG", "FTAG", "FTR"]) expect(parseHistoricalPrices(replaceColumn(col, "irrelevant result"), "2021-22")).toEqual(rows()); });
  it("ignores corners, cards and referee", () => { for (const col of ["HC", "AC", "HY", "AY", "Referee"]) expect(parseHistoricalPrices(replaceColumn(col, "irrelevant stats"), "2021-22")).toEqual(rows()); });
  it.each(["", "0", "1", "-2", "NaN", "Infinity", "2abc", "0x10"])("fails on malformed required odds %s with season/row/field", (value) => expect(() => parseHistoricalPrices(replaceColumn("B365D", value), "2021-22")).toThrow(/2021-22 CSV record 2.*B365D/));
  it("fails on a missing price field", () => expect(() => parseHistoricalPrices(csv.replace("B365A,", "Unused,"), "2021-22")).toThrow(/missing\/duplicate/));
  it("changing FTR cannot change source prices", () => expect(parseHistoricalPrices(replaceColumn("FTR", "D"), "2021-22")).toEqual(rows()));
  it("changing B365C cannot change primary prices", () => expect(parseHistoricalPrices(replaceColumn("B365CH", "999"), "2021-22")).toEqual(rows()));
  it("does not mutate source text", () => { const before = csv; rows(); expect(csv).toBe(before); });
  it("fails on malformed field counts", () => expect(() => parseHistoricalPrices(csv.replace("2,4,4,", "2,4,"), "2021-22")).toThrow(/field count/));
  it("supports both supplied date formats", () => expect(normalizePriceDate("01/10/21", "2021-22")).toBe(normalizePriceDate("01/10/2021", "2021-22")));
  it("rejects impossible dates and out-of-season rows", () => { expect(() => normalizePriceDate("31/02/22", "2021-22")).toThrow(); expect(() => normalizePriceDate("01/10/20", "2021-22")).toThrow(); });
  it("enforces 380/20/19/19 season integrity", () => { const complete: ParsedPriceRow[] = []; for (let h = 0; h < 20; h++) for (let a = 0; a < 20; a++) if (a !== h) complete.push({ ...rows()[0], homeTeam: `Synthetic ${h}`, awayTeam: `Synthetic ${a}` }); expect(() => validatePricedSeason(complete, "2021-22")).not.toThrow(); expect(() => validatePricedSeason(complete.slice(1), "2021-22")).toThrow(/380/); });
});
describe("explicit fixture alignment", () => {
  it("matches only season/date/home/away", () => { const result = alignHistoricalPrices(rows(), fixtures, "2021-22"); expect(result.map((r) => r.fixtureId)).toEqual(["a", "b"]); expect(result[0].homeOdds).toBe(2); });
  it("uses explicit season-canonical aliases", () => { expect(PRICE_TEAM_ALIASES["Man United"]).toContain("Manchester United FC"); expect(resolvePriceTeam(" Man   United ", new Set(["Manchester United FC"]))).toBe("Manchester United FC"); });
  it("fails on unknown aliases including prototype keys", () => { expect(() => resolvePriceTeam("Man Utd", new Set(["Manchester United FC"]))).toThrow(/Unknown/); expect(() => resolvePriceTeam("constructor", new Set())).toThrow(/Unknown/); });
  it("fails on ambiguous aliases", () => expect(() => resolvePriceTeam("Arsenal", new Set(["Arsenal", "Arsenal FC"]))).toThrow(/ambiguous/));
  it("fails on ambiguous canonical matches", () => expect(() => alignHistoricalPrices(rows(), [...fixtures, { ...fixtures[0], fixtureId: "extra" }], "2021-22")).toThrow(/Ambiguous/));
  it("fails on duplicate priced fixtures", () => expect(() => alignHistoricalPrices([rows()[0], rows()[0]], fixtures, "2021-22")).toThrow(/Duplicate/));
  it("is invariant to both input orders", () => expect(alignHistoricalPrices(rows().reverse(), [...fixtures].reverse(), "2021-22")).toEqual(alignHistoricalPrices(rows(), fixtures, "2021-22")));
  it("fails on unmatched dates, seasons and missing coverage", () => { expect(() => alignHistoricalPrices([{ ...rows()[0], sourceDate: "2021-10-03T12:00:00Z" }, rows()[1]], fixtures, "2021-22")).toThrow(/Unmatched/); expect(() => alignHistoricalPrices(rows().slice(1), fixtures, "2021-22")).toThrow(/coverage/); expect(() => alignHistoricalPrices(rows(), fixtures, "2014-15")).toThrow(); });
  it("does not mutate fixture identities", () => { const before = structuredClone(fixtures); alignHistoricalPrices(rows(), fixtures, "2021-22"); expect(fixtures).toEqual(before); });
});
