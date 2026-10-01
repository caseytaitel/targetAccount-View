/**
 * Formatting and request validation for the one HubSpot write: appending an
 * entry to a company's `notes` property. Pure, so the client preview and the
 * server write produce the same text.
 */

import { NOTES_MAX_LENGTH, TIME_ZONE } from "./config";

/** "casey" -> "Casey". */
export function displayName(user: string): string {
  const u = user.trim();
  return u ? u[0].toUpperCase() + u.slice(1) : u;
}

/** YYYY-MM-DD in the team's time zone. */
export function today(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

export function formatEntry(user: string, date: string, text: string): string {
  return `${date} · ${displayName(user)}: ${text.trim()}`;
}

/** Newest entry first. Existing text is kept verbatim below it. */
export function prependEntry(existing: string, entry: string): string {
  return existing.trim() ? `${entry}\n\n${existing}` : entry;
}

/** Two reads of `notes` count as the same if they differ only in trailing whitespace. */
export function sameNotes(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trimEnd() === (b ?? "").trimEnd();
}

export type NoteRequest = { entry: string; expectedCurrent: string };

const ALLOWED_KEYS = new Set(["entry", "expectedCurrent"]);
export const ENTRY_MAX_LENGTH = 5000;

/**
 * Validates the POST body for /api/notes/[id]. Anything beyond `entry` and
 * `expectedCurrent` is rejected outright, so the route can never be coaxed into
 * carrying another property.
 */
export function parseNoteRequest(body: unknown): { ok: true; value: NoteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const keys = Object.keys(body);
  const extra = keys.filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length) {
    return { ok: false, error: `Unexpected field(s): ${extra.join(", ")}` };
  }
  const { entry, expectedCurrent } = body as Record<string, unknown>;
  if (typeof entry !== "string" || !entry.trim()) {
    return { ok: false, error: "Note text is required." };
  }
  if (entry.length > ENTRY_MAX_LENGTH) {
    return { ok: false, error: `Note is longer than ${ENTRY_MAX_LENGTH} characters.` };
  }
  if (typeof expectedCurrent !== "string") {
    return { ok: false, error: "expectedCurrent must be a string." };
  }
  return { ok: true, value: { entry, expectedCurrent } };
}

export function withinLimit(value: string): boolean {
  return value.length <= NOTES_MAX_LENGTH;
}
