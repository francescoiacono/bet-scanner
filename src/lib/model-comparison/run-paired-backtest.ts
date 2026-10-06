import type { PlayedMatch } from "../backtest/types";
import { calculateBrierScore } from "../backtest/metrics";
import { runBacktest } from "../backtest/run-backtest";
import { fitDixonColes } from "../dixon-coles/fit";
import { predictDixonColes } from "../dixon-coles/model";
import type { FitAudit, PairedPrediction } from "./types";

/** Baseline eligibility is the single source of truth; a failed fit aborts everything. */
export function runPairedBacktest(matches: readonly PlayedMatch[], fitter: typeof fitDixonColes = fitDixonColes) {
  if (matches.some((match) => !/^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(match.kickoffAt))) {
    throw new RangeError("Model comparison requires normalized noon-UTC source-date keys.");
  }
  const baseline = runBacktest(matches);
  const eligible = new Map(baseline.predictions.map((record) => [record.id, record]));
  const ordered = [...matches].sort((a, b) => a.kickoffAt < b.kickoffAt ? -1 : a.kickoffAt > b.kickoffAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const history: PlayedMatch[] = [], records: PairedPrediction[] = [], fits: FitAudit[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].kickoffAt === ordered[start].kickoffAt) end++;
    const batch = ordered.slice(start, end);
    const targets = batch.filter((match) => eligible.has(match.id));
    if (targets.length) {
      const fit = fitter([...history]);
      if (!fit.converged || fit.modelVersion !== "dixon-coles-v1" || fit.trainingMatchCount !== history.length) {
        throw new Error("Dixon–Coles returned an invalid fit; the comparison cannot continue.");
      }
      const fitId = `dixon-coles-v1/${batch[0].kickoffAt.slice(0, 10)}`;
      fits.push({ id: fitId, kickoffAt: batch[0].kickoffAt, latestTrainingKickoffAt: history.at(-1)!.kickoffAt, fit });
      for (const target of targets) {
        const record = eligible.get(target.id)!;
        const prediction = predictDixonColes({ id: target.id, homeTeam: target.homeTeam, awayTeam: target.awayTeam }, fit);
        records.push({ ...record, dixonColesPrediction: prediction,
          dixonColesBrierScore: calculateBrierScore(prediction, record.actualOutcome), fitId });
      }
    }
    // Include earlier warm-up skips in the training history, after each batch.
    history.push(...batch);
    start = end;
  }
  if (records.length !== baseline.predictions.length || records.some((record, i) => record.id !== baseline.predictions[i].id)) {
    throw new Error("Paired model evaluation IDs differ from the frozen baseline.");
  }
  return { baseline, records, fits };
}
