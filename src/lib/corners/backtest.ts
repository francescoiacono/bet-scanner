import { calculateHistoryDepth } from "../diagnostics/history-depth";
import type { VenueHistory } from "../backtest/types";
import { CORNER_NB_VERSION, CORNER_POISSON_VERSION, lexical } from "./config";
import { validateCornerMatches } from "./data";
import { fitCornerModel } from "./fit";
import { rankedProbabilityScore } from "./metrics";
import { distributionPrediction, empiricalCornerPrediction, predictCornerModel } from "./prediction";
import type { CornerDataset, CornerFitAudit, CornerRecord, PlayedCornerMatch } from "./types";

/** Same eligible IDs for both models and both benchmarks, by construction. */
export function backtestCorners(matches: readonly PlayedCornerMatch[], seasonId: string, dataset: CornerDataset,
  fitter: typeof fitCornerModel = fitCornerModel) {
  validateCornerMatches(matches);
  if (!seasonId.trim() || (dataset !== "DEVELOPMENT" && dataset !== "EXTERNAL_VALIDATION")) throw new RangeError("Invalid corner comparison identity.");
  const ordered = [...matches].sort((a, b) => lexical(a.kickoffAt, b.kickoffAt) || lexical(a.id, b.id));
  const counts = new Map<string, { home: number; away: number }>();
  const history: PlayedCornerMatch[] = [], records: CornerRecord[] = [], fits: CornerFitAudit[] = [], skippedIds: string[] = [];
  let homeSum = 0, awaySum = 0;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].kickoffAt === ordered[start].kickoffAt) end++;
    const batch = ordered.slice(start, end);
    const targets: { match: PlayedCornerMatch; venueHistory: VenueHistory; historyDepth: number }[] = [];
    for (const match of batch) {
      const home = counts.get(match.homeTeam) ?? { home: 0, away: 0 }, away = counts.get(match.awayTeam) ?? { home: 0, away: 0 };
      const venueHistory = { homeTeamHomeMatches: home.home, homeTeamAwayMatches: home.away, awayTeamHomeMatches: away.home, awayTeamAwayMatches: away.away };
      const historyDepth = calculateHistoryDepth(venueHistory);
      if (historyDepth >= 2) targets.push({ match, venueHistory, historyDepth }); else skippedIds.push(match.id);
    }
    if (targets.length) {
      const poissonFit = fitter([...history], CORNER_POISSON_VERSION), nbFit = fitter([...history], CORNER_NB_VERSION);
      for (const [fit, version] of [[poissonFit, CORNER_POISSON_VERSION], [nbFit, CORNER_NB_VERSION]] as const) {
        if (!fit.converged || fit.modelVersion !== version || fit.trainingMatchCount !== history.length) throw new Error("Invalid corner fit; model generation aborted.");
      }
      const fitId = `${dataset}/${seasonId}/${batch[0].kickoffAt.slice(0, 10)}`;
      fits.push({ id: fitId, kickoffAt: batch[0].kickoffAt, latestTrainingKickoffAt: history.at(-1)!.kickoffAt, poisson: poissonFit, negativeBinomial: nbFit });
      for (const { match, venueHistory, historyDepth } of targets) {
        // Pass fixture identities only: target counts never reach the predictor.
        const fixture = { id: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam };
        const poisson = predictCornerModel(fixture, poissonFit), negativeBinomial = predictCornerModel(fixture, nbFit);
        const leaguePoisson = distributionPrediction(match.id, homeSum / history.length, awaySum / history.length, null, "league-average-poisson-corners");
        const empirical = empiricalCornerPrediction(match.id, history), actualTotal = match.homeCorners + match.awayCorners;
        records.push({ id: match.id, seasonId, dataset, kickoffAt: match.kickoffAt, actualTotal, trainingMatchCount: history.length,
          venueHistory, historyDepth, fitId, poisson, negativeBinomial, leaguePoisson, empirical,
          poissonRPS: rankedProbabilityScore(poisson.totalProbabilities, actualTotal), negativeBinomialRPS: rankedProbabilityScore(negativeBinomial.totalProbabilities, actualTotal),
          leaguePoissonRPS: rankedProbabilityScore(leaguePoisson.totalProbabilities, actualTotal), empiricalRPS: rankedProbabilityScore(empirical.totalProbabilities, actualTotal) });
      }
    }
    // Earlier warm-up skips contribute to all later models and benchmarks.
    for (const match of batch) {
      const home = counts.get(match.homeTeam) ?? { home: 0, away: 0 }, away = counts.get(match.awayTeam) ?? { home: 0, away: 0 };
      home.home++; away.away++; counts.set(match.homeTeam, home); counts.set(match.awayTeam, away);
      homeSum += match.homeCorners; awaySum += match.awayCorners;
    }
    history.push(...batch); start = end;
  }
  return { records, fits, skippedIds, historicalMatches: matches.length };
}
