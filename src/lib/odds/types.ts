export const OUTCOMES = ["HOME", "DRAW", "AWAY"] as const;
export type Outcome = typeof OUTCOMES[number];
export type OddsMode = "DEMO" | "LIVE";
export type TokenBalance = number | "unlimited" | null;
export interface Fixture {
  id: string;
  sport: "FOOTBALL";
  competitionId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
}
export interface Bookmaker { id: string; name: string; isExchange: boolean; }
export interface Market {
  id: string;
  fixtureId: string;
  type: "MATCH_WINNER";
  settlement: "REGULATION_TIME_1X2";
  available: boolean;
}
export interface SourceReference {
  provider: string;
  eventId: string;
  marketKey: string;
  outcomeName: string;
  pointer: string;
  link: string | null;
}
export interface OddsQuote {
  id: string;
  fixtureId: string;
  competitionId: string;
  marketId: string;
  settlement: string;
  outcome: Outcome;
  decimalOdds: number;
  bookmaker: Bookmaker;
  side: "BACK" | "LAY";
  available: boolean;
  evidenceAt: string | null;
  snapshotAt: string;
  source: SourceReference;
}
export interface ExcludedData { eventId: string | null; source: string; reason: string; }
export interface FixtureMarket { fixture: Fixture; market: Market; quotes: OddsQuote[]; }
export interface OddsSnapshot {
  provider: string;
  mode: OddsMode;
  receivedAt: string;
  processedAt: string;
  markets: FixtureMarket[];
  excluded: ExcludedData[];
}
export interface ProviderUsage {
  cost: number | null;
  used: number | null;
  remaining: TokenBalance;
  limit: TokenBalance;
  resetsAt: string | null;
}
export interface ProviderError {
  code: string;
  message: string;
  status: number;
  retryAfter: string | null;
  usage?: ProviderUsage;
}
export interface ArbitrageOpportunity {
  fixture: Fixture;
  market: Market;
  selections: Record<Outcome, OddsQuote>;
  inverseOddsSum: number;
  theoreticalGrossROI: number;
  illustrativeFractions: Record<Outcome, number>;
  grossPayoutPerUnit: number;
  oldestEvidenceAt: string;
}
export interface MarketAnalysis {
  fixture: Fixture;
  status: "ARBITRAGE" | "NO ARBITRAGE FOUND" | "INSUFFICIENT DATA";
  best: Partial<Record<Outcome, OddsQuote>>;
  inverseOddsSum: number | null;
  opportunity: ArbitrageOpportunity | null;
  excluded: ExcludedData[];
  reasons: string[];
}
export interface ScanAnalysis {
  status: "THEORETICAL ARBITRAGE" | "NO ARBITRAGE FOUND" | "INSUFFICIENT DATA";
  opportunities: ArbitrageOpportunity[];
  markets: MarketAnalysis[];
  excluded: ExcludedData[];
  evaluatedAt: string;
}
