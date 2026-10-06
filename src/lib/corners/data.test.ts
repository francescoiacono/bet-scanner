import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCornerCsv, parseCsv, validateCornerMatches, validateCornerSeason } from "./data";
import { syntheticCornerHistory } from "./test-fixtures";

const source = readFileSync(new URL("./fixtures/synthetic.csv", import.meta.url), "utf8");
describe("strict corner-only CSV ingestion", () => {
  it("parses the five required fields, quoted commas, normalized teams and noon UTC", () => {
    const records = parseCornerCsv(source, "2021-22");
    expect(records[0]).toMatchObject({ kickoffAt: "2021-08-01T12:00:00Z", homeTeam: "Alpha, Town", awayTeam: "Beta", homeCorners: 7, awayCorners: 3 });
    expect(records[1].kickoffAt).toBe("2021-08-02T12:00:00Z");
    expect(Object.keys(records[0])).toEqual(["id", "kickoffAt", "homeTeam", "awayTeam", "homeCorners", "awayCorners"]);
    expect(parseCsv('A,B\r\n"quoted ""name""","two\nlines"\r\n')).toEqual([["A", "B"], ['quoted "name"', "two\nlines"]]);
  });
  it("ignores irrelevant fields and odds even when their values and column order change", () => {
    const changed = source.replace("1.25,99,Example", "0,invalid,Unrelated").replace('8.00,0,"Example, Name"', '9999,invalid,"Unrelated, Person"');
    expect(parseCornerCsv(changed, "2021-22")).toEqual(parseCornerCsv(source, "2021-22"));
    const reordered = 'Odds,AC,AwayTeam,Date,HC,HomeTeam\n1,3,Beta,01/08/2021,7,"  Alpha, Town  "\n2,6,"Alpha, Town",02/08/21,4,Beta\n';
    expect(parseCornerCsv(reordered, "2021-22")).toEqual(parseCornerCsv(source, "2021-22"));
    expect(source).toBe(readFileSync(new URL("./fixtures/synthetic.csv", import.meta.url), "utf8"));
  });
  it("rejects missing columns, missing/negative/fractional/unsafe counts and self fixtures", () => {
    expect(() => parseCornerCsv(source.replace("HC,", "Other,"), "2021-22")).toThrow(/columns/);
    for (const value of ["", "-1", "1.2", "NaN", "9007199254740992"]) {
      expect(() => parseCornerCsv(source.replace("7,3,", `${value},3,`), "2021-22")).toThrow(RangeError);
    }
    expect(() => parseCornerCsv("Date,HomeTeam,AwayTeam,HC,AC\n01/08/21,Same,Same,1,2", "2021-22")).toThrow(/teams/);
  });
  it("rejects invalid/out-of-season dates and unselected seasons", () => {
    for (const value of ["31/02/2021", "01/13/21", "01/08/2025", "2021-08-01", ""]) {
      expect(() => parseCornerCsv(source.replace("01/08/2021", value), "2021-22")).toThrow(/date|season/);
    }
    expect(() => parseCornerCsv(source, "2020-21")).toThrow(/Unselected/);
  });
  it("rejects duplicate fixtures/IDs and malformed apparent match rows instead of dropping them", () => {
    expect(() => parseCornerCsv(source + source.split("\n")[1] + "\n", "2021-22")).toThrow(/unique/);
    expect(() => parseCornerCsv(source + source.split("\n")[1].replace("01/08/2021", "03/08/2021") + "\n", "2021-22")).toThrow(/Duplicate/);
    for (const suffix of ["03/08/21,Beta", ",Beta,Alpha,1,2,0,0,0", '"unclosed']) expect(() => parseCornerCsv(source + suffix, "2021-22")).toThrow(RangeError);
    expect(() => parseCsv('A,B\n"valid"unexpected,1')).toThrow(/quoted/);
    // Legitimate wholly blank trailing records have no apparent match content.
    expect(parseCornerCsv(source + ",,,,,,,\n\n", "2021-22")).toEqual(parseCornerCsv(source, "2021-22"));
  });
  it("requires full-season integrity and validates arbitrary research-domain inputs", () => {
    const records = parseCornerCsv(source, "2021-22");
    expect(() => validateCornerSeason({ id: "2021-22", matches: records })).toThrow(/380/);
    const match = syntheticCornerHistory()[0];
    for (const change of [{ homeCorners: -1 }, { awayCorners: 1.5 }, { id: "" }, { kickoffAt: "2021-02-30T12:00:00Z" }, { kickoffAt: "2021-08-01T15:00:00Z" }]) {
      expect(() => validateCornerMatches([{ ...match, ...change }])).toThrow(RangeError);
    }
  });
  it("accepts only complete 20-team double round robins and checks canonical IDs/season dates", () => {
    const teams = Array.from({ length: 20 }, (_, i) => `Synthetic ${String(i).padStart(2, "0")}`);
    const rows = teams.flatMap((home) => teams.filter((away) => home !== away).map((away) => `01/08/2021,${home},${away},4,5`));
    const matches = parseCornerCsv(`Date,HomeTeam,AwayTeam,HC,AC\n${rows.join("\n")}`, "2021-22");
    expect(() => validateCornerSeason({ id: "2021-22", matches })).not.toThrow();
    expect(() => validateCornerSeason({ id: "2021-22", matches: matches.slice(1) })).toThrow(/380/);
    expect(() => validateCornerSeason({ id: "2021-22", matches: matches.map((m, i) => i === 0 ? { ...m, id: "noncanonical" } : m) })).toThrow(/canonical/);
    expect(() => validateCornerSeason({ id: "2021-22", matches: matches.map((m, i) => i === 0 ? { ...m, kickoffAt: "2025-08-01T12:00:00Z" } : m) })).toThrow(/season/);
  });
});
