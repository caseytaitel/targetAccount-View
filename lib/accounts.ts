/**
 * Raw HubSpot company -> Account, plus the tab bucketing and Company Tags rules.
 * Pure functions only: no network, so every rule here is unit-tested.
 */

import {
  HIRING_FIELDS,
  IN_TERRITORY,
  OUT_OF_TERRITORY_STATUSES,
  OUT_TAB,
  TAGS,
  TERRITORIES,
  type TabKey,
  type TagKey,
  recordUrl,
} from "./config";

export type RawProps = Record<string, string | null | undefined>;

export type Tag = {
  key: TagKey;
  label: string;
  /** Tooltip lines. Values only: no property-name lead-in (Casey, 2026-10-01). */
  lines: string[];
};

export type Account = {
  id: string;
  name: string;
  url: string;
  ownerId: string;
  ownerName: string;
  industry: string;
  employees: number | null;
  territory: string;
  territoryStatus: string;
  notes: string;
  tags: Tag[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Some company names arrive HTML-escaped from enrichment imports ("Bain &amp; Company").
 * React escapes on render, so decode here or the entity shows literally.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function text(value: string | null | undefined): string {
  return decodeEntities((value ?? "").trim());
}

function int(value: string | null | undefined): number {
  const n = Number.parseFloat(text(value));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Splits a multi-value string on ";" (HubSpot multi-checkbox and events_attended). */
export function splitList(value: string | null | undefined): string[] {
  return text(value)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "COMPUTER_SOFTWARE" -> "Computer Software", used when no label is known. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * HubSpot date properties arrive as "YYYY-MM-DD" from search, but older values
 * can come back as epoch milliseconds. Returns e.g. "Sep 28, 2026", or "" if unparseable.
 */
export function formatDate(value: string | null | undefined): string {
  const raw = text(value);
  if (!raw) {
    return "";
  }
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    date = new Date(Date.UTC(y, m - 1, d));
  } else if (/^\d+$/.test(raw)) {
    date = new Date(Number(raw));
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function companyTags(p: RawProps): Tag[] {
  const lines: Record<TagKey, string[]> = { intent: [], hiring: [], event: [], web: [] };

  lines.intent = splitList(p.competitor_intent);

  for (const [prop, label] of HIRING_FIELDS) {
    const n = int(p[prop]);
    if (n > 0) {
      lines.hiring.push(`${label} · ${n}`);
    }
  }

  lines.event = splitList(p.events_attended);

  const visits = int(p.web_visit_count_cr);
  if (visits > 0) {
    const last = formatDate(p.last_web_visit_cr);
    const count = `${visits} visit${visits === 1 ? "" : "s"}`;
    lines.web = [last ? `${count} · last ${last}` : count];
  }

  return TAGS.filter((t) => lines[t.key].length > 0).map((t) => ({ key: t.key, label: t.label, lines: lines[t.key] }));
}

export function toAccount(
  id: string,
  p: RawProps,
  ownerNames: Map<string, string>,
  industryLabels: Map<string, string>,
): Account {
  const ownerId = text(p.hubspot_owner_id);
  const industry = text(p.industry);
  const employees = text(p.numberofemployees);
  return {
    id,
    name: text(p.name) || `Company ${id}`,
    url: recordUrl(id),
    ownerId,
    ownerName: ownerNames.get(ownerId) ?? (ownerId ? `Owner ${ownerId}` : ""),
    industry: industry ? (industryLabels.get(industry) ?? humanizeEnum(industry)) : "",
    employees: employees ? int(employees) : null,
    territory: text(p.territory),
    territoryStatus: text(p.territory_status),
    notes: p.notes ?? "",
    tags: companyTags(p),
  };
}

/**
 * Which top-level tab an account belongs to, or null if it fits none
 * (shown as the quiet "unmapped" flag so nothing silently disappears).
 *
 * - Out of Territory: territory_status is Out of territory or Approved holdover,
 *   whatever the territory says.
 * - Territory tab: territory is one of the four (TERRITORIES) and territory_status is In territory or
 *   blank. Blank-status rows carry a quiet "status not set" flag (statusMissing). On
 *   2026-10-01, 52 of 309 accounts had a blank status; hiding them would have dropped a
 *   sixth of the book from view.
 */
export function bucket(a: Pick<Account, "territory" | "territoryStatus">): TabKey | null {
  if ((OUT_OF_TERRITORY_STATUSES as readonly string[]).includes(a.territoryStatus)) {
    return OUT_TAB;
  }
  const statusOk = a.territoryStatus === IN_TERRITORY || a.territoryStatus === "";
  if (statusOk && (TERRITORIES as readonly string[]).includes(a.territory)) {
    return a.territory as TabKey;
  }
  return null;
}

/** 19000 -> "19k", 5250 -> "5.3k", 850 -> "850". */
export function compactCount(n: number | null): string {
  if (n === null) {
    return "";
  }
  if (n < 1000) {
    return String(n);
  }
  const k = n / 1000;
  const shown = k < 10 ? k.toFixed(1) : k.toFixed(0);
  return `${shown.replace(/\.0$/, "")}k`;
}
