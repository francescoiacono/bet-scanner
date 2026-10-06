import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { externalEplSeasons, externalEplProvenance } from "../../data/epl-external-seasons";
import { eplProvenance, eplSeasons } from "../../data/epl-seasons";
import { EXTERNAL_EPL_SEASON_IDS, generateHistoricalDataset, parseOpenFootballSeason, validateHistoricalSeason } from "./openfootball";

const root = new URL("../../../data/external/openfootball/", import.meta.url);
const sources = EXTERNAL_EPL_SEASON_IDS.map((id) => ({ id, text: readFileSync(new URL(`${id}-premierleague.txt`, root), "utf8") }));

describe("pinned external historical Premier League validation", () => {
  it("retains exact source hashes at the existing snapshot and never mixes dataset seasons", () => {
    expect(externalEplProvenance.commit).toBe("b17e8f01707d83d2ce1790c14d4a5eeb35987825");
    expect(externalEplProvenance.commit).toBe(eplProvenance.commit);
    for (const manifest of [eplProvenance, externalEplProvenance]) for (const file of manifest.files) {
      expect(createHash("sha256").update(readFileSync(new URL(file.localFile, root))).digest("hex")).toBe(file.sha256);
    }
    expect(externalEplSeasons.map((season) => season.id)).toEqual([...EXTERNAL_EPL_SEASON_IDS]);
    expect(externalEplSeasons.every((season) => !eplSeasons.some((other) => other.id === season.id))).toBe(true);
  });

  it("parses all five complete older seasons with every directed fixture and venue appearance intact", () => {
    for (const source of sources) {
      const matches = parseOpenFootballSeason(source.text, source.id);
      expect(matches).toHaveLength(380);
      const teams = new Set(matches.flatMap((match) => [match.homeTeam, match.awayTeam]));
      expect(teams.size).toBe(20);
      for (const team of teams) {
        expect(matches.filter((match) => match.homeTeam === team)).toHaveLength(19);
        expect(matches.filter((match) => match.awayTeam === team)).toHaveLength(19);
      }
      expect(() => validateHistoricalSeason({ id: source.id, league: "EPL", matches })).not.toThrow();
      expect(matches).toEqual(externalEplSeasons.find((season) => season.id === source.id)!.matches);
    }
  });

  it("regenerates the external artifact byte-for-byte, enforces explicit datasets, and rejects partial data", () => {
    const input = Object.freeze(sources.map((source) => Object.freeze({ ...source })));
    const output = generateHistoricalDataset(input, "EXTERNAL_VALIDATION");
    expect(output).toBe(readFileSync(new URL("../../data/generated/epl-external-seasons.json", import.meta.url), "utf8"));
    expect(generateHistoricalDataset([...input].reverse(), "EXTERNAL_VALIDATION")).toBe(output);
    expect(() => generateHistoricalDataset(input)).toThrow(/five/);
    expect(() => generateHistoricalDataset(input.slice(1), "EXTERNAL_VALIDATION")).toThrow(/five/);
    expect(() => validateHistoricalSeason({ ...externalEplSeasons[0], matches: externalEplSeasons[0].matches.slice(1) })).toThrow(/380/);
  });
});
