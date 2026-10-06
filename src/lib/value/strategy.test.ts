import { describe, expect, it } from "vitest";
import { evaluateFrozenPrices } from "./backtest";
import { selectPaperBet } from "./selection";
import { maximumDrawdown, settlePaperBet } from "./settlement";
import { paperStrategySummary } from "./summary";
import { noBet, prediction, price, record } from "./test-helpers";
import type { PaperSelectionInput } from "./types";

const input = (home: number, draw: number, away: number, homeOdds = 2, drawOdds = 2, awayOdds = 2): PaperSelectionInput => ({ modelProbabilities: { homeProbability: home, drawProbability: draw, awayProbability: away }, price: price({ homeOdds, drawOdds, awayOdds }) });
describe("fixed paper selection", () => {
  it("returns NO BET when no candidate qualifies", () => expect(selectPaperBet(input(0.5, 0.25, 0.25, 1.9, 3.8, 3.8))).toBeNull());
  it("includes exactly the 2% mathematical boundary", () => { expect(selectPaperBet(input(0.51, 0.3, 0.19))?.outcome).toBe("HOME"); expect(selectPaperBet(input(0.51, 0.3, 0.19))?.expectedROI).toBeCloseTo(0.02); });
  it("excludes immediately below 2%", () => expect(selectPaperBet(input(0.509999, 0.3, 0.190001))).toBeNull());
  it("chooses the highest expected ROI", () => expect(selectPaperBet(input(0.5, 0.3, 0.2, 2.1, 4, 7))?.outcome).toBe("AWAY"));
  it("breaks equal EV by fair market edge", () => expect(selectPaperBet(input(0.3, 0.6, 0.1, 4, 2, 2))?.outcome).toBe("DRAW"));
  it("breaks a complete three-way tie in favour of HOME", () => expect(selectPaperBet(input(0.4, 0.4, 0.2, 3, 3, 6))?.outcome).toBe("HOME"));
  it("breaks a DRAW/AWAY tie in favour of DRAW", () => expect(selectPaperBet(input(0.2, 0.4, 0.4, 1.1, 3, 3))?.outcome).toBe("DRAW"));
  it("returns at most one selection", () => { const choice = selectPaperBet(input(0.4, 0.4, 0.2, 3, 3, 6)); expect(choice).not.toBeNull(); expect(Array.isArray(choice)).toBe(false); });
  it("does not accept actual outcome fields", () => expect(() => selectPaperBet({ ...input(0.6, 0.3, 0.1), actualOutcome: "HOME" } as PaperSelectionInput)).toThrow(/exclude settlement/));
  it("changing actual result leaves selection unchanged", () => { expect(record({ actualOutcome: "HOME" }).selection).toEqual(record({ actualOutcome: "AWAY" }).selection); });
  it("changing offered odds can change selection", () => { expect(selectPaperBet(input(0.5, 0.3, 0.2, 2.2, 3, 4))?.outcome).toBe("HOME"); expect(selectPaperBet(input(0.5, 0.3, 0.2, 2.2, 3, 8))?.outcome).toBe("AWAY"); });
  it("is pure and deterministic", () => { const data = input(0.6, 0.3, 0.1), before = structuredClone(data); expect(selectPaperBet(data)).toEqual(selectPaperBet(data)); expect(data).toEqual(before); });
});
describe("flat unit settlement", () => {
  it.each(["HOME", "DRAW", "AWAY"] as const)("settles winning %s", (outcome) => { const selected = { ...record().selection!, outcome, decimalOdds: 3.5 }; expect(settlePaperBet(selected, outcome)).toEqual({ stake: 1, returned: 3.5, profit: 2.5, won: true }); });
  it("settles a loss at -1", () => expect(settlePaperBet(record().selection, "AWAY").profit).toBe(-1));
  it("returns winning odds less one", () => expect(settlePaperBet(record({}, { homeOdds: 2.14 }).selection, "HOME").profit).toBeCloseTo(1.14));
  it("always stakes exactly one", () => { expect(settlePaperBet(record().selection, "HOME").stake).toBe(1); expect(settlePaperBet(record().selection, "AWAY").stake).toBe(1); });
  it("gives no-bet zero stake, return and profit", () => expect(settlePaperBet(null, "DRAW")).toEqual({ stake: 0, returned: 0, profit: 0, won: null }));
  it("aggregates profit/stakes for total ROI", () => { const rows = [record({}, { homeOdds: 3 }), record({ fixtureId: "synthetic-b", actualOutcome: "AWAY" })]; const s = paperStrategySummary(rows); expect(s.netProfit).toBe(1); expect(s.totalStaked).toBe(2); expect(s.roi).toBe(0.5); expect(s.totalReturned).toBe(3); });
  it("empty strategy has unavailable ROI and averages", () => { expect(paperStrategySummary([]).roi).toBeNull(); expect(paperStrategySummary([noBet()]).roi).toBeNull(); expect(paperStrategySummary([]).averageOdds).toBeNull(); });
  it("rejects malformed settlement outcomes/odds", () => { expect(() => settlePaperBet({ ...record().selection!, decimalOdds: 1 }, "HOME")).toThrow(); expect(() => settlePaperBet(null, "INVALID" as "HOME")).toThrow(); });
});
describe("unit maximum drawdown", () => {
  it("always rising gives zero", () => expect(maximumDrawdown([1, 2, 3])).toBe(0));
  it("calculates a known peak-to-trough", () => expect(maximumDrawdown([5, -2, -3, 4, -6])).toBe(7));
  it("spans consecutive bets", () => expect(maximumDrawdown([2, -1, -1, -1])).toBe(3));
  it("keeps the maximum after recovery", () => expect(maximumDrawdown([5, -2, -3, 4, -6, 8])).toBe(7));
  it("canonical season/date/id ordering is invariant", () => { const rows = [record({ fixtureId: "z", actualOutcome: "AWAY" }), record({ fixtureId: "a" }), record({ fixtureId: "b", sourceDate: "2021-10-02T12:00:00Z", actualOutcome: "AWAY" })]; expect(paperStrategySummary(rows)).toEqual(paperStrategySummary([...rows].reverse())); expect(paperStrategySummary(rows).maximumDrawdown).toBe(2); });
  it("empty returns zero", () => expect(maximumDrawdown([])).toBe(0));
  it("rejects non-finite profit", () => expect(() => maximumDrawdown([NaN])).toThrow());
});
describe("model and market isolation", () => {
  it("requires identical eligible match sets", () => { expect(() => evaluateFrozenPrices([prediction()], [], "RECENT")).toThrow(); expect(() => evaluateFrozenPrices([prediction()], [price({ fixtureId: "missing" })], "RECENT")).toThrow(); });
  it("keeps older and recent cohorts separate", () => expect(() => evaluateFrozenPrices([prediction()], [price()], "OLDER")).toThrow());
  it("odds affect market metrics, never frozen probabilities", () => { const a = record(), b = record({}, { homeOdds: 3 }); expect(a.modelProbabilities).toEqual(b.modelProbabilities); expect(a.market).not.toEqual(b.market); expect(a.modelBrier).toBe(b.modelBrier); });
  it("future odds cannot alter an earlier forecast or pick", () => { const a = prediction(), b = prediction({ fixtureId: "b", sourceDate: "2021-10-02T12:00:00Z" }), pa = price(), pb = price({ fixtureId: b.fixtureId, sourceDate: b.sourceDate }); const old = evaluateFrozenPrices([a, b], [pa, pb], "RECENT"), changed = evaluateFrozenPrices([a, b], [pa, { ...pb, homeOdds: 10 }], "RECENT"); expect(old[0]).toEqual(changed[0]); expect(old[1].modelProbabilities).toEqual(changed[1].modelProbabilities); });
  it("never mutates original model or price records", () => { const models = [prediction()], prices = [price()], before = structuredClone({ models, prices }); evaluateFrozenPrices(models, prices, "RECENT"); expect({ models, prices }).toEqual(before); });
  it("rejects duplicate model or price identity", () => { expect(() => evaluateFrozenPrices([prediction(), prediction()], [price(), price()], "RECENT")).toThrow(); });
});
