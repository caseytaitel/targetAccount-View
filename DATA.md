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
| *(unmapped)* | Anything else, e.g. `territory` = North Central with status `In territory`. Shown only as the footer flag "⚑ n unmapped" with names on hover |

Blank-status accounts carry a ⚑ next to the name ("Territory Status is not set").

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

## Notes write (`lib/hubspot.ts` `appendCompanyNote`)

1. Re-read `notes`. If it differs from what the drawer showed (ignoring trailing whitespace), return 409 and write nothing.
2. New value = `YYYY-MM-DD · {User}: {text}` + blank line + existing value (verbatim).
3. `PATCH /crm/v3/objects/companies/{id}` with body `{ "properties": { "notes": … } }` and nothing else.

## Verification

- `npm test`
- The tab counts plus the unmapped count equal the HubSpot total for the Population filter above.
- Spot-check: Washington Metropolitan Area Transit Authority shows Event attendee with two events.
