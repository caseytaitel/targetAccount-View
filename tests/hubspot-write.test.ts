import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotesConflictError, appendCompanyNote, notesPatchBody } from "@/lib/hubspot";

type Call = { url: string; method: string; body: unknown };

/** Fake HubSpot: GET returns `currentNotes`, PATCH echoes what was sent. */
function mockHubSpot(currentNotes: string | null) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (method === "GET") {
        return new Response(JSON.stringify({ id: "1", properties: { notes: currentNotes } }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "1", properties: body.properties }), { status: 200 });
    }),
  );
  return calls;
}

beforeEach(() => {
  process.env.HUBSPOT_TOKEN = "test-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HubSpot write guard", () => {
  it("notesPatchBody carries exactly one property: notes", () => {
    const body = notesPatchBody("x");
    expect(Object.keys(body)).toEqual(["properties"]);
    expect(Object.keys(body.properties)).toEqual(["notes"]);
  });

  it("re-reads, then PATCHes only `notes` with the entry prepended", async () => {
    const calls = mockHubSpot("Existing text");
    const written = await appendCompanyNote(
      "123",
      "Called CISO",
      "Existing text",
      "casey",
      new Date("2026-10-01T15:00:00Z"),
    );

    expect(written).toBe("2026-10-01 · Casey: Called CISO\n\nExisting text");
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
    const patch = calls[1];
    expect(patch.url).toBe("https://api.hubapi.com/crm/v3/objects/companies/123");
    expect(Object.keys(patch.body as object)).toEqual(["properties"]);
    expect(Object.keys((patch.body as { properties: object }).properties)).toEqual(["notes"]);
  });

  it("refuses with a conflict, and never PATCHes, when notes changed since they were loaded", async () => {
    const calls = mockHubSpot("A newer note from a teammate\n\nExisting text");
    await expect(appendCompanyNote("123", "Called CISO", "Existing text", "casey")).rejects.toBeInstanceOf(
      NotesConflictError,
    );
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("treats an empty HubSpot value (null) as matching an empty expectation", async () => {
    const calls = mockHubSpot(null);
    const written = await appendCompanyNote("123", "First", "", "jeff", new Date("2026-10-01T15:00:00Z"));
    expect(written).toBe("2026-10-01 · Jeff: First");
    expect(calls).toHaveLength(2);
  });

  it("rejects a non-numeric company id before any network call", async () => {
    const calls = mockHubSpot("");
    await expect(appendCompanyNote("123/../456", "x", "", "casey")).rejects.toThrow("Invalid company id");
    expect(calls).toHaveLength(0);
  });
});
