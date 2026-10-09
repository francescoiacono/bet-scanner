import type { OddsSnapshot, ProviderUsage, ScanAnalysis } from "./types";

export interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  bookmakers: string[];
  originalUsage: ProviderUsage;
  unchanged: boolean;
  snapshotReceivedAt: string;
  ageMs: number;
}
export interface HistoricalScan extends ScanHistoryEntry {
  readOnly: true;
  snapshot: OddsSnapshot;
  originalAnalysis: ScanAnalysis;
  currentAnalysis: ScanAnalysis;
  viewedAt: string;
}
export interface ScanHistoryReply {
  readCost: 0;
  entries: ScanHistoryEntry[];
  view: HistoricalScan | null;
}
