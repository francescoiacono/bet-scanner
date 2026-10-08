import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mockProvider, NOW } from "../test-helpers";
import { createOddsHandler } from "./handler";
import { OddsScannerService } from "./service";

function harness() {
  let count = 0; const id = () => `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`;
  const mock = mockProvider(), service = new OddsScannerService(mock.provider, () => NOW, id), getService = vi.fn(() => service);
  const handle = createOddsHandler(getService, () => NOW, id);
  const request = (body: unknown, cookie?: string, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/odds", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { ...mock, handle, request, getService };
}
describe("local action route, demo isolation and key boundary", () => {
  it("DEMO runs with no configured service and no provider request", async () => { const h = harness(); h.getService.mockImplementation(() => { throw new RangeError("No key"); }); const r = await h.handle(h.request({ action: "demo", mode: "DEMO" })); expect(r.status).toBe(200); expect((await r.json()).analysis.opportunities).toHaveLength(1); expect(h.getService).not.toHaveBeenCalled(); expect(h.provider.free).not.toHaveBeenCalled(); expect(h.provider.scan).not.toHaveBeenCalled(); });
  it.each(["quote", "confirm", "discover", "events", "pricing"])("DEMO cannot invoke provider action %s", async (action) => { const h = harness(); expect((await h.handle(h.request({ action, mode: "DEMO" }))).status).toBe(400); expect(h.getService).not.toHaveBeenCalled(); });
  it("server-owned session and exact approval are required for the single charged action", async () => {
    const h = harness(), d = await h.handle(h.request({ action: "discover", mode: "LIVE" })), cookie = d.headers.get("Set-Cookie")!.split(";")[0];
    expect(d.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Strict"); expect(d.headers.get("Cache-Control")).toBe("no-store");
    const q = await h.handle(h.request({ action: "quote", mode: "LIVE", bookmakers: ["a", "b"] }, cookie)), quote = await q.json(); expect(h.provider.scan).not.toHaveBeenCalled();
    const wrong = await h.handle(h.request({ action: "confirm", mode: "LIVE", approvalId: quote.approvalId, bookmakers: ["a", "b"] })); expect(wrong.status).toBe(409); expect(h.provider.scan).not.toHaveBeenCalled();
    const correct = await h.handle(h.request({ action: "confirm", mode: "LIVE", approvalId: quote.approvalId, bookmakers: ["a", "b"] }, cookie)); expect(correct.status).toBe(200); expect(h.provider.scan).toHaveBeenCalledTimes(1);
    const repeat = await h.handle(h.request({ action: "confirm", mode: "LIVE", approvalId: quote.approvalId, bookmakers: ["a", "b"] }, cookie)); expect(repeat.status).toBe(409); expect(h.provider.scan).toHaveBeenCalledTimes(1);
  });
  it("rejects arbitrary URL, client cost and unapproved confirmation", async () => {
    for (const extra of [{ url: "https://api.oddsrelay.io/v2/odds/raw" }, { cost: 0 }]) { const h = harness(); expect((await h.handle(h.request({ action: "quote", mode: "LIVE", bookmakers: ["a", "b"], ...extra }))).status).toBe(400); expect(h.getService).not.toHaveBeenCalled(); }
    const h = harness(); expect((await h.handle(h.request({ action: "confirm", mode: "LIVE" }))).status).toBe(400); expect(h.provider.scan).not.toHaveBeenCalled();
  });
  it("cross-origin and nonlocal actions cannot access the provider", async () => {
    const h = harness(); expect((await h.handle(h.request({ action: "discover", mode: "LIVE" }, undefined, "https://elsewhere.test"))).status).toBe(403);
    const req = new Request("http://192.168.1.10:3000/api/odds", { method: "POST", headers: { Origin: "http://192.168.1.10:3000", "Content-Type": "application/json" }, body: '{"action":"discover","mode":"LIVE"}' }); expect((await h.handle(req)).status).toBe(403); expect(h.getService).not.toHaveBeenCalled();
  });
  it("accepts the real loopback Host/Origin when Next normalizes its request URL", async () => {
    const h = harness(), req = new Request("http://localhost:3000/api/odds", { method: "POST", headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000", "Content-Type": "application/json" }, body: '{"action":"demo","mode":"DEMO"}' });
    expect((await h.handle(req)).status).toBe(200); expect(h.getService).not.toHaveBeenCalled();
  });
  it("a nonlocal Host or different local browser origin is rejected despite a localhost handler URL", async () => {
    const h = harness();
    for (const [host, origin] of [["example.test", "http://example.test"], ["127.0.0.1:3000", "http://localhost:3000"]]) {
      const req = new Request("http://localhost:3000/api/odds", { method: "POST", headers: { Host: host, Origin: origin, "Content-Type": "application/json" }, body: '{"action":"discover","mode":"LIVE"}' });
      expect((await h.handle(req)).status).toBe(403);
    }
    expect(h.getService).not.toHaveBeenCalled();
  });
  it("GET cannot trigger discovery or spending", async () => { const h = harness(); expect((await h.handle(new Request("http://localhost:3000/api/odds"))).status).toBe(405); expect(h.getService).not.toHaveBeenCalled(); });
  it("missing configuration returns a safe actionable error", async () => { const h = harness(); h.getService.mockImplementation(() => { throw new RangeError("Set ODDSRELAY_KEY in .env.local"); }); const r = await h.handle(h.request({ action: "discover", mode: "LIVE" })); expect(r.status).toBe(400); expect((await r.json()).error.message).toContain(".env.local"); expect(h.provider.free).not.toHaveBeenCalled(); });
  it("rejects malformed JSON, oversized body and unknown action", async () => { const h = harness(); for (const body of ["not json", JSON.stringify({ action: "demo", mode: "DEMO", padding: "x".repeat(5000) }), JSON.stringify({ action: "unknown", mode: "LIVE" })]) { const req = new Request("http://localhost:3000/api/odds", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body }); expect((await h.handle(req)).status).toBe(400); } expect(h.getService).not.toHaveBeenCalled(); });
  it("only server runtime reads the environment key; client and demo have no provider startup I/O", () => {
    const runtime = readFileSync("src/lib/odds/server/runtime.ts", "utf8"), client = readFileSync("src/app/odds/odds-dashboard.tsx", "utf8"), page = readFileSync("src/app/odds/page.tsx", "utf8");
    expect(runtime).toContain('import "server-only"'); expect(runtime).toContain("process.env.ODDSRELAY_KEY"); expect(runtime).not.toContain("NEXT_PUBLIC_");
    expect(client).not.toContain("process.env"); expect(client).not.toContain("server/runtime"); expect(client).not.toContain("setInterval"); expect(client).not.toContain("useEffect"); expect(page).not.toContain("scannerService"); expect(page).not.toContain("fetch(");
  });
});
