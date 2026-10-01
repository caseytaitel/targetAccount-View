import { describe, expect, it } from "vitest";

import { MemoryStore, isValidCompanyId, parseStateUpdate } from "@/lib/state";

describe("parseStateUpdate", () => {
  it("accepts each allowed field and value", () => {
    expect(parseStateUpdate({ field: "tier", value: "A" }).ok).toBe(true);
    expect(parseStateUpdate({ field: "outreach_owner", value: "Jeff" }).ok).toBe(true);
    expect(parseStateUpdate({ field: "outreach_status", value: "Meeting scheduled" }).ok).toBe(true);
    expect(parseStateUpdate({ field: "revisit_on", value: "2026-11-15" }).ok).toBe(true);
  });

  it("allows clearing any field with an empty string", () => {
    expect(parseStateUpdate({ field: "tier", value: "" }).ok).toBe(true);
    expect(parseStateUpdate({ field: "revisit_on", value: "" }).ok).toBe(true);
  });

  it("rejects unknown fields, values, extra keys and bad dates", () => {
    expect(parseStateUpdate({ field: "notes", value: "x" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "tier", value: "D" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "outreach_owner", value: "Pete" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "outreach_status", value: "Closed" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "revisit_on", value: "2026-02-30" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "revisit_on", value: "11/15/2026" }).ok).toBe(false);
    expect(parseStateUpdate({ field: "tier", value: "A", extra: 1 }).ok).toBe(false);
    expect(parseStateUpdate({ field: "tier", value: 1 }).ok).toBe(false);
  });

  it("isValidCompanyId", () => {
    expect(isValidCompanyId("54584871217")).toBe(true);
    expect(isValidCompanyId("12a")).toBe(false);
    expect(isValidCompanyId("")).toBe(false);
  });
});

describe("MemoryStore", () => {
  it("sets, stamps and clears fields", async () => {
    const s = new MemoryStore();
    const row = await s.setField("1", "tier", "B", "casey");
    expect(row.tier).toBe("B");
    expect(row.updated_by).toBe("casey");
    await s.setField("1", "outreach_owner", "John", "john");
    const cleared = await s.setField("1", "tier", "", "jeff");
    expect(cleared.tier).toBeUndefined();
    expect(cleared.outreach_owner).toBe("John");
    expect(await s.getAll(["1", "2"])).toEqual({ "1": cleared });
  });
});
