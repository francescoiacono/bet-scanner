import { demoScan } from "../demo";
import { object } from "../providers/oddsrelay-contract";
import { OddsProviderError } from "../providers/oddsrelay-http";
import type { OddsScannerService } from "./service";
import { ScanHistoryError, type ScanHistoryStore } from "./scan-history";

const ACTION_FIELDS: Record<string, string[]> = { history: ["action", "mode", "id"], demo: ["action", "mode"], discover: ["action", "mode"], pricing: ["action", "mode"], events: ["action", "mode", "cursor"], quote: ["action", "mode", "bookmakers"], confirm: ["action", "mode", "bookmakers", "approvalId"] };
const SESSION_COOKIE = "bet-scanner-odds-session";
export function createOddsHandler(getService: () => OddsScannerService, clock: () => number, newId: () => string, getHistory?: () => ScanHistoryStore) {
  return async function handle(request: Request): Promise<Response> {
    const responseHeaders = { "Cache-Control": "no-store" };
    try {
      const url = new URL(request.url);
      // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
      // Use the actual Host authority; the server itself is bound to loopback.
      const host = request.headers.get("Host") ?? url.host;
      const origin = new URL(`${url.protocol}//${host}`);
      if (request.method !== "POST") return Response.json({ error: { code: "METHOD", message: "Only explicit POST actions are supported." } }, { status: 405, headers: responseHeaders });
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || request.headers.get("Origin") !== origin.origin || (request.headers.get("Sec-Fetch-Site") && request.headers.get("Sec-Fetch-Site") !== "same-origin")) return Response.json({ error: { code: "ORIGIN", message: "Odds actions require the same local browser origin." } }, { status: 403, headers: responseHeaders });
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new RangeError("Use a JSON action request.");
      if (Number(request.headers.get("Content-Length") ?? 0) > 4096) throw new RangeError("Action request is too large.");
      const raw = await request.text(); if (raw.length > 4096) throw new RangeError("Action request is too large.");
      const body = object(JSON.parse(raw)), action = typeof body.action === "string" ? body.action : "";
      if (!Object.hasOwn(ACTION_FIELDS, action) || Object.keys(body).some((k) => !ACTION_FIELDS[action].includes(k))) throw new RangeError("Unknown action or unsupported request fields.");
      if (action === "history") {
        if (body.mode !== "LIVE" && body.mode !== "DEMO") throw new RangeError("Choose a scanner mode.");
        if (body.id !== undefined && typeof body.id !== "string") throw new RangeError("Invalid history identifier.");
        if (!getHistory) throw new ScanHistoryError("HISTORY_UNAVAILABLE", "Local scan history is unavailable.");
        // No provider service, account verification or session cookie is needed.
        return Response.json(await getHistory().browse(body.id as string | undefined), { headers: responseHeaders });
      }
      if (action === "demo") {
        if (body.mode !== "DEMO") throw new RangeError("Demo action requires DEMO mode.");
        return Response.json(demoScan(clock()), { headers: responseHeaders });
      }
      if (body.mode !== "LIVE") throw new RangeError("Provider actions require explicitly selected LIVE mode.");
      const existing = request.headers.get("Cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
      const owner = existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : newId();
      const headers = { ...responseHeaders, "Set-Cookie": `${SESSION_COOKIE}=${owner}; HttpOnly; SameSite=Strict; Path=/api/odds${url.protocol === "https:" ? "; Secure" : ""}` };
      const service = getService();
      let result: unknown;
      if (action === "discover") result = await service.discover();
      else if (action === "pricing") result = await service.pricing();
      else if (action === "events") { if (body.cursor !== undefined && (typeof body.cursor !== "string" || body.cursor.length > 2048)) throw new RangeError("Invalid event cursor."); result = await service.events(body.cursor as string | undefined); }
      else if (action === "quote") result = await service.quote(owner, body.bookmakers);
      else { if (typeof body.approvalId !== "string" || !/^[a-f0-9-]{36}$/.test(body.approvalId)) throw new RangeError("Invalid approval identifier."); result = await service.confirm(owner, body.approvalId, body.bookmakers); }
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof ScanHistoryError) return Response.json({ error: { code: error.code, message: error.message, status: 409, retryAfter: null } }, { status: 409, headers: responseHeaders });
      if (error instanceof OddsProviderError) return Response.json({ error: error.detail }, { status: error.detail.status, headers: responseHeaders });
      return Response.json({ error: { code: "INVALID_ACTION_OR_DATA", message: error instanceof RangeError ? error.message : "Invalid request or provider data. No automatic retry; obtain a new quote if needed." } }, { status: 400, headers: responseHeaders });
    }
  };
}
