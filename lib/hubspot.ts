/**
 * HubSpot I/O. Server-side only: it reads HUBSPOT_TOKEN, which must never reach the browser.
 *
 * WRITE RULE: this module exposes exactly two mutating calls:
 *   - appendCompanyNote(): PATCH body from notesPatchBody(), `notes` as the only key.
 *   - setCompanyTerritory(): PATCH body from territoryPatchBody(), `territory` and/or
 *     `territory_status` only, each checked against the property's live HubSpot options.
 * There is deliberately no generic "update company" helper. The token's write scope covers
 * every company property, so this file is the guard. See CLAUDE.md before adding anything that writes.
 *
 * Retry/backoff ported from the CRO dash (cro_kpi/hubspot.py _send/_backoff_seconds).
 */

import {
  CACHE_TTL_MS,
  COMPANY_PROPERTIES,
  HUBSPOT_API,
  OWNER_IDS,
  TERRITORY_PROPERTIES,
  WRITABLE_PROPERTY,
} from "./config";
import { formatEntry, prependEntry, sameNotes, today, withinLimit } from "./notes";
import {
  type EnumOption,
  type TerritoryChanges,
  type TerritoryOptions,
  type TerritoryValues,
  invalidOption,
  territoryPatchBody,
} from "./territory";
import type { RawProps } from "./accounts";

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HubSpotError";
  }
}

/** Someone changed `notes` in HubSpot after the drawer loaded it. */
export class NotesConflictError extends Error {
  constructor(readonly current: string) {
    super("Notes changed in HubSpot since they were loaded.");
    this.name = "NotesConflictError";
  }
}

/** Someone changed `territory` / `territory_status` in HubSpot after the row was loaded. */
export class TerritoryConflictError extends Error {
  constructor(readonly current: TerritoryValues) {
    super("Territory changed in HubSpot since it was loaded.");
    this.name = "TerritoryConflictError";
  }
}

function token(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) {
    throw new HubSpotError("HUBSPOT_TOKEN is not set.", 500);
  }
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function backoffMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const s = Number.parseFloat(retryAfter);
    if (Number.isFinite(s)) {
      return Math.min(s * 1000, BACKOFF_CAP_MS);
    }
  }
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  return delay * (0.5 + Math.random() / 2);
}

