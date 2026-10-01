# Workflow
- Default assumption: this is going into production and will be maintained.
  Write it with error handling, tests, and clear structure.

# HubSpot write rules (non-negotiable)
- The ONLY HubSpot property this app may write is company `notes`.
  `lib/hubspot.ts` exposes one mutating function, `appendCompanyNote`, whose PATCH body is
  built by `notesPatchBody` with `notes` as the only key. Do not add a generic update helper.
- Never write without explicit user confirmation in the UI: the only client caller is the
  confirm button in `components/ConfirmWriteModal.tsx`.
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
