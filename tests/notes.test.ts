import { describe, expect, it } from "vitest";

import { displayName, formatEntry, parseNoteRequest, prependEntry, sameNotes, today } from "@/lib/notes";

describe("note formatting", () => {
  it("formats a dated, attributed entry", () => {
    expect(formatEntry("casey", "2026-10-01", "  Left VM for CISO  ")).toBe("2026-10-01 · Casey: Left VM for CISO");
    expect(displayName("john")).toBe("John");
  });

  it("prepends above existing text and keeps it verbatim", () => {
    const existing = "Old line 1\nOld line 2  ";
    expect(prependEntry(existing, "NEW")).toBe(`NEW\n\n${existing}`);
    expect(prependEntry("", "NEW")).toBe("NEW");
    expect(prependEntry("   ", "NEW")).toBe("NEW");
  });

  it("dates entries in America/New_York, not UTC", () => {
    // 02:00 UTC on Oct 2 is still Oct 1 in New York.
    expect(today(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01");
  });

  it("sameNotes ignores trailing whitespace and treats null as empty", () => {
    expect(sameNotes("a\n", "a")).toBe(true);
    expect(sameNotes(null, "")).toBe(true);
    expect(sameNotes("a", "b")).toBe(false);
  });
});

describe("parseNoteRequest", () => {
  it("accepts entry + expectedCurrent", () => {
    expect(parseNoteRequest({ entry: "hi", expectedCurrent: "" })).toEqual({
      ok: true,
      value: { entry: "hi", expectedCurrent: "" },
    });
  });

  it("rejects any other key, so the route can never carry another property", () => {
    expect(parseNoteRequest({ entry: "hi", expectedCurrent: "", properties: { name: "x" } }).ok).toBe(false);
    expect(parseNoteRequest({ entry: "hi", expectedCurrent: "", tier: "A" }).ok).toBe(false);
  });

  it("rejects empty entries and bad types", () => {
    expect(parseNoteRequest({ entry: "   ", expectedCurrent: "" }).ok).toBe(false);
    expect(parseNoteRequest({ entry: "hi" }).ok).toBe(false);
    expect(parseNoteRequest(null).ok).toBe(false);
    expect(parseNoteRequest([]).ok).toBe(false);
  });
});
