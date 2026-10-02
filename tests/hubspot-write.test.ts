import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotesConflictError,
  TerritoryConflictError,
  appendCompanyNote,
  notesPatchBody,
  setCompanyTerritory,
} from "@/lib/hubspot";
import { type TerritoryChanges, parseTerritoryRequest, territoryPatchBody } from "@/lib/territory";

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

const OPTIONS: Record<string, { value: string; label: string }[]> = {
  territory: [
    { value: "Northeast", label: "Northeast" },
    { value: "NY / NJ", label: "NY / NJ" },
  ],
  territory_status: [
    { value: "In territory", label: "In Territory" },
    { value: "Out of territory", label: "Out of Territory" },
  ],
};

/** Fake HubSpot for the territory write: property defs, the company read, and a PATCH echo. */
function mockTerritory(current: { territory: string | null; territory_status: string | null }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const prop = /\/crm\/v3\/properties\/companies\/(\w+)/.exec(url);
      if (prop) {
        return new Response(JSON.stringify({ name: prop[1], options: OPTIONS[prop[1]] }), { status: 200 });
      }
      if (method === "GET") {
        return new Response(JSON.stringify({ id: "1", properties: current }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "1", properties: { ...current, ...body.properties } }), { status: 200 });
    }),
  );
  return calls;
}

describe("HubSpot territory write guard", () => {
  it("territoryPatchBody keeps only territory and territory_status", () => {
    const sneaky = { territory: "Northeast", notes: "x", hubspot_owner_id: "1" } as unknown as TerritoryChanges;
    expect(territoryPatchBody(sneaky)).toEqual({ properties: { territory: "Northeast" } });
  });

  it("re-reads, then PATCHes only the changed territory properties", async () => {
    const calls = mockTerritory({ territory: "Northeast", territory_status: null });
    const values = await setCompanyTerritory(
      "123",
      { territory_status: "In territory" },
      { territory: "Northeast", territory_status: "" },
    );
    expect(values).toEqual({ territory: "Northeast", territory_status: "In territory" });
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("https://api.hubapi.com/crm/v3/objects/companies/123");
    expect(patches[0].body).toEqual({ properties: { territory_status: "In territory" } });
  });

  it("refuses a value that is not a live HubSpot option, before any company read or PATCH", async () => {
    const calls = mockTerritory({ territory: "", territory_status: "" });
    await expect(
      setCompanyTerritory("123", { territory: "Atlantis" }, { territory: "", territory_status: "" }),
    ).rejects.toThrow("not a Territory option");
    expect(calls.some((c) => c.method === "PATCH" || c.url.includes("/objects/"))).toBe(false);
  });

  it("refuses with a conflict, and never PATCHes, when HubSpot changed since the row loaded", async () => {
    const calls = mockTerritory({ territory: "NY / NJ", territory_status: null });
    await expect(
      setCompanyTerritory("123", { territory_status: "In territory" }, { territory: "Northeast", territory_status: "" }),
    ).rejects.toBeInstanceOf(TerritoryConflictError);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("rejects an empty change set and a non-numeric id without any network call", async () => {
    const calls = mockTerritory({ territory: "", territory_status: "" });
    await expect(setCompanyTerritory("123", {}, { territory: "", territory_status: "" })).rejects.toThrow(
      "Nothing to change",
    );
    await expect(
      setCompanyTerritory("1/../2", { territory: "Northeast" }, { territory: "", territory_status: "" }),
    ).rejects.toThrow("Invalid company id");
    expect(calls).toHaveLength(0);
  });
});

describe("parseTerritoryRequest", () => {
  const expected = { territory: "", territory_status: "" };

  it("accepts territory and/or territory_status", () => {
    expect(parseTerritoryRequest({ changes: { territory: "Northeast" }, expected }).ok).toBe(true);
    expect(
      parseTerritoryRequest({ changes: { territory: "Northeast", territory_status: "In territory" }, expected }).ok,
    ).toBe(true);
  });

  it("rejects any other property, extra keys, blanks and empty change sets", () => {
    expect(parseTerritoryRequest({ changes: { notes: "x" }, expected }).ok).toBe(false);
    expect(parseTerritoryRequest({ changes: { territory: "Northeast", tier: "A" }, expected }).ok).toBe(false);
    expect(parseTerritoryRequest({ changes: { territory: "Northeast" }, expected, extra: 1 }).ok).toBe(false);
    expect(parseTerritoryRequest({ changes: { territory: "" }, expected }).ok).toBe(false);
    expect(parseTerritoryRequest({ changes: {}, expected }).ok).toBe(false);
    expect(parseTerritoryRequest({ changes: { territory: "Northeast" }, expected: { territory: "" } }).ok).toBe(false);
    expect(parseTerritoryRequest([]).ok).toBe(false);
  });
});
