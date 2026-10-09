import "server-only";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { analyseSnapshot } from "../arbitrage";
import { instant } from "../validation";
import { canonicalRequest, requestIdentity, type ScanRequest } from "../providers/oddsrelay-http";
import type { OddsSnapshot, ProviderUsage } from "../types";
import type { ScanHistoryEntry, ScanHistoryReply } from "../history-types";

export const HISTORY_LIMITS = { records: 20, fileBytes: 32 * 1024 * 1024, recordBytes: 8 * 1024 * 1024 } as const;
export interface SavedScan {
  id: string;
  scannedAt: string;
  request: ScanRequest;
  etag: string | null;
  snapshot: OddsSnapshot;
  originalUsage: ProviderUsage;
  unchanged: boolean;
}
export type NewSavedScan = Omit<SavedScan, "id">;
export interface ScanHistoryStore {
  browse(id?: string): Promise<ScanHistoryReply>;
  latestForRequest(request: ScanRequest): Promise<SavedScan | undefined>;
  save(scan: NewSavedScan): Promise<{ id: string; entries: ScanHistoryEntry[] }>;
}
export class ScanHistoryError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
function invalid(): never { throw new ScanHistoryError("HISTORY_INVALID", "Local scan history is invalid or unsafe. No provider request was made by this history action."); }
function isMissing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === "ENOENT"; }

// An explicit allowlist is shared by writes and reads. Writes project onto it;
// reads reject extra fields. Provider URLs are deliberately not retained.
type Decoder = (value: unknown, strict: boolean) => unknown;
const string: Decoder = (v) => { if (typeof v !== "string" || !v.trim() || v.length > 4096 || /[\x00-\x1f]/.test(v)) invalid(); return v; };
const bool: Decoder = (v) => { if (typeof v !== "boolean") invalid(); return v; };
const number: Decoder = (v) => { if (typeof v !== "number" || !Number.isFinite(v)) invalid(); return v; };
const count: Decoder = (v, s) => { const n = number(v, s) as number; if (!Number.isSafeInteger(n) || n < 0) invalid(); return n; };
const time: Decoder = (v) => { try { instant(v); } catch { invalid(); } return v; };
const nullable = (decode: Decoder): Decoder => (v, s) => v === null ? null : decode(v, s);
const literal = (...values: unknown[]): Decoder => (v) => { if (!values.includes(v)) invalid(); return v; };
const list = (decode: Decoder): Decoder => (v, s) => { if (!Array.isArray(v)) invalid(); return v.map((item) => decode(item, s)); };
const shape = (fields: Record<string, Decoder>): Decoder => (v, strict) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid();
  const row = v as Record<string, unknown>;
  if (strict && Object.keys(row).some((key) => !Object.hasOwn(fields, key))) invalid();
  return Object.fromEntries(Object.entries(fields).map(([key, decode]) => [key, decode(row[key], strict)]));
};
const usage = shape({ cost: nullable(count), used: nullable(count), remaining: nullable((v, s) => v === "unlimited" ? v : count(v, s)), limit: nullable((v, s) => v === "unlimited" ? v : count(v, s)), resetsAt: nullable(time) });
const fixture = shape({ id: string, sport: literal("FOOTBALL"), competitionId: string, competition: string, homeTeam: string, awayTeam: string, kickoff: time });
const market = shape({ id: string, fixtureId: string, type: literal("MATCH_WINNER"), settlement: literal("REGULATION_TIME_1X2"), available: bool });
const quote = shape({ id: string, fixtureId: string, competitionId: string, marketId: string, settlement: string, outcome: literal("HOME", "DRAW", "AWAY"), decimalOdds: (v, s) => { const n = number(v, s) as number; if (n <= 1) invalid(); return n; },
  bookmaker: shape({ id: string, name: string, isExchange: bool }), side: literal("BACK", "LAY"), available: bool,
  evidenceAt: nullable(string), snapshotAt: time,
  source: shape({ provider: literal("ODDSRELAY"), eventId: string, marketKey: literal("h2h"), outcomeName: string, pointer: string, link: (v, strict) => { if (strict && v !== null) invalid(); return null; } }) });
const snapshot = shape({ provider: literal("ODDSRELAY"), mode: literal("LIVE"), receivedAt: time, processedAt: time,
  markets: list(shape({ fixture, market, quotes: list(quote) })), excluded: list(shape({ eventId: nullable(string), source: string, reason: string })) });
const requestDecoder = shape({ region: literal("uk"), sports: literal("soccer"), markets: literal("h2h"), bookmakers: list(string) });
const recordDecoder = shape({ id: string, scannedAt: time, request: requestDecoder,
  etag: nullable((v) => { if (typeof v !== "string" || v.length > 1024 || !/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(v)) invalid(); return v; }),
  snapshot, originalUsage: usage, unchanged: bool });
function decodeRecord(value: unknown, strict: boolean): SavedScan {
  const record = recordDecoder(value, strict) as SavedScan;
  if (!/^history-[a-f0-9-]{36}$/.test(record.id)) invalid();
  try {
    const canonical = canonicalRequest(record.request.bookmakers);
    if (JSON.stringify(canonical) !== JSON.stringify(record.request)) invalid();
    if (instant(record.snapshot.receivedAt) > instant(record.scannedAt) || instant(record.snapshot.processedAt) > instant(record.snapshot.receivedAt)) invalid();
    for (const row of record.snapshot.markets) for (const offer of row.quotes) if (!canonical.bookmakers.includes(offer.bookmaker.id)) invalid();
    analyseSnapshot(record.snapshot, instant(record.scannedAt));
  } catch { invalid(); }
  if (Buffer.byteLength(JSON.stringify(record)) > HISTORY_LIMITS.recordBytes) throw new ScanHistoryError("HISTORY_TOO_LARGE", "Normalized scan exceeds the local history size limit. The scan receipt remains available on screen.");
  return record;
}
function encode(records: SavedScan[]): string {
  const checksum = createHash("sha256").update(JSON.stringify(records)).digest("hex");
  return JSON.stringify({ version: 1, checksum, records });
}
function summary(record: SavedScan, now: number): ScanHistoryEntry {
  if (!Number.isFinite(now) || instant(record.scannedAt) > now) invalid();
  return { id: record.id, scannedAt: record.scannedAt, bookmakers: [...record.request.bookmakers], originalUsage: record.originalUsage, unchanged: record.unchanged, snapshotReceivedAt: record.snapshot.receivedAt, ageMs: now - instant(record.snapshot.receivedAt) };
}

