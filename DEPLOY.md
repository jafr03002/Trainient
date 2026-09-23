# Deploying Trainient (Vercel + Neon + Clerk)

Trainient deploys as a single Vercel project: the Vite SPA served as static
files, and the Express API as one serverless function at `/api/*` (same origin,
so no CORS in play). Postgres is Neon; auth is Clerk.

## One-time setup

### 1. Neon (database)
- Create a Neon project. From **Connection Details** copy two URLs:
  - **pooled** (host contains `-pooler`) — used at runtime as `DATABASE_URL`
  - **direct** (no `-pooler`) — used only to run migrations
- Create the tables by running the migrations. **Nothing in the Vercel build
  does this** - the build only compiles the API and the frontend, so if you skip
  this step the deploy will succeed, `/api/healthz` will return 200, and every
  route that touches the database will 500. See
  [Changing the database schema](#changing-the-database-schema) below for the
  command and the rules; the short version is:
  ```powershell
  $env:DATABASE_URL = "<direct url>"
  pnpm --filter @workspace/db run migrate
  Remove-Item Env:\DATABASE_URL
  ```
  Use the **direct** URL here, not the pooled one - schema changes over Neon's
  pooled connection are unreliable. Re-run after any change to
  `lib/db/src/schema/` (again, deploying does not do it for you).

### 2. Clerk (auth)
- Create a Clerk application. A **development** instance works on any
  `*.vercel.app` URL with no DNS; a **production** instance is needed only for a
  custom domain (and requires a CNAME).
- Copy the **Publishable key** (`pk_…`) and **Secret key** (`sk_…`).

### 3. Vercel (hosting)
- Import the GitHub repo. **Root Directory: repo root (`./`)**, **Framework
  preset: Other** (the build is driven by `vercel.json`).
- Set the **Production Branch** to whichever branch carries this setup
  (`main`, or `alpha` for the lean public build).
- Add the environment variables below, then deploy.

## Environment variables (set in Vercel)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL | runtime DB |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk `pk_…` | frontend (inlined at build) |
| `CLERK_PUBLISHABLE_KEY` | Clerk `pk_…` | backend |
| `CLERK_SECRET_KEY` | Clerk `sk_…` | backend |
| `ANTHROPIC_API_KEY` | Anthropic key | required only if AI is on |
| `AI_MODE_ENABLED` | `true` | omit to keep AI off (the alpha build) |
| `STRIPE_SECRET_KEY` | Stripe key | required only if billing is on |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | required only if billing is on |
| `CORS_ALLOWED_ORIGINS` | comma-separated | only for genuine cross-origin callers |
| `APP_URL` | deploy URL | fallback for Stripe billing return_url |

`VITE_*` variables are read at **build** time (Vite inlines them), so they must
be set in Vercel before the build runs. Changing one later has no effect until
you redeploy - there is no bundle to update otherwise. `vite.config.ts` fails
the build outright if `VITE_CLERK_PUBLISHABLE_KEY` is missing, because the
alternative is a build that succeeds and then serves a blank page.

## Package manager (why the install command is pinned)

`vercel.json` pins the install step to `npx --yes pnpm@10.34.5`. This is not
cosmetic. Vercel picks a pnpm version by reading `lockfileVersion` from
`pnpm-lock.yaml`, and `9.0` maps to "pnpm 9 **or** 10" - it will not say which
in advance. That matters because this repo keeps `overrides` in
`pnpm-workspace.yaml`, which is the pnpm 10+ location; pnpm 9 only looks for
`pnpm.overrides` in `package.json`, finds none, and aborts the install:

```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
The current "overrides" configuration doesn't match the value found in the lockfile
```

Pinning removes the coin flip. `minimumReleaseAge` in `pnpm-workspace.yaml` is
also pnpm 10.16+ only, so pnpm 9 would silently drop that supply-chain guard.

Note that Vercel supports **pnpm 6-10 only** - do not pin a pnpm 11 version
here. The matching `packageManager` field in `package.json` keeps local
development on the same version (pnpm manages this itself), so the lockfile
never gets rewritten by a version Vercel cannot run.

## How the build works
- `vercel.json` runs `pnpm run vercel-build`, which builds the API bundle
  (`artifacts/api-server/dist/app.cjs`, a self-contained Express app - CommonJS
  because Vercel compiles the function entry to CommonJS, which cannot
  `require()` an ES module) and the
  frontend (`artifacts/traintent/dist/public`).
- `api/index.ts` is the serverless function, reached via the `/api/(.*)` rewrite
  in `vercel.json`. Both halves are required: a catch-all `api/[...path].ts`
  without that rewrite serves single-segment paths (`/api/profile`) but returns
  Vercel's own NOT_FOUND for nested ones (`/api/programs/current`), and because
  the request is rejected before the function runs, nothing appears in the
  runtime logs. It re-exports that bundle so
  Vercel never has to resolve the pnpm workspace graph.
- Non-`/api` routes fall back to `index.html` for client-side routing.
- `vercel.json` sets `maxDuration: 300` for `api/index.ts`. That ceiling covers
  the blocking AI endpoints (`POST /programs/generate`, `POST /checkins`) and,
  more importantly, the async AI jobs: a job endpoint answers `202 { jobId }`
  and then finishes the Claude call in the same invocation, held open past the
  response by Vercel's `waitUntil` (see `artifacts/api-server/src/lib/aiJobs.ts`,
  which explains the choice and the alternatives). A job still unfinished six
  minutes after it was created is reported to the client as failed, so the
  ceiling here and that timeout have to move together.

