# Traintent — Work Catalog

A running catalog of planned / pending work items. Each entry is self-contained
enough to pick up cold. Add new items at the top of the "Backlog" list.

---

## Backlog

- **[Onboarding Alignment & Slim-Down](#onboarding-alignment--slim-down)** — fix muscle-list mismatch, add name, trim unused questions for Independent mode
- **Phase B — Recurring Split Scheduling** — sections 8–9 of the feature spec (training_schedule table, calendar projection, dashboard rest-day logic, permanent late-log shift). Context in agent memory `independent-mode-features`.
- **Autoregulation engine** — fatigue + progress rule set (e1RM-based). Spec drafted in chat; not yet a doc.
- **Data hygiene** — delete the junk empty workout log (`workout_logs.id = 2`, all-zero test session).

---

## Onboarding Alignment & Slim-Down

**Status:** planned · **Area:** `artifacts/traintent/src/pages/onboarding.tsx`, `lib/db/src/schema/userProfiles.ts`

### Context
Onboarding is an 8-step wizard (mode → goal → experience → training days →
equipment → body stats → priority muscles → review). It saves the profile via
`useCreateProfile`, and for AI mode also calls `useGenerateProgram`, then
redirects to `/dashboard`. Independent mode skips generation.

### Issues to address
1. **Muscle list mismatch (highest value).** Onboarding's priority-muscle picker
   uses 8 coarse groups — `Chest, Back, Shoulders, Arms, Legs, Glutes, Core,
   No preference`. The rest of the app (program builder, `/progress`) now uses
   the 10 specific options: `Chest, Shoulders, Biceps, Triceps, Upper Back,
   Lats, Quads, Hamstrings, Glutes, Calves`. Priority muscles chosen at
   onboarding don't line up with logged/built data. → Align onboarding to the
   same 10 options (and keep "No preference"). Consider a shared constant so the
   list is defined once.
2. **No name capture.** `userProfiles.name` exists in the schema but onboarding
   never asks for it. → Add a name field (likely on the first or review step).
3. **Independent mode collects unused AI data.** Goal, experience, equipment,
   and injuries are gathered but unused when no program is generated. → Either
   trim/condense these steps for Independent mode, or keep them but label them
   as "for future use" so the flow feels purposeful.
4. **Light validation.** Only steps 0/1/2/4 gate advancement; the rest can be
   skipped with defaults — acceptable, just noted.

### Acceptance sketch
- Onboarding priority-muscle options == the 10 program-builder options.
- A name is captured and persisted to `userProfiles.name`.
- Independent-mode flow no longer asks for data it can't use (or clearly frames it).
- No regression to the AI-mode generate-program path.
