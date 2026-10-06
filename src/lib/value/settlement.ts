import type { MatchOutcome } from "../backtest/types";
import { OUTCOME_ORDER, PAPER_STAKE } from "./config";
import { validateDecimalOdds } from "./market";
import type { PaperSelection, PaperSettlement } from "./types";

export function settlePaperBet(selection: PaperSelection | null, actualOutcome: MatchOutcome): PaperSettlement {
  if (!OUTCOME_ORDER.includes(actualOutcome)) throw new RangeError("Unknown settlement outcome.");
  if (selection === null) return { stake: 0, returned: 0, profit: 0, won: null };
  if (!OUTCOME_ORDER.includes(selection.outcome)) throw new RangeError("Unknown selected outcome.");
  validateDecimalOdds(selection.decimalOdds);
  const won = selection.outcome === actualOutcome;
  const returned = won ? selection.decimalOdds : 0;
  return { stake: PAPER_STAKE, returned, profit: returned - PAPER_STAKE, won };
}
/** Units only. Starting profit/peak zero; recovery never erases prior drawdown. */
export function maximumDrawdown(profits: readonly number[]): number {
  let cumulative = 0, peak = 0, maximum = 0;
  for (const profit of profits) {
    if (!Number.isFinite(profit)) throw new RangeError("Drawdown requires finite profits.");
    cumulative += profit; peak = Math.max(peak, cumulative); maximum = Math.max(maximum, peak - cumulative);
    if (![cumulative, peak, maximum].every(Number.isFinite)) throw new RangeError("Cumulative profit/drawdown overflow.");
  }
  return maximum;
}
