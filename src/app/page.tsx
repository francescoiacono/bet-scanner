import { mockFixtures } from "@/data/mock-fixtures";
import { mockMarketQuotes } from "@/data/mock-markets";
import { mockPlayedMatches } from "@/data/mock-played-matches";
import { deriveTeamProfiles, hasEnoughHistory } from "@/lib/backtest/history";
import { scanMarkets } from "@/lib/scan-markets";
import ScannerDashboard from "./scanner-dashboard";

export default function Home() {
  const profiles = deriveTeamProfiles(mockPlayedMatches);
  if (profiles.some((profile) => !hasEnoughHistory(profile))) {
    throw new RangeError("Current scanner teams need at least two prior matches at each venue.");
  }
  const scan = scanMarkets(profiles, mockFixtures, mockMarketQuotes);
  return <ScannerDashboard analysedBets={scan.analysedBets} />;
}
