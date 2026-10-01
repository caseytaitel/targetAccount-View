import { NextResponse } from "next/server";

import { currentUser, isJson } from "@/lib/session";
import { getStore, isValidCompanyId, parseStateUpdate } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/state/{companyId}  body: { field, value }
 * App-side state only (Redis). This route never touches HubSpot.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = parseStateUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const state = await getStore().setField(id, parsed.field, parsed.value, user);
    return NextResponse.json({ state });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
