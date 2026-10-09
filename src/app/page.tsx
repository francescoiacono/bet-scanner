import { oddsPageState } from "@/lib/odds/server/runtime";
import OddsDashboard from "./odds-dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  return <OddsDashboard {...oddsPageState()} />;
}
