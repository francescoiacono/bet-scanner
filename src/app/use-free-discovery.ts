"use client";

import { useEffect, useRef } from "react";
import type { OddsMode } from "@/lib/odds/types";

/** One free discovery attempt per mounted page; no polling, quotes or charged scans. */
export function useFreeDiscovery(mode: OddsMode, configured: boolean, discover: () => Promise<void>) {
  const attempted = useRef(false);
  useEffect(() => {
    if (mode !== "LIVE" || !configured || attempted.current) return;
    // Mark before starting I/O so Strict Mode effect replay cannot duplicate discovery.
    attempted.current = true;
    void discover();
  }, [mode, configured, discover]);
}
