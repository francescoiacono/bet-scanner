import { describe, expect, it } from "vitest";
import { buildDateClusters, resampleSeasonClusters } from "../diagnostics/bootstrap";
import { bootstrapMarketBrier, bootstrapPaperROI, historicalProfitabilityStatus, valueObservations } from "./bootstrap";
import { probabilitySummary, valueCohortSummary } from "./summary";
import { noBet, record } from "./test-helpers";

describe("paired Brier comparison", () => {
  it("uses the three-class sum, never divides by three", () => expect(record().marketFairBrier).toBe(0.375));
  it("positive advantage favours the model", () => { const r = record(); expect(r.modelBrierAdvantage).toBeCloseTo(r.marketFairBrier - r.modelBrier); expect(r.modelBrierAdvantage).toBeGreaterThan(0); expect(record({ actualOutcome: "AWAY" }).modelBrierAdvantage).toBeLessThan(0); });
  it("reuses paired Brier bootstrap with fixed configuration", () => { const b = bootstrapMarketBrier([record()]); expect(b.samples).toBe(5000); expect(b.seed).toBe(202608); expect(b.interval.lowerBound).toBe(record().modelBrierAdvantage); });
  it("requires separate cohorts", () => expect(() => valueCohortSummary([record({ seasonId: "2014-15", sourceDate: "2014-10-01T12:00:00Z" })], "RECENT")).toThrow());
  it("aggregates the same records by season", () => { const rows = [record(), record({ fixtureId: "b", actualOutcome: "AWAY" })], s = valueCohortSummary(rows, "RECENT"); expect(s.seasons[0].probability).toEqual(probabilitySummary(rows)); expect(s.probability.dixonColesBrier).toBeCloseTo((rows[0].modelBrier + rows[1].modelBrier) / 2); });
  it("is invariant to input ordering", () => { const rows = [record(), record({ fixtureId: "b", sourceDate: "2021-10-02T12:00:00Z", actualOutcome: "AWAY" })]; expect(valueCohortSummary(rows, "RECENT")).toEqual(valueCohortSummary([...rows].reverse(), "RECENT")); });
});
describe("original date-cluster ROI bootstrap", () => {
  const rows = () => [record(), noBet({ fixtureId: "no-bet" }), record({ fixtureId: "later", sourceDate: "2021-10-02T12:00:00Z", actualOutcome: "AWAY" })];
  it("same seed produces identical intervals", () => expect(bootstrapPaperROI(rows())).toEqual(bootstrapPaperROI(rows())));
  it("keeps bets and no-bets in original clusters", () => { const clusters = buildDateClusters(valueObservations(rows())); expect(clusters[0].observations.map((r) => r.id)).toEqual(["no-bet", "synthetic-a"]); expect(bootstrapPaperROI(rows()).evaluatedMatches).toBe(3); });
  it("same-date observations stay together through resampling", () => { const clusters = buildDateClusters(valueObservations(rows())), sample = resampleSeasonClusters([clusters], () => 0); expect(sample).toHaveLength(2); expect(sample.every((c) => c.observations.length === 2)).toBe(true); expect(sample[0]).toBe(sample[1]); });
  it("preserves each season's original cluster count", () => { const other = record({ fixtureId: "season-two", seasonId: "2022-23", sourceDate: "2022-10-01T12:00:00Z" }), b = bootstrapPaperROI([...rows(), other]); expect(b.strata).toEqual([{ seasonId: "2021-22", dateClusters: 2, evaluatedMatches: 3 }, { seasonId: "2022-23", dateClusters: 1, evaluatedMatches: 1 }]); const clusters = buildDateClusters(valueObservations([...rows(), other])); const strata = [clusters.filter((c) => c.seasonId === "2021-22"), clusters.filter((c) => c.seasonId === "2022-23")]; expect(resampleSeasonClusters(strata, () => 0).map((c) => c.seasonId)).toEqual(["2021-22", "2021-22", "2022-23"]); });
  it("all profitable settlements yield a positive interval", () => { const b = bootstrapPaperROI([record(), record({ fixtureId: "b", sourceDate: "2021-10-02T12:00:00Z" })]); expect(b.interval.lowerBound).toBe(1); expect(b.interval.upperBound).toBe(1); });
  it("all losing settlements yield a negative interval", () => { const b = bootstrapPaperROI([record({ actualOutcome: "AWAY" })]); expect(b.interval.lowerBound).toBe(-1); expect(b.interval.upperBound).toBe(-1); });
  it("all zero-stake replicates are explicitly unavailable", () => { const b = bootstrapPaperROI([noBet()]); expect(b.interval).toEqual({ observedMean: null, lowerBound: null, upperBound: null, zeroStakeReplicates: 5000, availability: "UNAVAILABLE_ZERO_STAKES" }); });
  it("any undefined replicate makes CI unavailable without dropping it", () => { const b = bootstrapPaperROI([record(), noBet({ fixtureId: "later", sourceDate: "2021-10-02T12:00:00Z" })]); expect(b.interval.observedMean).toBe(1); expect(b.interval.zeroStakeReplicates).toBeGreaterThan(0); expect(b.interval.lowerBound).toBeNull(); });
  it("empty observations are unavailable without NaN", () => { expect(bootstrapPaperROI([]).interval.availability).toBe("UNAVAILABLE_NO_MATCHES"); expect(bootstrapPaperROI([]).interval.observedMean).toBeNull(); });
  it("does not mutate inputs", () => { const source = rows(), before = structuredClone(source); bootstrapPaperROI(source); expect(source).toEqual(before); });
  it("retains losing replicates and produces order-invariant intervals", () => { const source = rows(), b = bootstrapPaperROI(source); expect(b.interval.lowerBound).toBe(-1); expect(b.interval.upperBound).toBe(1); expect(b).toEqual(bootstrapPaperROI([...source].reverse())); });
});
describe("predeclared research profitability status", () => {
  it("requires both lower bounds strictly positive", () => expect(historicalProfitabilityStatus({ lowerBound: 0.01, upperBound: 0.1 }, { lowerBound: 0.02, upperBound: 0.2 })).toBe("HISTORICAL_PAPER_EDGE_SUPPORTED"));
  it("requires both upper bounds strictly negative", () => expect(historicalProfitabilityStatus({ lowerBound: -0.2, upperBound: -0.01 }, { lowerBound: -0.1, upperBound: -0.02 })).toBe("HISTORICAL_PAPER_EDGE_NEGATIVE"));
  it("mixed intervals are inconclusive", () => expect(historicalProfitabilityStatus({ lowerBound: 0.1, upperBound: 0.2 }, { lowerBound: -0.2, upperBound: -0.1 })).toBe("INCONCLUSIVE"));
  it.each([{ lowerBound: 0, upperBound: 0.1 }, { lowerBound: -0.1, upperBound: 0 }, { lowerBound: null, upperBound: null }])("zero/unavailable boundaries are inconclusive: %j", (interval) => expect(historicalProfitabilityStatus(interval, interval)).toBe("INCONCLUSIVE"));
});
