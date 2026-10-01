import { NextResponse } from "next/server";

import { HubSpotError } from "@/lib/hubspot";
import { loadBoard } from "@/lib/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/accounts[?refresh=1] — read-only. refresh=1 bypasses the 5-minute HubSpot cache. */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    return NextResponse.json(await loadBoard(force), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof HubSpotError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