/** One request, retried on rate limits and transient 5xx. Auth failures fail fast. */
async function send(method: "GET" | "POST" | "PATCH", path: string, action: string, body?: unknown): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const final = attempt === MAX_ATTEMPTS - 1;
    let resp: Response;
    try {
      resp = await fetch(`${HUBSPOT_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      if (final) {
        throw new HubSpotError(`HubSpot ${action} failed: ${(err as Error).message}`, 502);
      }
      await sleep(backoffMs(null, attempt));
      continue;
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new HubSpotError(`HubSpot ${action}: token rejected (check HUBSPOT_TOKEN scopes).`, 502);
    }
    if (RETRY_STATUSES.has(resp.status)) {
      if (final) {
        throw new HubSpotError(`HubSpot ${action}: HTTP ${resp.status} after ${MAX_ATTEMPTS} attempts.`, 503);
      }
      await sleep(backoffMs(resp.headers.get("Retry-After"), attempt));
      continue;
    }
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      throw new HubSpotError(`HubSpot ${action}: HTTP ${resp.status} ${detail}`, resp.status === 404 ? 404 : 502);
    }
    return resp;
  }
  throw new HubSpotError(`HubSpot ${action} failed.`, 502); // unreachable
}

export type RawCompany = { id: string; properties: RawProps };

/** All target accounts owned by the in-scope owners. No date filter. */
export async function searchTargetAccounts(): Promise<RawCompany[]> {
  const out: RawCompany[] = [];
  let after: string | undefined;
  do {
    const resp = await send("POST", "/crm/v3/objects/companies/search", "company search", {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_is_target_account", operator: "EQ", value: "true" },
            { propertyName: "hubspot_owner_id", operator: "IN", values: [...OWNER_IDS] },
          ],
        },
      ],
      properties: [...COMPANY_PROPERTIES],
      sorts: [{ propertyName: "name", direction: "ASCENDING" }],
      limit: 200,
      ...(after ? { after } : {}),
    });
    const data = (await resp.json()) as {
      results: { id: string; properties: RawProps }[];
      paging?: { next?: { after?: string } };
    };
    for (const r of data.results) {
      out.push({ id: String(r.id), properties: r.properties });
    }
    after = data.paging?.next?.after;
  } while (after);
  return out;
}

const ownerCache = new Map<string, string>();

/** Owner ID -> "First Last". Falls back to archived owners, then to the raw ID. */
export async function getOwnerNames(ids: Iterable<string>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const id of new Set(ids)) {
    if (!id) {
      continue;
    }
    if (!ownerCache.has(id)) {
      let name = "";
      for (const archived of [false, true]) {
        try {
          const resp = await send("GET", `/crm/v3/owners/${encodeURIComponent(id)}?archived=${archived}`, "owner lookup");
          const o = (await resp.json()) as { firstName?: string; lastName?: string; email?: string };
          name = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || "";
          break;
        } catch (err) {
          if (!(err instanceof HubSpotError && err.status === 404)) {
            throw err;
          }
        }
      }
      ownerCache.set(id, name || `Owner ${id}`);
    }
    result.set(id, ownerCache.get(id)!);
  }
  return result;
}

let industryCache: Map<string, string> | null = null;

/** industry enum value -> label. Empty map on failure (the UI humanizes the raw value instead). */
export async function getIndustryLabels(): Promise<Map<string, string>> {
  if (industryCache) {
    return industryCache;
  }
  try {
    const resp = await send("GET", "/crm/v3/properties/companies/industry", "industry labels");
    const data = (await resp.json()) as { options?: { value: string; label: string }[] };
    industryCache = new Map((data.options ?? []).map((o) => [o.value, o.label]));
  } catch {
    return new Map();
  }
  return industryCache;
}

/** Current `notes` value for one company ("" when empty). */
export async function getCompanyNotes(companyId: string): Promise<string> {
  const resp = await send(
    "GET",
    `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=${WRITABLE_PROPERTY}`,
    "notes read",
  );
  const data = (await resp.json()) as { properties?: RawProps };
  return data.properties?.[WRITABLE_PROPERTY] ?? "";
}

/** The only PATCH body this app ever sends to HubSpot. */
export function notesPatchBody(value: string): { properties: { notes: string } } {
  return { properties: { [WRITABLE_PROPERTY]: value } } as { properties: { notes: string } };
}

/**
 * Prepend a dated entry to a company's `notes`. Re-reads the live value first and refuses
 * (NotesConflictError) if it no longer matches what the user was shown, so one person's
 * note never silently overwrites another's. Returns the value written.
 */
export async function appendCompanyNote(
  companyId: string,
  entryText: string,
  expectedCurrent: string,
  user: string,
  now: Date = new Date(),
): Promise<string> {
  if (!/^\d+$/.test(companyId)) {
    throw new HubSpotError("Invalid company id.", 400);
  }
  const current = await getCompanyNotes(companyId);
  if (!sameNotes(current, expectedCurrent)) {
    throw new NotesConflictError(current);
  }
  const next = prependEntry(current, formatEntry(user, today(now), entryText));
  if (!withinLimit(next)) {
    throw new HubSpotError("Notes would exceed HubSpot's 65,536-character limit.", 400);
  }
  const resp = await send(
    "PATCH",
    `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`,
    "notes write",
    notesPatchBody(next),
  );
  const data = (await resp.json()) as { properties?: RawProps };
  return data.properties?.[WRITABLE_PROPERTY] ?? next;
}

let optionsCache: { at: number; options: TerritoryOptions } | null = null;

/** Live enum options for `territory` and `territory_status` (cached CACHE_TTL_MS). Throws on failure. */
export async function getTerritoryOptions(force = false): Promise<TerritoryOptions> {
  if (!force && optionsCache && Date.now() - optionsCache.at < CACHE_TTL_MS) {
    return optionsCache.options;
  }
  const entries = await Promise.all(
    TERRITORY_PROPERTIES.map(async (p) => {
      const resp = await send("GET", `/crm/v3/properties/companies/${p}`, `${p} options`);
      const data = (await resp.json()) as { options?: (EnumOption & { hidden?: boolean })[] };
      const opts = (data.options ?? []).filter((o) => !o.hidden).map((o) => ({ value: o.value, label: o.label }));
      return [p, opts] as const;
    }),
  );
  const options = Object.fromEntries(entries) as TerritoryOptions;
  optionsCache = { at: Date.now(), options };
  return options;
}

/** Current `territory` and `territory_status` for one company ("" when empty). */
export async function getCompanyTerritory(companyId: string): Promise<TerritoryValues> {
  const resp = await send(
    "GET",
    `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=${TERRITORY_PROPERTIES.join(",")}`,
    "territory read",
  );
  const data = (await resp.json()) as { properties?: RawProps };
  return {
    territory: (data.properties?.territory ?? "").trim(),
    territory_status: (data.properties?.territory_status ?? "").trim(),
  };
}

/**
 * Set `territory` and/or `territory_status` on one company (Data Hygiene tab). Every value must
 * be a live HubSpot option. Re-reads both properties first and refuses (TerritoryConflictError)
 * if either no longer matches what the user was shown. Returns both values after the write.
 */
export async function setCompanyTerritory(
  companyId: string,
  changes: TerritoryChanges,
  expected: TerritoryValues,
): Promise<TerritoryValues> {
  if (!/^\d+$/.test(companyId)) {
    throw new HubSpotError("Invalid company id.", 400);
  }
  const body = territoryPatchBody(changes);
  if (!Object.keys(body.properties).length) {
    throw new HubSpotError("Nothing to change.", 400);
  }
  const bad = invalidOption(changes, await getTerritoryOptions());
  if (bad) {
    throw new HubSpotError(bad, 400);
  }
  const current = await getCompanyTerritory(companyId);
  if (TERRITORY_PROPERTIES.some((p) => current[p] !== expected[p].trim())) {
    throw new TerritoryConflictError(current);
  }
  const resp = await send("PATCH", `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`, "territory write", body);
  const data = (await resp.json()) as { properties?: RawProps };
  return {
    territory: (data.properties?.territory ?? body.properties.territory ?? current.territory).trim(),
    territory_status: (data.properties?.territory_status ?? body.properties.territory_status ?? current.territory_status).trim(),
  };
}
