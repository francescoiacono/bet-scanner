import { describe, expect, it } from "vitest";
import { bootstrapPairedAdvantages, buildDateClusters, resampleSeasonClusters } from "./bootstrap";
import type { PairedObservation } from "./types";

const observation = (id: string, seasonId: string, date: string, model: number, base: number, poisson = base): PairedObservation => ({
  id, seasonId, kickoffAt: `${date}T12:00:00Z`, brierScore: model, leagueBaseRateBrierScore: base, leaguePoissonBrierScore: poisson,
});
const data = [
  observation("a", "2021-22", "2021-08-01", 0.2, 0.4, 0.6),
  observation("b", "2021-22", "2021-08-01", 0.8, 1, 1.2),
  observation("c", "2021-22", "2021-08-02", 0.5, 0.4, 0.3),
  observation("d", "2022-23", "2022-08-01", 0.4, 0.5, 0.6),
];
const config = { samples: 300, seed: 202605, confidenceLevel: 0.95 };

describe("season-stratified paired date-cluster bootstrap", () => {
  it("is byte-for-byte deterministic, invariant to record order, and leaves frozen inputs/configuration intact", () => {
    const input = Object.freeze(data.map((record) => Object.freeze({ ...record })));
    const options = Object.freeze({ ...config });
    const before = JSON.stringify(input);
    const first = bootstrapPairedAdvantages(input, options);
    expect(JSON.stringify(bootstrapPairedAdvantages(input, options))).toBe(JSON.stringify(first));
    expect(bootstrapPairedAdvantages([...input].reverse(), options)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(options).toEqual(config);
  });

  it("returns exactly zero and a zero-width interval when paired scores are identical", () => {
    const equal = data.map((record) => ({ ...record, leagueBaseRateBrierScore: record.brierScore, leaguePoissonBrierScore: record.brierScore }));
    const result = bootstrapPairedAdvantages(equal, config);
    expect(result.vsLeagueBaseRate).toEqual({ observedMean: 0, lowerBound: 0, upperBound: 0 });
    expect(result.vsLeaguePoisson).toEqual(result.vsLeagueBaseRate);
  });

  it("keeps a strictly positive interval when the model is always better", () => {
    const better = data.map((record) => ({ ...record, leagueBaseRateBrierScore: record.brierScore + 0.1, leaguePoissonBrierScore: record.brierScore + 0.2 }));
    const result = bootstrapPairedAdvantages(better, config);
    expect(result.vsLeagueBaseRate.lowerBound).toBeGreaterThan(0);
    expect(result.vsLeaguePoisson.lowerBound).toBeGreaterThan(0);
  });

  it("preserves pairing despite differing absolute scores and shares draws across both comparisons", () => {
    const paired = data.map((record) => ({ ...record, leagueBaseRateBrierScore: record.brierScore + 0.25 }));
    const constant = bootstrapPairedAdvantages(paired, config).vsLeagueBaseRate;
    expect(constant.lowerBound).toBeCloseTo(0.25, 14);
    expect(constant.upperBound).toBeCloseTo(0.25, 14);
    const result = bootstrapPairedAdvantages(data, config);
    for (const field of ["observedMean", "lowerBound", "upperBound"] as const) {
      expect(result.vsLeaguePoisson[field]).toBeCloseTo(2 * result.vsLeagueBaseRate[field]!, 12);
    }
  });

  it("resamples whole source-date clusters and independently retains each season's cluster count", () => {
    const clusters = buildDateClusters([...data, { ...data[0], id: "late", kickoffAt: "2021-08-01T23:00:00-02:00" }]);
    expect(clusters[0].observations.map((record) => record.id)).toEqual(["a", "b", "late"]);
    const sample = resampleSeasonClusters([clusters.slice(0, 2), clusters.slice(2)], () => 0);
    expect(sample.map((cluster) => cluster.seasonId)).toEqual(["2021-22", "2021-22", "2022-23"]);
    expect(sample[0]).toBe(clusters[0]);
    expect(sample[1]).toBe(clusters[0]);
    expect(sample[2]).toBe(clusters[2]);
    expect(sample[0].observations).toHaveLength(3);
  });

  it("weights by matches rather than equally weighting different-size dates or seasons", () => {
    const result = bootstrapPairedAdvantages(data, config);
    expect(result.vsLeagueBaseRate.observedMean).toBeCloseTo((0.2 + 0.2 - 0.1 + 0.1) / 4, 12);
    expect(result.strata).toEqual([
      { seasonId: "2021-22", dateClusters: 2, evaluatedMatches: 3 },
      { seasonId: "2022-23", dateClusters: 1, evaluatedMatches: 1 },
    ]);
    const variableSizes = [
      observation("one", "s", "2021-08-01", 0.5, 0),
      ...["two", "three", "four"].map((id) => observation(id, "s", "2021-08-02", 0, 0.5)),
    ];
    const weighted = bootstrapPairedAdvantages(variableSizes, config).vsLeagueBaseRate;
    expect(weighted.observedMean).toBe(0.25);
    expect(weighted.lowerBound).toBe(-0.5);
    expect(weighted.upperBound).toBe(0.5);
  });

  it("returns finite ordered percentile bounds including the single-replicate case", () => {
    for (const samples of [1, 300]) {
      const result = bootstrapPairedAdvantages(data, { ...config, samples });
      for (const interval of [result.vsLeagueBaseRate, result.vsLeaguePoisson]) {
        expect(Number.isFinite(interval.lowerBound)).toBe(true);
        expect(Number.isFinite(interval.upperBound)).toBe(true);
        expect(interval.lowerBound!).toBeLessThanOrEqual(interval.upperBound!);
      }
    }
  });

  it("rejects invalid configurations, dates, duplicate identities, and unpaired invalid scores explicitly", () => {
    for (const samples of [0, -1, 1.5, NaN, Infinity]) expect(() => bootstrapPairedAdvantages(data, { samples })).toThrow(RangeError);
    for (const seed of [-1, 1.5, NaN, Infinity, 2 ** 32]) expect(() => bootstrapPairedAdvantages(data, { seed })).toThrow(RangeError);
    for (const confidenceLevel of [0, 1, -0.1, NaN, Infinity]) expect(() => bootstrapPairedAdvantages(data, { confidenceLevel })).toThrow(RangeError);
    expect(() => bootstrapPairedAdvantages([data[0], data[0]])).toThrow(RangeError);
    expect(() => bootstrapPairedAdvantages([{ ...data[0], kickoffAt: "2021-02-30T12:00:00Z" }])).toThrow(RangeError);
    expect(() => bootstrapPairedAdvantages([{ ...data[0], leaguePoissonBrierScore: NaN }])).toThrow(RangeError);
  });

  it("returns explicit unavailable diagnostics for empty data, retaining method/configuration", () => {
    const result = bootstrapPairedAdvantages([]);
    expect(result.samples).toBe(5000);
    expect(result.seed).toBe(202605);
    expect(result.confidenceLevel).toBe(0.95);
    expect(result.evaluatedMatches).toBe(0);
    expect(result.strata).toEqual([]);
    expect(result.vsLeagueBaseRate).toEqual({ observedMean: null, lowerBound: null, upperBound: null });
    expect(result.vsLeaguePoisson).toEqual(result.vsLeagueBaseRate);
    expect(() => bootstrapPairedAdvantages([], { samples: 0 })).toThrow(RangeError);
  });
});
