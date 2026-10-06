import { mockFixtures } from "@/data/mock-fixtures";
import { mockMarketQuotes } from "@/data/mock-markets";
import { mockTeamProfiles } from "@/data/mock-team-profiles";
import { scanMarkets } from "@/lib/scan-markets";
import ScannerDashboard from "./scanner-dashboard";

export default function Home() {
  const scan = scanMarkets(mockTeamProfiles, mockFixtures, mockMarketQuotes);
  return <ScannerDashboard analysedBets={scan.analysedBets} />;
}
