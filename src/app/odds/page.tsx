import type { Metadata } from "next";
import { oddsPageState } from "@/lib/odds/server/runtime";
import OddsDashboard from "./odds-dashboard";

export const metadata: Metadata = { title: "Odds Scanner | Bet Scanner", description: "On-demand football 1X2 bookmaker comparison and theoretical arbitrage research. Synthetic demo by default; manually approved OddsRelay scans only." };
export const dynamic = "force-dynamic";

export default function OddsPage() {
  return <OddsDashboard {...oddsPageState()} />;
}
