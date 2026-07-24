# Trainient — Independent Mode Alpha Readiness Report

**Method:** Three simulated alpha users each ran Independent mode end-to-end against a clean `main` (`ace2e05`), local build (web :24301 / API :8080). Each did day 1 through the real browser UI, backfilled a 6-day week via the authenticated API (backdated dates), then reviewed the week in the UI. No AI mode, no AI generation, no check-ins, no billing — Independent flows only. Accounts were free Clerk **test** accounts (`+clerk_test`, OTP 424242).

**Personas:** Nora (beginner cutter, kg, diligent) · Marcus (experienced bulker, 5-day split, unilateral lifts, mid-week program edit) · Riley (erratic, lbs, deliberate edge cases).

**Bottom line:** The core Independent loop is genuinely solid — sign-up, onboarding, program building, workout/daily logging, and every review surface (dashboard, bodyweight graph + goal line, PRs, volume, calendar) work and stay data-coherent end to end, with **zero app-level console errors** across all three runs. It is close to alpha-ready. The blockers to fix first are: a first-run tour that can trap users on small viewports, a cluster of data-integrity bugs around weight/units, and a program-save that looks like it failed. Findings marked ✅ were verified in the source.

---

## P0 — Fix before alpha

### 1. First-run dashboard tour renders off-screen on short viewports → user trapped behind a dark overlay
*Blocker (viewport-conditional) · Dashboard `CoachmarkTour` · Nora*
After onboarding, the tour dims the screen (`fixed inset-0 bg-black/60`) but positions its spotlight (y≈908) and tooltip with Skip/Next (y≈766, `position:fixed`) **below the fold** of a 639px-tall viewport, without scrolling the target into view. Page scroll doesn't bring the fixed tooltip back, and **Escape doesn't dismiss**. A new user on a laptop (~700–800px) can hit a black screen they can't escape without resizing the window. **Fix:** `scrollIntoView` each step's target, clamp the tooltip within the viewport, and allow Escape / backdrop-click to skip.

### 2. Daily check-in overwrites profile "current weight" from *any* date, including backdated/negative ✅
*Bug (data integrity) · `POST /api/daily-checkin` (dailyLogs.ts) · Riley*
When `weight != null`, the handler unconditionally runs `db.update(userProfilesTable).set({ weight, weightUnit })` — no check that this log is the most recent. A backdated API check-in (2026-07-18, weight −50) overwrote the profile's current weight to −50 despite later real entries. It's last-**write** wins, not latest-**date** wins (the code comment even claims "latest log"). **Fix:** only update `user_profiles.weight` when the log's date ≥ the newest existing bodyweight log. *(Nora independently noted the same coupling more benignly.)*

### 3. Unit switch (lbs↔kg) relabels data without converting; charts/calendar ignore each log's stored unit
*Bug (data integrity) · Settings, Progress bodyweight chart, Calendar · Riley*
Bodyweight logs are stored with their own `weightUnit`, but the Progress chart (axis, tooltip, goal line) and Calendar detail render using the **profile's current** unit. Log in lbs → switch profile to kg → a 180-lbs point is shown/labeled as "180 kg". The Settings toggle itself also relabels the number without converting. **Fix:** convert on unit change (or render each point in its recorded unit); stop assuming profile unit for historical data.

### 4. Calendar session detail labels set weights "kg" for an lbs user
*Bug · Calendar session popup · Riley*
While in lbs mode, logged sets rendered as "99999**kg** × 500". The logger shows no unit; the read-back view hardcodes kg. **Fix:** label set weights with the user's unit.

### 5. Saving a new manual program shows the empty "No program yet" state until a manual reload
*Bug (looks like data loss) · `/program/my` after `POST /api/programs` (201) · Riley*
The save succeeds server-side but the page shows the empty state until a full reload — a first-time user reasonably concludes the save failed and may redo it. **Fix:** invalidate/refetch the program query on save success. *(Likely the same stale-cache class as Marcus/Nora seeing fresh writes only after reload.)*

---

## P1 — Should fix for a good alpha

### 6. Skipping or finishing the Log-Workout tour navigates away to Dashboard, abandoning the in-progress workout
*Bug (flow) · `/log` tour · Marcus + Riley + Nora (triple-corroborated)*
"Skip tour" (and "Done" on the final walkthrough step) redirect to `/dashboard` instead of dismissing in place, dumping the user out of the workout they were mid-logging. Power users who reflexively skip tours get kicked out of the primary action. **Fix:** dismiss the overlay in place; never navigate on skip/done.

