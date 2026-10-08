import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { OddsRelayProvider } from "../providers/oddsrelay-http";
import { OddsScannerService } from "./service";
import { demoScan } from "../demo";

type Runtime = { fingerprint: string; service: OddsScannerService };
const globalState = globalThis as typeof globalThis & { betScannerOddsRuntime?: Runtime };
export function apiConfigured(): boolean { return Boolean(process.env.ODDSRELAY_KEY?.trim()); }
export function oddsPageState() { return { configured: apiConfigured(), initialDemo: demoScan(Date.now()) }; }
export function scannerService(): OddsScannerService {
  const key = process.env.ODDSRELAY_KEY?.trim();
  if (!key) throw new RangeError("Set ODDSRELAY_KEY in .env.local, then restart. DEMO needs no key.");
  const fingerprint = createHash("sha256").update(key).digest("hex");
  if (globalState.betScannerOddsRuntime?.fingerprint !== fingerprint) globalState.betScannerOddsRuntime = { fingerprint, service: new OddsScannerService(new OddsRelayProvider(key), Date.now, randomUUID) };
  return globalState.betScannerOddsRuntime!.service;
}
