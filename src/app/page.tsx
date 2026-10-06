import { mockMarkets } from "@/data/mock-markets";
import ScannerDashboard from "./scanner-dashboard";

export default function Home() {
  return <ScannerDashboard opportunities={mockMarkets} />;
}