### 7. No range / plausibility validation anywhere (client *and* server) ✅
*Papercut → Bug-adjacent · Onboarding, targets, program, `POST /api/profile` & `/api/daily-checkin` · Riley*
Accepted and persisted: Age **999**, Weight **1500 lbs**, Goal weight **−50**, Calorie target **0**, Step target **−500**, set weight **−100**, and the onboarding auto-suggested **20000 kcal/day**. Over the API, negatives, future dates (2027-12-31), and even a **garbage date string** (`"not-a-date"`) all return 200 and store as-is — `DailyCheckinInput.date` is a bare `string` with no format ✅, numbers have no min. Type/required checks *do* work (wrong types → 400). **Fix:** add min/max/positive bounds and a real date validator (reject non-dates and far-future); clamp the calorie suggestion. Garbage dates in particular can corrupt date-range/label logic.

### 8. `sets = 0` in the program builder is silently coerced to 2 ✅
*Bug · Program builder · Riley*
`sets: parseInt(e.sets) || 2` (shared.tsx:344) turns a falsy 0 into 2 with no warning. **Fix:** reject/validate 0 rather than silently substituting.

### 9. "Log Workout" nav always defaults to Day 1 (Push); no day picker on the logger
*Papercut · `/log` · Marcus*
`/log` with no `?day` always loads `days[0]`; day is only selectable via Program → Start workout. A 5-day-split user clicking "Log Workout" is silently forced onto Push. **Fix:** add a day selector on the logger (default to the next scheduled/least-recent day).

### 10. Dashboard "current weight" is an unlabeled trailing average that disagrees with the last logged weight
*Papercut · Dashboard "Progress toward goal" · Marcus*
Showed 74.1 kg (windowed average) while the latest log was 74.4 kg. Intentional smoothing, but unlabeled it reads as a bug. **Fix:** label it "trend," or also show the latest point.

---

## P2 — Papercuts & polish

- **Tours are repetitive/overlapping** — 4 sequences (~12 steps) in the first session, near-duplicate copy on the program page; merge into one continuous walkthrough. *(Nora)*
- **Bad data breaks bodyweight chart scaling** — negative points drop below the axis; a future-dated point stretches the x-axis so labels overlap the goal line. *(Riley; mostly resolved once #7 lands)*
- **No exercise-name length limit** — a 223-char name overflows the calendar modal and shifts controls. *(Riley)*
- **Settings page fades in over ~3s** — looks blank/broken on navigation. *(Nora)*
- **Onboarding cardio picker layout shift** — "Minutes each day" appears only after picking a day, shifting chips and causing missed clicks; reserve the space. *(Nora)*
- **Onboarding step counter flickers** the wrong/duplicate number mid-transition. *(Riley)*
- **Stale unilateral "last time" hint** — after toggling an exercise to unilateral, its hint shows the old single-rep value instead of L/R. *(Marcus)*
- **Profile `trainingDays` (4) contradicts the built 5-day program**; `experience` left empty for Independent accounts. *(Marcus)*

## P3 — Suggestions

- **Landing page is an empty headline** — no feature preview of what the app does. *(Nora)*
- **Auth branding oversells AI** ("AI-generated programs… Coach adjusting the plan every week") — wrong first impression for an AI-free Independent alpha; use neutral copy. *(Nora)*
- **No "workout saved" confirmation** after Finish — silent redirect leaves first-timers unsure it saved. *(Nora)*
- **API path inconsistency** (dev-facing) — writes go to `POST /api/daily-checkin` while reads are `/api/daily-logs/*`; the obvious `POST /api/daily-logs` 404s. *(Nora)*

---

## What's working well (don't regress these)

- **The whole Independent loop works** and data stays coherent across dashboard week table, bodyweight graph + goal line (correct direction for both cutting and bulking), PR list, volume-by-muscle, and calendar — every backdated write landed on the right day.
- **Unilateral lifts are solid** — the checkbox persists through save/reload (a mid-run suspicion did **not** reproduce), drives L/R input columns and hints, and stores `repsLeft`/`repsRight`.
- **Program edits are non-destructive** — "Past sessions stay as they were"; renaming an exercise starts a fresh history identity; no data loss.
- **Smart PR detection** — estimated-1RM based (185×4 ranks above 190×3), and only sets that beat an earlier session count.
- **The validation that exists is good** — required fields (mode, day name, date), goal-weight *direction* check, wrong-type API rejection (400), daily-checkin upsert (no dupes), and an in-app (non-native) delete confirm.
- **Zero app-level console errors** on any page across all three personas.

---

## Appendix — accounts & environment note

- Test accounts (local DB, isolated Clerk userIds, safe to purge): `trainient.sim1/2/3+clerk_test@example.com`.
- Simulated week: 2026-07-18 → 07-24 in every run.
- **Environment note:** during the run the Fable 5 credit limit interrupted persona 2 (resumed cleanly on Opus 4.8), and the session churn later tore down the `.treehouse` worktree's git linkage. **Nothing was lost** — no commits were made, and the canonical repo at `C:\Users\jakob\Desktop\Trainient` (branch `alpha`) is untouched. All code citations above were verified against `main` via the Desktop repo. Dev servers are currently stopped.
