import { NextResponse } from "next/server";

import { HubSpotError, NotesConflictError, appendCompanyNote, getCompanyNotes } from "@/lib/hubspot";
import { updateCachedNotes } from "@/lib/load";
import { parseNoteRequest } from "@/lib/notes";
import { currentUser, isJson } from "@/lib/session";
import { isValidCompanyId } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(err: unknown) {
  if (err instanceof NotesConflictError) {
    return NextResponse.json({ error: err.message, current: err.current }, { status: 409 });
  }
  const status = err instanceof HubSpotError ? err.status : 500;
  return NextResponse.json({ error: (err as Error).message }, { status });
}

/** GET /api/notes/{companyId} — fresh read of `notes`, used when the drawer opens. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidCompanyId(id)) {
    return NextResponse.json({ error: "Invalid company id." }, { status: 400 });
  }
  try {
    const notes = await getCompanyNotes(id);
    updateCachedNotes(id, notes);
    return NextResponse.json({ notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST /api/notes/{companyId}  body: { entry, expectedCurrent }
 *
 * THE ONLY HUBSPOT WRITE IN THIS APP. The client calls it solely from the confirm button
 * in ConfirmWriteModal. 409 when `notes` changed since the drawer loaded it.
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
  const parsed = parseNoteRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const notes = await appendCompanyNote(id, parsed.value.entry, parsed.value.expectedCurrent, user);
    updateCachedNotes(id, notes);
    return NextResponse.json({ notes });
  } catch (err) {
    return fail(err);
  }
}
