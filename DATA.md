# Data lineage

Everything below is defined in `lib/config.ts` and implemented in `lib/accounts.ts` unless noted.
Keep this file in sync with any change to a filter, bucket or tag rule.

## Population

HubSpot company search (`lib/hubspot.ts` `searchTargetAccounts`), no date filter:

- `hs_is_target_account` = `true`
- AND `hubspot_owner_id` IN `92943931` (Jeff Pala), `84759471` (John Greene)

On 2026-10-01 this returned **309** companies.

## Tabs (`bucket()`)

| Tab | Rule |
|---|---|
| Northeast / NY / NJ / Mid-Atlantic / Northwest | `territory` is that value AND `territory_status` is `In territory` **or blank** |
| Out of Territory | `territory_status` is `Out of territory` or `Approved holdover` (any territory) |
| *(unmapped)* | Anything else, e.g. `territory` = North Central with status `In territory`. On no territory tab; all appear on Data Hygiene |

Blank-status accounts carry a ⚑ next to the name ("Territory Status is not set").

## Data Hygiene tab (`hygieneIssue()` in `lib/territory.ts`)

Not a bucket: a cross-cut of the whole population, so an account can also appear on a territory
tab (blank status). Two sections; each account sits in one, Missing first:

| Section | Rule |
|---|---|
| Missing values | `territory` is blank **or** `territory_status` is blank (`needsHygiene()`) |
| Status conflict | Both set, but `bucket()` returns null: `territory_status` = `In territory` for a territory with no tab (e.g. North Central, Southwest). 2 accounts on 2026-10-01 |

Fixing a conflict overwrites a set value (usually `territory_status` → `Out of territory`, which
moves it to Out of Territory). The same write route handles it; the confirm modal lists the value
being replaced.

Checked live in HubSpot on 2026-10-01: **58** blank `territory_status`, **1** blank `territory`
(Hawaiian Airlines, which also has a blank status), so Missing values held 58 accounts. Blank territory is
rare but does happen, so both columns are editable.

Dropdown values are the properties' live HubSpot options (`/crm/v3/properties/companies/{name}`,
hidden options dropped, cached 5 min):

- `territory`: Northeast, NY / NJ, Mid-Atlantic, Southeast, North Central, TOLA, Northwest, Southwest, Ohio Valley, Outside of US
- `territory_status`: In territory, Out of territory, Approved holdover

Snapshot on 2026-10-01 (309 total): Northeast 63, NY / NJ 83, Mid-Atlantic 90, Northwest 27 (John's former territory; 22 In territory + 5 blank status), Out of Territory 43, unmapped 3.
- 57 of the territory-tab accounts have a blank `territory_status` (43 John's, 14 Jeff's).
- The 3 unmapped accounts break down as:
  - North Central: 1
  - Southwest: 1
  - No territory: 1

## Sections inside a tab

App-side state from Redis (`lib/state.ts`), not HubSpot:

1. **Revisit later**: `revisit_on` is after today (America/New_York). The section is collapsed by default and sorted soonest first.
2. **Tier A / B / C**: from `tier`.
3. **Untiered**: no tier set. Every account starts here; `target_account_tier` is ignored.

When the revisit date arrives, the account returns to its tier and shows a "Revisit due" pill until the date is cleared.

## Columns

| Column | Source |
|---|---|
| Company Name | `name` (HTML entities decoded), linked to the HubSpot record |
| Company Owner | `hubspot_owner_id` → `/crm/v3/owners/{id}` name (falls back to archived owners) |
| Industry | `industry` → property option label; falls back to a humanized enum value |
| Size | `numberofemployees`, compact (19k), exact on hover |
| Territory / Status (Out tab only) | `territory`, `territory_status` |
| Tier, Outreach Owner, Outreach Status, Revisit | Redis hash `ta:co:{companyId}` fields `tier`, `outreach_owner`, `outreach_status`, `revisit_on` (+ `updated_by`, `updated_at`) |
| Notes | `notes` (preview); the drawer re-reads it live from HubSpot |

## Company Tags (`companyTags()`)

The tooltip lists values only, with no property-name lead-in.

| Tag | Shown when | Tooltip lines |
|---|---|---|
| Intent signals | `competitor_intent` (Intent Signals (CR)) non-empty | one topic per line, split on `;` |
| Hiring signals | any of `common_room_hiring_for_ciso`, `common_room_hiring_for_soc_team`, `common_room_hiring_for_soc_leaders`, `hiring_for_data_architects` > 0 | `CISO · 2`, `SOC team · 1`, `SOC leaders · 3`, `Data architects · 1` (counts > 0 only) |
| Event attendee | `events_attended` non-empty | one event per line, split on `;` |
| Web visitor | `web_visit_count_cr` > 0 | `3 visits · last Sep 28, 2026` (from `last_web_visit_cr`; count alone if the date is blank) |

"Target" is not a tag here because every account in scope is a target account.

## Sorting (`lib/sort.ts`)

Every column header except Tier sorts (rows are already grouped by tier). Sorting is within each
tier section. Blanks sort last in both directions; ties fall back to name A→Z.

| Column | Sorts by | First click |
|---|---|---|
| Company Name, Company Owner, Industry, Outreach Owner | text | A→Z |
| Size | `numberofemployees` | largest first |
| Company Tags | number of tags | most first |
| Territory / Status (Out tab), Territory, Territory Status (Hygiene) | `territory`, `territory_status` | A→Z |
| Outreach Status | pipeline order (Reached out → Meeting completed) | earliest stage first |
| Revisit | `revisit_on` | soonest first |
| Notes | date of the newest entry (the leading `YYYY-MM-DD`); undated text after dated; empty last | newest first |

The Revisit later section always sorts soonest first.

## Notes write (`lib/hubspot.ts` `appendCompanyNote`)

1. Re-read `notes`. If it differs from what the drawer showed (ignoring trailing whitespace), return 409 and write nothing.
2. New value = `YYYY-MM-DD · {User}: {text}` + blank line + existing value (verbatim).
3. `PATCH /crm/v3/objects/companies/{id}` with body `{ "properties": { "notes": … } }` and nothing else.

## Territory write (`lib/hubspot.ts` `setCompanyTerritory`)

1. The request may carry only `territory` and/or `territory_status`, each non-empty (this fills gaps; it never clears).
2. Each value must be a live option of its HubSpot property, or 400 and nothing is written.
3. Re-read both properties. If either differs from what the row showed, return 409, write nothing, and the row updates to the latest values.
4. `PATCH /crm/v3/objects/companies/{id}` with body `{ "properties": { … } }` holding only the changed territory keys.

## Verification

- `npm test`
- The header shows each owner's count and the total; the owner counts sum to the total.
- The tab counts plus the unmapped accounts (`bucket()` returns null) equal the HubSpot total for the Population filter above.
- Spot-check: Washington Metropolitan Area Transit Authority shows Event attendee with two events.
- Missing values count equals a HubSpot search of the Population filter with `territory` or `territory_status` unknown.
- Status conflict count equals the accounts with both values set where `bucket()` returns null.
