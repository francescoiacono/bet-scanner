import Link from "next/link";
import type { OddsMode } from "@/lib/odds/types";
import ui from "./ui.module.css";
import styles from "./site-header.module.css";

export default function SiteHeader({ activePage, mode }: { activePage: "scanner" | "research"; mode?: OddsMode }) {
  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href="/" className={styles.brand} aria-label="Bet Scanner home">
        <span className={styles.logo} aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M6 21V12M14 21V7M22 21V4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
        <span>Bet Scanner</span>
      </Link>
      <nav className={styles.navigation} aria-label="Primary navigation">
        <Link href="/" aria-current={activePage === "scanner" ? "page" : undefined}>Scanner</Link>
        <Link href="/research" aria-current={activePage === "research" ? "page" : undefined}>Research</Link>
      </nav>
      <span className={`${ui.badge} ${styles.source} ${activePage === "research" ? ui.neutral : ""}`}>{activePage === "research" ? "RESEARCH ARCHIVE" : mode === "LIVE" ? "LIVE SOURCE" : "DEMO"}</span>
    </div>
  </header>;
}
