import Link from "next/link";
import styles from "./scanner-dashboard.module.css";

export default function ResearchHeader({ activePage }: { activePage: "scanner" | "backtest" | "diagnostics" | "models" | "corners" }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M6 23V13M13 23V8M20 23V17M27 23V5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
        <span>BET SCANNER<span className={styles.brandSubline}>RESEARCH WORKSPACE</span></span>
      </div>
      <nav className={styles.navigation} aria-label="Research views">
        <Link href="/" aria-current={activePage === "scanner" ? "page" : undefined}>Scanner</Link>
        <Link href="/backtest" aria-current={activePage === "backtest" ? "page" : undefined}>Backtest</Link>
        <Link href="/diagnostics" aria-current={activePage === "diagnostics" ? "page" : undefined}>Diagnostics</Link>
        <Link href="/models" aria-current={activePage === "models" ? "page" : undefined}>Models</Link>
        <Link href="/corners" aria-current={activePage === "corners" ? "page" : undefined}>Corners</Link>
      </nav>
      <div className={styles.headerMeta}>
        <span className={styles.simulationBadge}>{activePage !== "scanner" ? "REAL HISTORICAL RESULTS" : "SIMULATION / FICTIONAL MARKET SCANNER"}</span>
        <span className={styles.version}>V0.7</span>
      </div>
    </header>
  );
}
