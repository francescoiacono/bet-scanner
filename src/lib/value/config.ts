export const RECENT_PRICE_SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] as const;
export const OLDER_PRICE_SEASONS = ["2014-15", "2015-16", "2016-17", "2017-18", "2018-19"] as const;
export const PRICE_COLUMNS = ["Date", "HomeTeam", "AwayTeam", "B365H", "B365D", "B365A"] as const;
export const OUTCOME_ORDER = ["HOME", "DRAW", "AWAY"] as const;
export const MIN_EXPECTED_ROI = 0.02;
export const PAPER_STAKE = 1;
export const VALUE_BOOTSTRAP = Object.freeze({ samples: 5000, seed: 202608, confidenceLevel: 0.95 });
export const EV_BUCKETS = Object.freeze([
  { label: "2–<5%", minimum: 0.02, maximum: 0.05 },
  { label: "5–<10%", minimum: 0.05, maximum: 0.10 },
  { label: "10–<20%", minimum: 0.10, maximum: 0.20 },
  { label: "20%+", minimum: 0.20, maximum: Infinity },
]);
export const VALUE_PROTOCOL = Object.freeze({
  model: "dixon-coles-v1 / recorded V0.6 predictions only", priceFields: ["B365H", "B365D", "B365A"],
  priceDefinition: "historical Bet365 non-closing 1X2 source prices; C-suffixed fields excluded",
  marginRemoval: "proportional normalization", minimumExpectedROI: MIN_EXPECTED_ROI, stake: PAPER_STAKE,
  selection: "at most one: expectedROI descending, fairMarketEdge descending, HOME/DRAW/AWAY",
  cohorts: { recent: RECENT_PRICE_SEASONS, older: OLDER_PRICE_SEASONS }, bootstrap: VALUE_BOOTSTRAP,
  roiBootstrapZeroStakes: "any zero-stake replicate makes the interval unavailable; report its count; never drop replicates",
  profitabilityStatus: "both ROI lower bounds > 0: HISTORICAL_PAPER_EDGE_SUPPORTED; both upper bounds < 0: HISTORICAL_PAPER_EDGE_NEGATIVE; otherwise INCONCLUSIVE",
  evBuckets: ["2–<5%", "5–<10%", "10–<20%", "20%+"],
});
export const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
