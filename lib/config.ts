/**
 * Every scope rule and enum in one place. DATA.md documents each of these;
 * keep the two in sync.
 */

export const PORTAL_ID = "47829307";
export const HUBSPOT_API = "https://api.hubapi.com";

export function recordUrl(companyId: string): string {
  return `https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-2/${companyId}`;
}

/** Company owners in scope (hubspot_owner_id). Names are resolved live from HubSpot. */
export const OWNER_IDS = ["92943931", "84759471"] as const; // Jeff Pala, John Greene

/** Northwest is John's former territory; it gets its own tab (Casey, 2026-10-01). */
export const TERRITORIES = ["Northeast", "NY / NJ", "Mid-Atlantic", "Northwest"] as const;
export type Territory = (typeof TERRITORIES)[number];

export const IN_TERRITORY = "In territory";
/** territory_status values that send an account to the Out of Territory tab. */
export const OUT_OF_TERRITORY_STATUSES = ["Out of territory", "Approved holdover"] as const;

export const OUT_TAB = "out" as const;
export type TabKey = Territory | typeof OUT_TAB;

/* App-side state (Redis). Never written to HubSpot. See README "Flagged next step". */
export const TIERS = ["A", "B", "C"] as const;
export const OUTREACH_OWNERS = ["Casey", "John", "Jeff"] as const;
export const OUTREACH_STATUSES = [
  "Reached out, no reply",
  "They replied, no meeting",
  "Meeting scheduled",
  "Meeting completed",
] as const;

/** The one HubSpot property this app may write. Enforced in lib/hubspot.ts. */
export const WRITABLE_PROPERTY = "notes" as const;
/** HubSpot's limit for a single-line/multi-line text property. */
export const NOTES_MAX_LENGTH = 65536;

/** Notes entries are dated in the team's time zone, not the server's (UTC on Vercel). */
export const TIME_ZONE = "America/New_York";

export const COMPANY_PROPERTIES = [
  "name",
  "hubspot_owner_id",
  "industry",
  "numberofemployees",
  "territory",
  "territory_status",
  "notes",
  // Company Tags
  "competitor_intent",
  "common_room_hiring_for_ciso",
  "common_room_hiring_for_soc_team",
  "common_room_hiring_for_soc_leaders",
  "hiring_for_data_architects",
  "events_attended",
  "web_visit_count_cr",
  "last_web_visit_cr",
] as const;

/** Tag order on the page. */
export const TAGS = [
  { key: "intent", label: "Intent signals" },
  { key: "hiring", label: "Hiring signals" },
  { key: "event", label: "Event attendee" },
  { key: "web", label: "Web visitor" },
] as const;
export type TagKey = (typeof TAGS)[number]["key"];

/** Hiring-count properties and the short label each shows in the tooltip. */
export const HIRING_FIELDS = [
  ["common_room_hiring_for_ciso", "CISO"],
  ["common_room_hiring_for_soc_team", "SOC team"],
  ["common_room_hiring_for_soc_leaders", "SOC leaders"],
  ["hiring_for_data_architects", "Data architects"],
] as const;

/** Server-side cache for the HubSpot pull. The Refresh button bypasses it. */
export const CACHE_TTL_MS = 5 * 60 * 1000;