/** Lazy, local-only persistence. Nothing is read or requested during construction. */
export class FileScanHistory implements ScanHistoryStore {
  constructor(private readonly workspace: string, private readonly clock: () => number) {}
  private async directory(create: boolean): Promise<string | null> {
    let path = await realpath(this.workspace);
    for (const part of ["data", "private", "odds-history"]) {
      path = join(path, part);
      let stat;
      try { stat = await lstat(path); } catch (error) {
        if (!isMissing(error)) throw error;
        if (!create) return null;
        try { await mkdir(path, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
        stat = await lstat(path);
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
      if (part === "odds-history" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) invalid();
    }
    return path;
  }
  private async read(): Promise<SavedScan[]> {
    const directory = await this.directory(false);
    if (!directory) return [];
    let handle;
    try { handle = await open(join(directory, "history.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if (isMissing(error)) return []; throw error; }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > HISTORY_LIMITS.fileBytes) invalid();
      // Bound the allocation and read even if another local process modifies
      // the file after fstat. Our own writers only replace it atomically.
      const buffer = Buffer.alloc(stat.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const result = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
        if (!result.bytesRead) break;
        bytes += result.bytesRead;
      }
      if (bytes !== stat.size) invalid();
      const raw = buffer.subarray(0, bytes).toString("utf8");
      const value = JSON.parse(raw);
      if (!value || Object.keys(value).sort().join(",") !== "checksum,records,version" || value.version !== 1 || !Array.isArray(value.records) || value.records.length > HISTORY_LIMITS.records) invalid();
      if (value.checksum !== createHash("sha256").update(JSON.stringify(value.records)).digest("hex")) invalid();
      const records = value.records.map((r: unknown) => decodeRecord(r, true)) as SavedScan[];
      if (new Set(records.map((r) => r.id)).size !== records.length) invalid();
      for (let i = 1; i < records.length; i++) if (instant(records[i].scannedAt) > instant(records[i - 1].scannedAt)) invalid();
      return records;
    } finally { await handle.close(); }
  }
  private async safe<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) {
      if (error instanceof ScanHistoryError) throw error;
      throw new ScanHistoryError("HISTORY_UNAVAILABLE", "Local scan history could not be read or saved safely. No automatic retry was made.");
    }
  }
  browse(id?: string): Promise<ScanHistoryReply> {
    return this.safe(async () => {
      if (id !== undefined && !/^history-[a-f0-9-]{36}$/.test(id)) invalid();
      const records = await this.read(), now = this.clock();
      const record = id === undefined ? records[0] : records.find((r) => r.id === id);
      if (id !== undefined && !record) throw new ScanHistoryError("HISTORY_NOT_FOUND", "This scan is no longer in local history.");
      return { readCost: 0, entries: records.map((r) => summary(r, now)), view: record ? { ...summary(record, now), readOnly: true, snapshot: record.snapshot,
        originalAnalysis: analyseSnapshot(record.snapshot, instant(record.scannedAt)), currentAnalysis: analyseSnapshot(record.snapshot, now), viewedAt: new Date(now).toISOString() } : null };
    });
  }
  latestForRequest(request: ScanRequest): Promise<SavedScan | undefined> {
    return this.safe(async () => {
      const records = await this.read();
      for (const record of records) summary(record, this.clock());
      return records.find((r) => requestIdentity(r.request) === requestIdentity(request));
    });
  }
  save(scan: NewSavedScan): Promise<{ id: string; entries: ScanHistoryEntry[] }> {
    return this.safe(async () => {
      const record = decodeRecord({ ...scan, id: `history-${randomUUID()}` }, false);
      summary(record, this.clock());
      const directory = (await this.directory(true))!;
      const lockPath = join(directory, "write.lock");
      let lock;
      try { lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
      catch { throw new ScanHistoryError("HISTORY_BUSY", "Local history is locked or unavailable. The completed scan was not retried."); }
      const temporary = join(directory, `.history-${randomUUID()}.tmp`);
      try {
        // Recover only our own temporary filenames, while holding the lock.
        // A crash cannot accumulate unbounded old temporary scan copies.
        for (const name of await readdir(directory)) if (/^\.history-[a-f0-9-]{36}\.tmp$/.test(name)) await unlink(join(directory, name));
        const records = [record, ...await this.read()].sort((a, b) => instant(b.scannedAt) - instant(a.scannedAt)).slice(0, HISTORY_LIMITS.records);
        let content = encode(records);
        while (Buffer.byteLength(content) > HISTORY_LIMITS.fileBytes && records.length > 1) { records.pop(); content = encode(records); }
        const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { await file.writeFile(content, "utf8"); await file.sync(); } finally { await file.close(); }
        await rename(temporary, join(directory, "history.json"));
        return { id: record.id, entries: records.map((r) => summary(r, this.clock())) };
      } finally {
        await unlink(temporary).catch(() => {});
        await lock.close();
        await unlink(lockPath);
      }
    });
  }
}
