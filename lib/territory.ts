/**
 * Data Hygiene: request validation and PATCH-body building for the territory write
 * (`territory`, `territory_status`). Pure, so every rule here is unit-tested.
 */

import { TERRITORY_PROPERTIES, type TerritoryProperty } from "./config";
import type { Account } from "./accounts";

export type TerritoryValues = Record<TerritoryProperty, string>;
export type TerritoryChanges = Partial<TerritoryValues>;
export type EnumOption = { value: string; label: string };
/** Live HubSpot enum options per property. Empty arrays when they couldn't be read. */
export type TerritoryOptions = Record<TerritoryProperty, EnumOption[]>;

export const PROPERTY_LABEL: Record<TerritoryProperty, string> = {
  territory: "Territory",
  territory_status: "Territory Status",
};

/** An account belongs on the Data Hygiene tab when either territory property is blank. */
export function needsHygiene(a: Pick<Account, "territory" | "territoryStatus">): boolean {
  return a.territory === "" || a.territoryStatus === "";
}

export type TerritoryRequest = { changes: TerritoryChanges; expected: TerritoryValues };

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Validates the POST body for /api/territory/[id]: `{ changes, expected }`.
 * `changes` may hold only `territory` and/or `territory_status`, each a non-empty string
 * (this route fills gaps; it never clears a value). `expected` is what the user was shown,
 * for the conflict check. Anything else is rejected outright.
 */
export function parseTerritoryRequest(
  body: unknown,
): { ok: true; value: TerritoryRequest } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const extra = Object.keys(body).filter((k) => k !== "changes" && k !== "expected");
  if (extra.length) {
    return { ok: false, error: `Unexpected field(s): ${extra.join(", ")}` };
  }
  const { changes, expected } = body;
  if (!isObject(changes) || !isObject(expected)) {
    return { ok: false, error: "changes and expected must be objects." };
  }
  const allowed = TERRITORY_PROPERTIES as readonly string[];
  const bad = [...Object.keys(changes), ...Object.keys(expected)].filter((k) => !allowed.includes(k));
  if (bad.length) {
    return { ok: false, error: `Not a writable property: ${[...new Set(bad)].join(", ")}` };
  }
  const out: TerritoryChanges = {};
  for (const p of TERRITORY_PROPERTIES) {
    if (!(p in changes)) {
      continue;
    }
    const v = changes[p];
    if (typeof v !== "string" || !v.trim()) {
      return { ok: false, error: `${PROPERTY_LABEL[p]} must be a non-empty string.` };
    }
    out[p] = v;
  }
  if (!Object.keys(out).length) {
    return { ok: false, error: "Nothing to change." };
  }
  const exp = {} as TerritoryValues;
  for (const p of TERRITORY_PROPERTIES) {
    const v = expected[p];
    if (typeof v !== "string") {
      return { ok: false, error: `expected.${p} must be a string.` };
    }
    exp[p] = v;
  }
  return { ok: true, value: { changes: out, expected: exp } };
}

/** Error message if any change is not one of the property's live HubSpot options, else null. */
export function invalidOption(changes: TerritoryChanges, options: TerritoryOptions): string | null {
  for (const p of TERRITORY_PROPERTIES) {
    const v = changes[p];
    if (v !== undefined && !options[p].some((o) => o.value === v)) {
      return `"${v}" is not a ${PROPERTY_LABEL[p]} option in HubSpot.`;
    }
  }
  return null;
}

/**
 * The only PATCH body the territory write sends. Built key by key from the allowlist, so a
 * stray key on `changes` can never reach HubSpot.
 */
export function territoryPatchBody(changes: TerritoryChanges): { properties: TerritoryChanges } {
  const properties: TerritoryChanges = {};
  for (const p of TERRITORY_PROPERTIES) {
    if (changes[p] !== undefined) {
      properties[p] = changes[p];
    }
  }
  return { properties };
}
