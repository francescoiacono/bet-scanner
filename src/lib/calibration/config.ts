export const DEVELOPMENT_SEASONS = ["2014-15", "2015-16", "2016-17", "2017-18", "2018-19"] as const;
export const VALIDATION_SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] as const;
export const FAMILIES = ["identity", "temperature-v1", "multinomial-logit-v1"] as const;
export const OUTCOMES = ["HOME", "DRAW", "AWAY"] as const;
export const CALIBRATION_BOOTSTRAP = Object.freeze({ samples: 5000, seed: 202609, confidenceLevel: 0.95 });
export const FIT_CONFIGURATION = Object.freeze({ optimiser: "numeric@1.2.6 / BFGS", maximumIterations: 2000, stepTolerance: 1e-10,
  gradientTolerance: 1e-8, relativeObjectiveTolerance: 1e-10, stableIterations: 5,
  convergence: "mean gradient norm, five stable objective changes, or library step tolerance; finite valid fit; iteration cap fails",
  objective: "mean multiclass natural-log loss; analytic gradients; no clipping, regularisation or market inputs" });
export const INITIAL_PARAMETERS = Object.freeze({ identity: [] as readonly number[], "temperature-v1": [0] as readonly number[], "multinomial-logit-v1": [0, 1, 0, 0, 0, 1] as readonly number[] });
export const ROLLING_FOLDS = DEVELOPMENT_SEASONS.slice(1).map((validationSeason, index) => ({
  fold: index + 1, trainingSeasons: DEVELOPMENT_SEASONS.slice(0, index + 1), validationSeason,
}));
export const CONFIDENCE_BUCKETS = [
  { label: "1/3–<0.40", minimum: 1 / 3, maximum: 0.4 }, { label: "0.40–<0.50", minimum: 0.4, maximum: 0.5 },
  { label: "0.50–<0.60", minimum: 0.5, maximum: 0.6 }, { label: "0.60–<0.70", minimum: 0.6, maximum: 0.7 },
  { label: "0.70–<0.80", minimum: 0.7, maximum: 0.8 }, { label: "0.80–1.00", minimum: 0.8, maximum: 1 },
] as const;
export const DISAGREEMENT_BUCKETS = [
  { label: "<5 pp", minimum: 0, maximum: 0.05 }, { label: "5–<10 pp", minimum: 0.05, maximum: 0.1 },
  { label: "10–<20 pp", minimum: 0.1, maximum: 0.2 }, { label: "20+ pp", minimum: 0.2, maximum: 1 },
] as const;
export const FROZEN_ARTIFACT_HASHES = Object.freeze({
  "model-comparison-v06.json": "deb9fac92ebd104fcc15cf713b5e2600cfba5e56a8f58b30d219f469dccf8262",
  "corners-v07-summary.json": "bf4475b082608bf78a9f92b7986355745c62279d54b05509497a0699494fa4a7",
  "value-v08-summary.json": "d1fbf53cfd513bd9329893f5cb9205d039f455ed725c2cebc55a4b7de1990bb9",
});
export const CALIBRATION_PROTOCOL = Object.freeze({ developmentSeasons: DEVELOPMENT_SEASONS, validationSeasons: VALIDATION_SEASONS,
  families: FAMILIES, definitions: { identity: "q=p; no fit", "temperature-v1": "T=exp(rawT); q=softmax(log(p)/T)",
    "multinomial-logit-v1": "x=(1,log(pH)-log(pA),log(pD)-log(pA)); logits=(bH*x,bD*x,0); six parameters, AWAY reference" },
  initialParameters: INITIAL_PARAMETERS, fitting: FIT_CONFIGURATION, folds: ROLLING_FOLDS, bootstrap: CALIBRATION_BOOTSTRAP,
  selection: "older rolling-origin only; lower Brier-advantage bound >0; largest observed advantage; within 1e-12 prefer temperature; otherwise identity",
  validationStatus: "identity: IDENTITY_RETAINED; otherwise lower bound >0: CALIBRATION_IMPROVEMENT_SUPPORTED; upper bound <0: CALIBRATION_HARM_SUPPORTED; otherwise INCONCLUSIVE",
  probabilityPolicy: "strictly inside (0,1), sum tolerance 1e-10; stable softmax; no clipping or epsilon; invalid trial/fit fails",
  confidenceBuckets: CONFIDENCE_BUCKETS, disagreementBuckets: DISAGREEMENT_BUCKETS, calibrationBins: "ten [0,.1),...,[.9,1] bins",
  disagreementMetric: "per fixture maximum absolute class difference for both raw and calibrated; bucket means across fixtures",
  marketPolicy: "benchmark only after calibrated predictions; frozen V0.8 B365H/B365D/B365A and proportional normalization; no betting strategy" });
export const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
