import { describe, expect, it } from "vitest";

import { bucket, companyTags, compactCount, formatDate, humanizeEnum, toAccount } from "@/lib/accounts";

describe("bucket", () => {
  it("puts In territory accounts on their territory tab", () => {
    expect(bucket({ territory: "Northeast", territoryStatus: "In territory" })).toBe("Northeast");
    expect(bucket({ territory: "NY / NJ", territoryStatus: "In territory" })).toBe("NY / NJ");
    expect(bucket({ territory: "Mid-Atlantic", territoryStatus: "In territory" })).toBe("Mid-Atlantic");
  });

  it("sends Out of territory and Approved holdover to the Out tab whatever the territory", () => {
    expect(bucket({ territory: "Northeast", territoryStatus: "Out of territory" })).toBe("out");
    expect(bucket({ territory: "Southeast", territoryStatus: "Approved holdover" })).toBe("out");
    expect(bucket({ territory: "", territoryStatus: "Out of territory" })).toBe("out");
  });

  it("sends former territories (Northwest) to the Out tab whatever the status", () => {
    expect(bucket({ territory: "Northwest", territoryStatus: "In territory" })).toBe("out");
    expect(bucket({ territory: "Northwest", territoryStatus: "" })).toBe("out");
  });

  it("keeps a blank-status account on its territory tab", () => {
    expect(bucket({ territory: "Northeast", territoryStatus: "" })).toBe("Northeast");
  });

  it("leaves accounts that fit no tab unmapped", () => {
    expect(bucket({ territory: "Southeast", territoryStatus: "In territory" })).toBeNull();
    expect(bucket({ territory: "North Central", territoryStatus: "" })).toBeNull();
    expect(bucket({ territory: "", territoryStatus: "" })).toBeNull();
  });
});

describe("companyTags", () => {
  it("lists values only, with no property-name lead-in", () => {
    const tags = companyTags({
      competitor_intent: "Data Lake;Splunk",
      common_room_hiring_for_ciso: "2",
      common_room_hiring_for_soc_team: "0",
      common_room_hiring_for_soc_leaders: "3",
      hiring_for_data_architects: "1",
      events_attended:
        "CyAlliance - Black Hat Party  - LV - 08/05/26; Zero Networks - Black Hat USA Happy Hour - LV - 08/04/26",
      web_visit_count_cr: "3",
      last_web_visit_cr: "2026-09-28",
    });
    expect(tags.map((t) => t.key)).toEqual(["intent", "hiring", "event", "web"]);
    const byKey = Object.fromEntries(tags.map((t) => [t.key, t.lines]));
    expect(byKey.intent).toEqual(["Data Lake", "Splunk"]);
    expect(byKey.hiring).toEqual(["CISO · 2", "SOC leaders · 3", "Data architects · 1"]);
    expect(byKey.event).toEqual([
      "CyAlliance - Black Hat Party  - LV - 08/05/26",
      "Zero Networks - Black Hat USA Happy Hour - LV - 08/04/26",
    ]);
    expect(byKey.web).toEqual(["3 visits · last Sep 28, 2026"]);
    for (const t of tags) {
      for (const line of t.lines) {
        expect(line).not.toMatch(/\(CR\)|Intent Signals|Hiring \(|Events Attended/);
      }
    }
  });

  it("omits tags with no data and requires web_visit_count_cr > 0", () => {
    expect(companyTags({ web_visit_count_cr: "0", last_web_visit_cr: "2026-09-28" })).toEqual([]);
    expect(companyTags({})).toEqual([]);
  });

  it("shows the visit count alone when the last-visit date is missing", () => {
    expect(companyTags({ web_visit_count_cr: "1" })[0].lines).toEqual(["1 visit"]);
  });
});

describe("formatters", () => {
  it("formatDate handles ISO dates and epoch ms", () => {
    expect(formatDate("2026-09-28")).toBe("Sep 28, 2026");
    expect(formatDate(String(Date.UTC(2026, 0, 5)))).toBe("Jan 5, 2026");
    expect(formatDate("")).toBe("");
    expect(formatDate("garbage")).toBe("");
  });

  it("compactCount", () => {
    expect(compactCount(null)).toBe("");
    expect(compactCount(850)).toBe("850");
    expect(compactCount(5250)).toBe("5.3k");
    expect(compactCount(19000)).toBe("19k");
    expect(compactCount(2000)).toBe("2k");
  });

  it("decodes HTML entities in names", () => {
    expect(toAccount("1", { name: "Bain &amp; Company" }, new Map(), new Map()).name).toBe("Bain & Company");
    expect(toAccount("1", { name: "O&#39;Neil &lt;x&gt;" }, new Map(), new Map()).name).toBe("O'Neil <x>");
  });

  it("humanizeEnum", () => {
    expect(humanizeEnum("COMPUTER_SOFTWARE")).toBe("Computer Software");
  });
});

describe("toAccount", () => {
  it("resolves owner and industry labels, falling back sensibly", () => {
    const a = toAccount(
      "123",
      { name: "Acme", hubspot_owner_id: "92943931", industry: "BANKING", numberofemployees: "19000" },
      new Map([["92943931", "Jeff Pala"]]),
      new Map(),
    );
    expect(a.ownerName).toBe("Jeff Pala");
    expect(a.industry).toBe("Banking");
    expect(a.employees).toBe(19000);
    expect(a.url).toBe("https://app.hubspot.com/contacts/47829307/record/0-2/123");
    expect(a.notes).toBe("");
  });
});
