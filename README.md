# Target Account View

A shared working view of HubSpot target accounts for Casey, John Greene and Jeff Pala.
Accounts are split by territory (Northeast, NY / NJ, Mid-Atlantic, Northwest, Out of Territory), then grouped into Tiers A / B / C. Each row tracks outreach
ownership, outreach status and a revisit date, and has a notes drawer that syncs with the
HubSpot company `notes` property. Every column except Tier sorts from its header.

A **Data Hygiene** tab lists accounts with a blank `territory` or `territory_status` and lets you
set them in HubSpot, one confirmed write per company. A **Data Hygiene V2** tab sits beside it for
comparison: the same rows split into "Missing values" and "Status conflict" (status In territory
for a territory with no tab). Keep one once compared.

UI conventions are copied from the CRO dash (`caseytaitel/CRO-weeklyReport`) so the two apps
read as one system. See `DESIGN.md`. Data lineage is in `DATA.md`.

## What it reads and writes

| | Where | Notes |
|---|---|---|
| Companies, owners, industry labels, territory options | HubSpot (read) | Live, cached 5 min per server instance; **Refresh** bypasses the cache |
| Company `notes` | HubSpot (write) | Appends a dated entry; only after the confirm pop-up |
| Company `territory`, `territory_status` | HubSpot (write) | Data Hygiene tabs only; values must be live HubSpot options; only after the confirm pop-up |
| Tier, Outreach Owner, Outreach Status, Revisit date | Upstash Redis | App-only; never written to HubSpot |

> ### ⚑ Flagged next step: move app-side fields into HubSpot
> Tier, Outreach Ownership, Outreach Status and Revisit date live in Redis today. They are
> visible only in this app and are not in HubSpot reports, lists or workflows. To move them:
> 1. Create four company properties in HubSpot (enum: tier A/B/C; enum: outreach owner;
>    enum: outreach status with the four values in `lib/config.ts`; date: revisit on).
> 2. Approve adding them to the app's write allowlist. Today `lib/hubspot.ts` can write
>    `notes`, `territory` and `territory_status` only, and that rule is in `CLAUDE.md`.
> 3. Backfill from Redis (`ta:co:{id}` hashes), then switch `lib/state.ts` to HubSpot.
>
> The legacy `target_account_tier` property is ignored on purpose. It hasn't been used in a long time.

## Setup

Requires Node 20+.

```bash
npm install
```

Environment variables (`.env.local` locally, Vercel project settings in production):

| Variable | Purpose |
|---|---|
| `HUBSPOT_TOKEN` | HubSpot private app token. Scopes: `crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.owners.read`. The write scope covers every company property; the app restricts itself to `notes`, `territory` and `territory_status` in code. |
| `BASIC_AUTH_USERS` | Logins, `user:password` pairs separated by `;`, e.g. `casey:…;john:…;jeff:…`. The username becomes the author of each notes entry (`casey` → "Casey"). Changing this value signs everyone out. Missing value locks everyone out (fails closed). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis for app-side state. The Vercel Marketplace Upstash integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` instead; both pairs are accepted. |

If Redis isn't configured, `npm run dev` falls back to an in-memory store. Edits are lost when the
dev server restarts, and the footer shows "⚑ dev store (not saved)". In production a missing
Redis config is an error.

## Run

```bash
npm run dev        # http://localhost:3000
npm test           # vitest: bucketing, tags, notes formatting, write guards, sorting, state validation
npm run typecheck
npm run build
```

## Deploy (Vercel)

1. Push this folder to a GitHub repo and import it in Vercel (Next.js preset, root directory = repo root).
2. Add `HUBSPOT_TOKEN` and `BASIC_AUTH_USERS` in Project → Settings → Environment Variables.
3. Install **Upstash for Redis** from the Vercel Marketplace and connect it to the project. This sets the Redis env vars.
4. Deploy, sign in, and check the tab counts against HubSpot (see "Verification" in `DATA.md`).

## Layout

```
lib/config.ts        scope rules, enums, property list (the one place to change filters)
lib/accounts.ts      raw HubSpot -> Account, tab bucketing, Company Tags (pure, tested)
lib/hubspot.ts       HubSpot client: retry/backoff, search, owners, and the ONLY two writes (notes, territory)
lib/notes.ts         note entry format + request validation (shared by client preview and server)
lib/territory.ts     Data Hygiene rules (needsHygiene, hygieneIssue), territory request validation + PATCH-body allowlist
lib/sort.ts          column sort rules (pure, tested)
lib/state.ts         Redis app state + validation
lib/load.ts          board payload (HubSpot cache + Redis state)
app/api/*            accounts (GET), state/[id] (PATCH), notes/[id] (GET, POST), territory/[id] (POST)
components/*         Board, HygieneTable, SortTh, NotesDrawer, ConfirmWriteModal
auth.ts, middleware.ts, app/login, app/logout   login, copied from the CRO dash
```
