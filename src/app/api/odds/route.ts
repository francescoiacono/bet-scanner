import { randomUUID } from "node:crypto";
import { createOddsHandler } from "@/lib/odds/server/handler";
import { scannerService, scanHistory } from "@/lib/odds/server/runtime";

export const runtime = "nodejs";
export const POST = createOddsHandler(scannerService, Date.now, randomUUID, scanHistory);