## Changing the database schema

The schema is versioned as **migrations** under `lib/db/migrations/`
(`0000_baseline.sql` is the schema as it stood when the project moved off
`drizzle-kit push`). A deployed app binary can be months older than the server,
so migrations are additive: add columns and tables, don't rename or drop
anything a released client still reads.

The flow, from the repo root:

1. Edit `lib/db/src/schema/`, and export any new table from
   `lib/db/src/schema/index.ts` - the drizzle config reads the index, so a table
   that isn't exported is invisible to both the app and the migration.
2. Generate the migration (no database needed, but the config still insists on
   `DATABASE_URL` being set to something):
   ```powershell
   $env:DATABASE_URL = "postgresql://traintent:traintent@localhost:5432/traintent"
   pnpm --filter @workspace/db run generate
   ```
3. Read the generated SQL before committing it, and commit it with the schema
   change.
4. Apply it - locally, then to Neon with the **direct** URL:
   ```powershell
   $env:DATABASE_URL = "<direct url>"
   pnpm --filter @workspace/db run migrate
   Remove-Item Env:\DATABASE_URL
   ```
   Always clear the variable afterwards, or it shadows your local `.env` for the
   rest of the session.

`migrate` records each applied file in `drizzle.__drizzle_migrations`, so it is
safe to re-run; a second run does nothing. An **existing** database (production,
or any dev database originally built by `push`) needs no special baselining
step: `0000_baseline.sql` is written entirely as `IF NOT EXISTS`, so on such a
database it no-ops and simply records itself, and later migrations then apply
normally. Never edit a migration that has been applied - drizzle hashes them.

On Windows, `pnpm --filter … run <script>` can fail because the root
`preinstall` guard needs `sh`. If it does, call drizzle-kit directly:

```powershell
cd lib/db
node ..\..\node_modules\.pnpm\drizzle-kit@0.31.10\node_modules\drizzle-kit\bin.cjs migrate --config ./drizzle.config.ts
```

### `push` is no longer the deployment path
`pnpm --filter @workspace/db run push` still exists, for throwaway local
databases only. It diffs the schema against the live database rather than
replaying history, so against a deployed database it will offer to drop
anything not in the schema - including the two orphan tables described below.
Two known landmines if you do use it: it needs a TTY when one table both drops
and adds a column (`--force` does **not** skip that prompt - apply that shape as
explicit DDL in psql instead), and it perpetually re-applies `SET DEFAULT '{}'`
on the `user_profiles` array columns, which is a harmless idempotency quirk and
not real drift.

### Two orphan tables
`conversations` and `messages` exist in `lib/db/src/schema/` but are not
exported from its `index.ts`, and nothing in the app reads or writes them. The
old drizzle config globbed the whole directory, so `push` created both tables in
every database it built. The migration config points at the index instead, so
they are **not** in the baseline and a newly migrated database does not get
them; databases that already have them keep them, untouched and unused. If they
are confirmed dead, drop them in their own migration.

## Local development
- API: `pnpm --filter @workspace/api-server run dev` (needs `DATABASE_URL`,
  `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `PORT` in
  `artifacts/api-server/.env`).
- Frontend: `pnpm --filter @workspace/traintent run dev` (needs
  `VITE_CLERK_PUBLISHABLE_KEY` in `artifacts/traintent/.env`); it proxies
  `/api` to `http://localhost:8080`.

## Rotating the Neon password
Neon Console → **Roles** → `neondb_owner` → **Reset password**. Non-destructive
(data untouched); afterwards update `DATABASE_URL` in Vercel (and any local
`.env`). Safe to do any time.
