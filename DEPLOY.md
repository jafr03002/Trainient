# Deploying Trainient (Vercel + Neon + Clerk)

Trainient deploys as a single Vercel project: the Vite SPA served as static
files, and the Express API as one serverless function at `/api/*` (same origin,
so no CORS in play). Postgres is Neon; auth is Clerk.

## One-time setup

### 1. Neon (database)
- Create a Neon project. From **Connection Details** copy two URLs:
  - **pooled** (host contains `-pooler`) — used at runtime as `DATABASE_URL`
  - **direct** (no `-pooler`) — used only to run migrations
- Create the tables:
  ```
  DATABASE_URL="<direct url>" pnpm --filter @workspace/db run push
  ```

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
be set in Vercel before the build runs.

## How the build works
- `vercel.json` runs `pnpm run vercel-build`, which builds the API bundle
  (`artifacts/api-server/dist/app.mjs`, a self-contained Express app) and the
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
