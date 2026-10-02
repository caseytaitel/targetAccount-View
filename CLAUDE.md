# Workflow
- Default assumption: this is going into production and will be maintained.
  Write it with error handling, tests, and clear structure.

# HubSpot write rules (non-negotiable)
- The ONLY HubSpot company properties this app may write are `notes`, `territory` and
  `territory_status` (territory pair approved by Casey on 2026-10-01 for the Data Hygiene tab).
  `lib/hubspot.ts` exposes exactly two mutating functions:
  - `appendCompanyNote`: PATCH body from `notesPatchBody`, `notes` as the only key.
  - `setCompanyTerritory`: PATCH body from `territoryPatchBody` (`lib/territory.ts`), built key by
    key from `TERRITORY_PROPERTIES`; every value must be a live HubSpot option.
  Do not add a generic update helper or widen either allowlist without Casey's approval.
- Never write without explicit user confirmation in the UI: the only client callers are the
  confirm button in `components/ConfirmWriteModal.tsx` (used by NotesDrawer and HygieneTable).
- Tier, Outreach Owner/Status and Revisit live in Redis (`lib/state.ts`), never HubSpot.
  Moving them is the flagged next step in README.md and needs Casey's approval first.
- The token's write scope covers every company property, so the code is the guard. Tests in
  `tests/hubspot-write.test.ts` lock this down; keep them passing.
- Never read `.env.local` directly. Load `HUBSPOT_TOKEN` through the environment.

# Data scope
- Population and bucket rules live in `lib/config.ts` / `lib/accounts.ts` and are documented
  in `DATA.md`. Before adding a filter that implies data exists, check that
  `searchTargetAccounts` actually fetches it.

# Docs
- After any feature or meaningful change, update README.md, DATA.md (lineage) and DESIGN.md (UX decisions).
