export const DEVELOPMENT_CORNER_SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] as const;
export const EXTERNAL_CORNER_SEASONS = ["2014-15", "2015-16", "2016-17", "2017-18", "2018-19"] as const;
export const REQUIRED_CORNER_COLUMNS = ["Date", "HomeTeam", "AwayTeam", "HC", "AC"] as const;
export const CORNER_POISSON_VERSION = "corner-poisson-v1";
export const CORNER_NB_VERSION = "corner-negative-binomial-v1";
export const MAX_EXPLICIT_TOTAL_CORNERS = 30;
export const CORNER_OVER_LINES = Object.freeze([7.5, 8.5, 9.5, 10.5, 11.5, 12.5]);
export const CORNER_FIT_CONFIGURATION = Object.freeze({
  optimiser: "numeric@1.2.6 / BFGS", maximumIterations: 2000, stepTolerance: 1e-10,
  meanGradientTolerance: 1e-6, relativeObjectiveTolerance: 1e-10, stableIterations: 5,
  rawAlphaDifferenceEpsilon: 1e-5, initialAlpha: 0.1,
  initialisation: "mean parameters zero, NB rawAlpha = log(0.1); independent fit per date; no warm starts",
});
export const CORNER_BOOTSTRAP = Object.freeze({ samples: 5000, seed: 202607, confidenceLevel: 0.95 });
/** Research-only; declared before external evaluation. Equality includes zero. */
export const CORNER_PROMOTION_RULE = "External paired RPS interval entirely above zero: NB; entirely below zero: Poisson; includes zero or unavailable: NONE / INCONCLUSIVE";
export const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
