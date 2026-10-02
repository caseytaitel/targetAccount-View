import { NextResponse } from "next/server";

import { HubSpotError, TerritoryConflictError, setCompanyTerritory } from "@/lib/hubspot";
import { updateCachedTerritory } from "@/lib/load";
import { currentUser, isJson } from "@/lib/session";
import { isValidCompanyId } from "@/lib/state";
import { parseTerritoryRequest } from "@/lib/territory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/territory/{companyId}  body: { changes, expected }
 *
 * HUBSPOT WRITE (territory / territory_status only). The client calls it solely from the
 * confirm button in ConfirmWriteModal on the Data Hygiene tab. 409 when either property
 * changed in HubSpot since the board loaded it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Signed out." }, { status: 401 });
  }
  if (!isJson(request)) {
    return NextResponse.json({ error: "Expected application/json." }, { status: 415 });
  }
  const { id } = await params;
  if (!isValidCompanyId(id)) {
    return NextResponse.json({ error: "Invalid company id." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = parseTerritoryRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const values = await setCompanyTerritory(id, parsed.value.changes, parsed.value.expected);
    updateCachedTerritory(id, values);
    return NextResponse.json({ values });
  } catch (err) {
    if (err instanceof TerritoryConflictError) {
      updateCachedTerritory(id, err.current);
      return NextResponse.json({ error: err.message, current: err.current }, { status: 409 });
    }
    const status = err instanceof HubSpotError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
