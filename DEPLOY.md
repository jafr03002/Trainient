# Deploying Trainient (Vercel + Neon + Clerk)

Trainient deploys as a single Vercel project: the Vite SPA served as static
files, and the Express API as one serverless function at `/api/*` (same origin,
so no CORS in play). Postgres is Neon; auth is Clerk.

## One-time setup

### 1. Neon (database)
- Create a Neon project. From **Connection Details** copy two URLs:
  - **pooled** (host contains `-pooler`) — used at runtime as `DATABASE_URL`
  - **direct** (no `-pooler`) — used only to run migrations
- Create the tables. **Nothing in the Vercel build does this** - the build only
  compiles the API and the frontend, so if you skip this step the deploy will
  succeed, `/api/healthz` will return 200, and every route that touches the
  database will 500:
  ```
  DATABASE_URL="<direct url>" pnpm run db:push
  ```
  PowerShell has no inline env-var prefix, so there it is two statements (and
  the variable must be cleared afterwards, or it will shadow your local
  `.env` for the rest of the session):
  ```powershell
  $env:DATABASE_URL = "<direct url>"
  pnpm run db:push
  Remove-Item Env:\DATABASE_URL
  ```
  Use the **direct** URL here, not the pooled one - schema changes over Neon's
  pooled connection are unreliable. Re-run this command after any change to
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
| `BILLING_ENABLED` | `true` | omit to keep billing off (the alpha build) |
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
- `api/[...path].ts` is the serverless function; it re-exports that bundle so
  Vercel never has to resolve the pnpm workspace graph.
- Non-`/api` routes fall back to `index.html` for client-side routing.

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
