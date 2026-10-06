import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eplSeasons } from "../../data/epl-seasons";
import { EPL_SEASON_IDS, generateHistoricalDataset, parseOpenFootballSeason, validateHistoricalSeason } from "./openfootball";

const sourceRoot = new URL("../../../data/external/openfootball/", import.meta.url);
const sources = EPL_SEASON_IDS.map((id) => ({ id, text: readFileSync(new URL(`${id}-premierleague.txt`, sourceRoot), "utf8") }));
const snippet = (body: string, id = "2021-22") => `= English Premier League ${id.replace("-", "/")}\n${body}`;

describe("vendored OpenFootball ingestion", () => {
  it("parses all five complete seasons with 380 results, 20 teams, and 19 appearances per venue", () => {
    for (const source of sources) {
      const matches = parseOpenFootballSeason(source.text, source.id);
      expect(matches, source.id).toHaveLength(380);
      const teams = new Set(matches.flatMap((match) => [match.homeTeam, match.awayTeam]));
      expect(teams.size, source.id).toBe(20);
      for (const team of teams) {
        expect(matches.filter((match) => match.homeTeam === team), `${source.id}: ${team} home`).toHaveLength(19);
        expect(matches.filter((match) => match.awayTeam === team), `${source.id}: ${team} away`).toHaveLength(19);
      }
      expect(() => validateHistoricalSeason({ id: source.id, league: "EPL", matches })).not.toThrow();
      expect(matches).toEqual(eplSeasons.find((season) => season.id === source.id)!.matches);
    }
  });

  it("extracts full-time scores from both supported layouts, ignoring different half-time scores", () => {
    const matches = parseOpenFootballSeason(snippet(`Fri Aug 13\n  20:00 Arsenal FC 4-2 (1-0) Chelsea FC\nSat Aug 14\n  Liverpool FC v Everton FC 3-1 (0-1)`), "2021-22");
    expect(matches.map(({ homeTeam, awayTeam, homeGoals, awayGoals }) => ({ homeTeam, awayTeam, homeGoals, awayGoals }))).toEqual([
      { homeTeam: "Arsenal FC", awayTeam: "Chelsea FC", homeGoals: 4, awayGoals: 2 },
      { homeTeam: "Liverpool FC", awayTeam: "Everton FC", homeGoals: 3, awayGoals: 1 },
    ]);
  });

  it("resolves years across the season boundary and assigns one noon ordering key per calendar date", () => {
    const matches = parseOpenFootballSeason(snippet(`Sat Aug 14 2021\n  Arsenal FC 1-0 Chelsea FC\n  17:30 Liverpool FC 2-0 Everton FC\nSun Jan 2\n  Chelsea FC 1-1 Arsenal FC\nSun May 22 2022\n  Everton FC 0-2 Liverpool FC`), "2021-22");
    expect(matches.map((match) => match.kickoffAt)).toEqual([
      "2021-08-14T12:00:00Z", "2021-08-14T12:00:00Z", "2022-01-02T12:00:00Z", "2022-05-22T12:00:00Z",
    ]);
    expect(matches.every((match, i) => i === 0 || match.kickoffAt >= matches[i - 1].kickoffAt)).toBe(true);
  });

  it("ignores comments, matchday metadata, and multi-line scorer details including nested penalty markers", () => {
    const source = snippet(`# Match metadata\n▪ Matchday 1\nFri Aug 13\n  Arsenal FC 4-2 (1-0) Chelsea FC\n                  (Player One 37'(p), 49';\n                   Player Two 64', 76')\n# Another comment\n  Liverpool FC 0-0 Everton FC\n= Arsenal FC\n  1 Player One (ENG) GK 2021-`);
    expect(parseOpenFootballSeason(source, "2021-22")).toHaveLength(2);
  });

  it("fails explicitly on malformed apparent match rows or missing results with line context", () => {
    for (const row of [
      "15:00 Arsenal FC v Chelsea FC ???", "Arsenal FC v Chelsea FC", "15:00 Arsenal FC 2:X Chelsea FC",
      "Arsenal FC -1-0 Chelsea FC", "Arsenal FC 1-0", "Arsenal FC 9007199254740992-0 Chelsea FC",
      "Arsenal FC v Chelsea FC 2-1 unexpected-text",
    ]) {
      expect(() => parseOpenFootballSeason(snippet(`Fri Aug 13\n  ${row}`), "2021-22")).toThrow(/source line 3/);
    }
    expect(() => parseOpenFootballSeason(snippet(`Fri Aug 13\n  Arsenal FC 1-0 Chelsea FC\n (Player 3'\n  Liverpool FC 2-0 Everton FC`), "2021-22")).toThrow(/Apparent match row/);
  });

  it("rejects duplicate normalized IDs rather than hiding duplicate source matches", () => {
    expect(() => parseOpenFootballSeason(snippet(`Fri Aug 13\n  Arsenal FC 1-0 Chelsea FC\n  Arsenal FC 2-0 Chelsea FC`), "2021-22")).toThrow(/Duplicate normalized match ID/);
    const season = eplSeasons[0];
    expect(() => validateHistoricalSeason({ ...season, matches: [season.matches[0], { ...season.matches[1], id: season.matches[0].id }] })).toThrow(/Duplicate normalized match ID/);
  });

  it("rejects invalid dates, wrong-season headers/years, unclosed details, and current-season input", () => {
    for (const date of ["Fri Feb 30", "Fri Foo 13", "Fri Aug 13 2022"]) {
      expect(() => parseOpenFootballSeason(snippet(`${date}\n  Arsenal FC 1-0 Chelsea FC`), "2021-22")).toThrow(RangeError);
    }
    expect(() => parseOpenFootballSeason(snippet("Fri Aug 13\n  Arsenal FC 1-0 Chelsea FC", "2022-23"), "2021-22")).toThrow(/header/);
    expect(() => parseOpenFootballSeason(snippet("Fri Aug 13\n (Player 3'"), "2021-22")).toThrow(/Unclosed/);
    expect(() => parseOpenFootballSeason("", "2026-27")).toThrow(/Unsupported completed/);
  });

  it("rejects partial seasons, duplicate home/away fixtures, self-matches, invalid scores, and dates outside the season", () => {
    const season = eplSeasons[0];
    expect(() => validateHistoricalSeason({ ...season, matches: season.matches.slice(1) })).toThrow(/380/);
    const withFirst = (patch: Partial<typeof season.matches[number]>) => ({ ...season, matches: [{ ...season.matches[0], ...patch }, ...season.matches.slice(1)] });
    expect(() => validateHistoricalSeason(withFirst({ homeTeam: season.matches[0].awayTeam }))).toThrow(/self-match/);
    expect(() => validateHistoricalSeason(withFirst({ kickoffAt: "2022-08-13T12:00:00Z" }))).toThrow(/does not belong/);
    expect(() => validateHistoricalSeason(withFirst({ kickoffAt: "2021-08-13T15:00:00Z" }))).toThrow(/noon UTC/);
    expect(() => validateHistoricalSeason(withFirst({ id: "epl-2026-27-wrong" }))).toThrow(/does not belong/);
    for (const homeGoals of [-1, 1.5, NaN, Infinity]) {
      expect(() => validateHistoricalSeason(withFirst({ homeGoals }))).toThrow(/final score/);
    }
    const duplicate = { ...season.matches[0], id: "epl-2021-22-duplicate-fixture", kickoffAt: "2021-08-14T12:00:00Z" };
    expect(() => validateHistoricalSeason({ ...season, matches: [season.matches[0], duplicate, ...season.matches.slice(2)] })).toThrow(/Duplicate home\/away fixture/);
  });

  it("regenerates the committed artifact byte-for-byte, independent of source ordering, without mutating inputs", () => {
    const input = Object.freeze(sources.map((source) => Object.freeze({ ...source })));
    const before = sources.map((source) => ({ ...source }));
    const output = generateHistoricalDataset(input);
    expect(output).toBe(readFileSync(new URL("../../data/generated/epl-seasons.json", import.meta.url), "utf8"));
    expect(generateHistoricalDataset([...input].reverse())).toBe(output);
    expect(input).toEqual(before);
    expect(() => generateHistoricalDataset(input.slice(1))).toThrow(/exactly the five/);
  });
});
