import Link from "next/link";
import styles from "./scanner-dashboard.module.css";

export default function ResearchHeader({ activePage }: { activePage: "scanner" | "backtest" }) {
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
      </nav>
      <div className={styles.headerMeta}>
        <span className={styles.simulationBadge}>SIMULATION / FICTIONAL DATA</span>
        <span className={styles.version}>V0.3</span>
      </div>
    </header>
  );
}
