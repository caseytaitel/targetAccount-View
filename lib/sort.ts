/**
 * Column sorting for the board. Pure, so the ordering rules are unit-tested.
 *
 * Rules: blanks always sort last whichever way the column points; ties fall back to
 * company name A→Z. Sorting applies within each tier section.
 */

import { OUTREACH_STATUSES } from "./config";
import type { Account } from "./accounts";
import type { AccountState } from "./state";

export const SORT_KEYS = [
  "name",
  "owner",
  "industry",
  "size",
  "tags",
  "territory",
  "territory_status",
  "outreach_owner",
  "outreach_status",
  "revisit",
  "notes",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type Sort = { key: SortKey; dir: SortDir };

export const DEFAULT_SORT: Sort = { key: "name", dir: "asc" };

/** First click on a column: biggest / most / newest first for these, A→Z or soonest for the rest. */
const FIRST_DIR: Partial<Record<SortKey, SortDir>> = { size: "desc", tags: "desc", notes: "desc" };

/** Clicking the active column flips it; clicking another column starts at its natural direction. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: FIRST_DIR[key] ?? "asc" };
}

export function isSort(value: unknown): value is Sort {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Sort;
  return (SORT_KEYS as readonly string[]).includes(v.key) && (v.dir === "asc" || v.dir === "desc");
}

/** Date of the newest notes entry ("YYYY-MM-DD · Name: …" is prepended, so it's the first line). */
export function latestNoteDate(notes: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(notes.trim());
  return m ? m[1] : "";
}

type Value = string | number | null;

function value(key: SortKey, a: Account, st: AccountState): Value {
  switch (key) {
    case "name":
      return a.name;
    case "owner":
      return a.ownerName || null;
    case "industry":
      return a.industry || null;
    case "size":
      return a.employees;
    case "tags":
      return a.tags.length || null;
    case "territory":
      return a.territory || null;
    case "territory_status":
      return a.territoryStatus || null;
    case "outreach_owner":
      return st.outreach_owner || null;
    case "outreach_status": {
      // Pipeline order (reached out → meeting completed), not alphabetical.
      const i = (OUTREACH_STATUSES as readonly string[]).indexOf(st.outreach_status ?? "");
      return i === -1 ? null : i;
    }
    case "revisit":
      return st.revisit_on || null;
    case "notes": {
      // Newest entry date first; undated notes after dated ones; no notes last.
      if (!a.notes.trim()) {
        return null;
      }
      return latestNoteDate(a.notes) || "0000-00-00";
    }
  }
}

export function comparator(sort: Sort, state: Record<string, AccountState>) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return (a: Account, b: Account): number => {
    const va = value(sort.key, a, state[a.id] ?? {});
    const vb = value(sort.key, b, state[b.id] ?? {});
    if (va !== vb) {
      if (va === null) {
        return 1;
      }
      if (vb === null) {
        return -1;
      }
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      if (c !== 0) {
        return c * sign;
      }
    }
    return a.name.localeCompare(b.name);
  };
}
