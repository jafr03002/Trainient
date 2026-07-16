# Traintent

AI-powered gym coaching SaaS that generates personalised training programs and adjusts them weekly based on check-in data.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` - run the API server (port 8080)
- `pnpm --filter @workspace/traintent run dev` - run the frontend (port 24301)
- `pnpm run typecheck` - full typecheck across all packages
- `pnpm run build` - typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` - regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` - push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter (routing), TanStack Query, Framer Motion, Recharts, Tailwind + shadcn
- API: Express 5 + Clerk Express middleware
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (managed Replit tenant)
- AI: OpenAI GPT-4o (direct, OPENAI_API_KEY)
- Payments: Stripe (£9.99/month Pro plan)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` - DB schema tables (userProfiles, programs, workoutLogs, checkins, subscriptions)
- `lib/api-spec/openapi.yaml` - OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` - generated React Query hooks
- `lib/api-zod/src/generated/` - generated Zod schemas
- `artifacts/api-server/src/routes/` - Express route handlers
- `artifacts/traintent/src/pages/` - 9 frontend pages
- `artifacts/traintent/src/index.css` - dark-mode theme (HSL CSS variables)

## Architecture decisions

- Contract-first: OpenAPI spec → Orval codegen → typed hooks + Zod validation used end-to-end
- Clerk auth: JWT bearer token wired in `App.tsx` via `setAuthTokenGetter` + `useAuth().getToken()`; backend uses `@clerk/express` middleware
- AI programs: GPT-4o with `response_format: json_object`, structured prompt enforcing RPE/sets/reps schema
- Stripe API version: `2026-05-27.dahlia` (Stripe v22.x)
- Clerk ClerkProvider redirect props: `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl` (not `afterSignInUrl`)
- Raw body middleware for Stripe webhook must be registered before `express.json()` for the `/api/subscriptions/webhook` path
- Error handling: a global Express error handler (`artifacts/api-server/src/middlewares/errorHandler.ts`, registered last in `app.ts`) logs the full error server-side and returns only a generic `{ error }` body - 500 `Internal server error` for unexpected faults, and the original message/status (clamped to 400-599) only for http-errors-style client errors with `expose === true` (e.g. body-parser's 400 on malformed JSON); 5xx logs at error level, client 4xx at warn. Express 5 forwards rejected async handlers here automatically, so route handlers need no try/catch or async wrappers. `index.ts` adds process guards: `unhandledRejection` is logged and the server keeps serving; `uncaughtException` is logged at fatal, the logger flushed, then the process exits 1 for the process manager to restart
- Deleting a workout (`DELETE /workouts/:id`) needs no cascade cleanup - sets/exercises/notes live as embedded JSON on the row, and PRs/stats/progress charts are all computed from `workout_logs` at read time, so callers just invalidate the relevant queries after the mutation

## Product

- **Landing** - marketing page with feature highlights
- **Auth** - Clerk-hosted sign-in/sign-up with dark theme
- **Onboarding (7 steps)** - goal, experience, training days, equipment, body stats, priority muscles, review + generate
- **Dashboard** - stats (streak, week, sessions), next workout card, recent sessions, volume chart
- **My Program** - tabbed view per training day, exercise cards with RPE/sets/cue/coaching tip
- **Workout Logger** - live set tracking with weight/reps/RPE inputs, rest timer, finish + save
- **Weekly Check-in** - 5 questions (energy, sleep, soreness, completion, notes) → GPT-4o adjusts next week's program
- **Progress** - strength chart, muscle volume breakdown bar chart, personal records table
- **Calendar** - logged-session history grid; tapping a day opens a session detail modal (exercises, "Last time" hints) with a delete-session action
- **Settings** - profile edit, subscription status, Stripe checkout/portal, sign out

## User preferences

_Populate as you build - explicit user instructions worth remembering across sessions._

## Gotchas

- After adding new schema tables, run `pnpm run typecheck:libs` before leaf package typechecks (stale lib declarations)
- Stripe v22.x uses API version `2026-05-27.dahlia`, not older `basil` string
- Clerk ClerkProvider no longer has `afterSignInUrl` - use `signInFallbackRedirectUrl`
- `useCreatePortalSession` mutation takes `void` (no body), call with `mutateAsync()` not `mutateAsync({})`
- DB push (`pnpm --filter @workspace/db run push`) must be run after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
