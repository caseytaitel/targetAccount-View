import { describe, expect, it } from "vitest";

import type { Account } from "@/lib/accounts";
import { DEFAULT_SORT, comparator, isSort, latestNoteDate, nextSort } from "@/lib/sort";
import type { AccountState } from "@/lib/state";
import { hygieneIssue, needsHygiene } from "@/lib/territory";

function acct(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    name: `Co ${id}`,
    url: "",
    ownerId: "",
    ownerName: "",
    industry: "",
    employees: null,
    territory: "",
    territoryStatus: "",
    notes: "",
    tags: [],
    ...over,
  };
}

const ids = (rows: Account[]) => rows.map((a) => a.id);

describe("nextSort", () => {
  it("flips the active column and starts others at their natural direction", () => {
    expect(nextSort(DEFAULT_SORT, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort(DEFAULT_SORT, "size")).toEqual({ key: "size", dir: "desc" });
    expect(nextSort(DEFAULT_SORT, "tags")).toEqual({ key: "tags", dir: "desc" });
    expect(nextSort(DEFAULT_SORT, "industry")).toEqual({ key: "industry", dir: "asc" });
  });

  it("isSort rejects stale or malformed saved prefs", () => {
    expect(isSort({ key: "size", dir: "desc" })).toBe(true);
    expect(isSort("name")).toBe(false);
    expect(isSort({ key: "tier", dir: "asc" })).toBe(false);
    expect(isSort(null)).toBe(false);
  });
});

describe("comparator", () => {
  it("sorts numbers numerically and keeps blanks last in both directions", () => {
    const rows = [acct("a", { employees: 900 }), acct("b"), acct("c", { employees: 19000 })];
    expect(ids([...rows].sort(comparator({ key: "size", dir: "desc" }, {})))).toEqual(["c", "a", "b"]);
    expect(ids([...rows].sort(comparator({ key: "size", dir: "asc" }, {})))).toEqual(["a", "c", "b"]);
  });

  it("breaks ties by name A to Z", () => {
    const rows = [acct("2", { name: "Zeta", industry: "Banking" }), acct("1", { name: "Alpha", industry: "Banking" })];
    expect(ids(rows.sort(comparator({ key: "industry", dir: "desc" }, {})))).toEqual(["1", "2"]);
  });

  it("orders Outreach Status by pipeline stage, not alphabetically", () => {
    const state: Record<string, AccountState> = {
      a: { outreach_status: "Meeting completed" },
      b: { outreach_status: "Reached out, no reply" },
      c: { outreach_status: "Meeting scheduled" },
    };
    const rows = [acct("a"), acct("b"), acct("c"), acct("d")];
    expect(ids(rows.sort(comparator({ key: "outreach_status", dir: "asc" }, state)))).toEqual(["b", "c", "a", "d"]);
  });

  it("sorts Notes by newest entry date, undated after dated, empty last", () => {
    const rows = [
      acct("old", { notes: "2026-08-01 · Jeff: x" }),
      acct("none"),
      acct("undated", { notes: "free text" }),
      acct("new", { notes: "2026-09-30 · Casey: y\n\n2026-01-01 · John: z" }),
    ];
    expect(ids(rows.sort(comparator({ key: "notes", dir: "desc" }, {})))).toEqual(["new", "old", "undated", "none"]);
  });

  it("latestNoteDate reads the first entry's date", () => {
    expect(latestNoteDate("2026-09-30 · Casey: y\n\n2026-01-01 · John: z")).toBe("2026-09-30");
    expect(latestNoteDate("no date")).toBe("");
  });
});

describe("needsHygiene", () => {
  it("flags a blank territory or a blank status", () => {
    expect(needsHygiene({ territory: "", territoryStatus: "" })).toBe(true);
    expect(needsHygiene({ territory: "Northeast", territoryStatus: "" })).toBe(true);
    expect(needsHygiene({ territory: "", territoryStatus: "Out of territory" })).toBe(true);
    expect(needsHygiene({ territory: "Northeast", territoryStatus: "In territory" })).toBe(false);
  });
});

describe("hygieneIssue", () => {
  it("calls any blank value missing, even when the account also fits no tab", () => {
    expect(hygieneIssue({ territory: "", territoryStatus: "" })).toBe("missing");
    expect(hygieneIssue({ territory: "Northeast", territoryStatus: "" })).toBe("missing");
    expect(hygieneIssue({ territory: "North Central", territoryStatus: "" })).toBe("missing");
  });

  it("flags In territory for a territory with no tab as a conflict", () => {
    expect(hygieneIssue({ territory: "North Central", territoryStatus: "In territory" })).toBe("conflict");
    expect(hygieneIssue({ territory: "Southwest", territoryStatus: "In territory" })).toBe("conflict");
  });

  it("leaves accounts that land on a tab alone", () => {
    expect(hygieneIssue({ territory: "Northeast", territoryStatus: "In territory" })).toBeNull();
    expect(hygieneIssue({ territory: "Northwest", territoryStatus: "In territory" })).toBeNull();
    expect(hygieneIssue({ territory: "Southwest", territoryStatus: "Out of territory" })).toBeNull();
    expect(hygieneIssue({ territory: "Southeast", territoryStatus: "Approved holdover" })).toBeNull();
  });
});
