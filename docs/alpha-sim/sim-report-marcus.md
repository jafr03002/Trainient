# Trainient Alpha Sim Report — Persona 2 "Marcus" (experienced bulker, Independent mode)

## Summary
Resumed a partially-set-up account: onboarding was already complete (Independent mode, gain-weight, 74→80 kg, kg) and a 5-day program draft was sitting **unsaved** in the editor. I fixed a gap (Single-Arm Preacher Curl had no primary muscle) and set the two missing unilateral flags, saved, and verified the whole flow end to end — program build, unilateral persistence, UI workout logging (incl. L/R for unilateral), daily check-in, targets box, a mid-week program edit, an API backfill of six days, and a full week review. The app performed well: the unilateral checkbox **does** persist through save/reload (the prior run's suspicion did not reproduce), historical sessions are immutable across program edits, PR detection is smart (estimated-1RM based), and there were **zero console errors** on any page. The main friction is around day selection when logging: the "Log Workout" nav link always drops you on Day 1 (Push) with no on-page day picker, and dismissing the logger's tour bounces you off to the dashboard. A few smaller papercuts around trend-weight display and a stale unilateral "last time" hint.

Account is fully populated with realistic bulk data and I signed out at the end.

## Issues found

### 1. "Log Workout" nav link always defaults to Day 1 (Push); no day picker on the logger — papercut
- **Where:** left-nav "Log Workout" → `/log`; logger page.
- **What:** `/log` with no query param always loads `days[0]` (Push). The day is only selectable via Program page → day tab → "Start workout" (which sets `/log?day=<n>`). Confirmed in `log.tsx` (`resolveDay` returns `days[0]` when no `?day`). There is no day selector on the logger itself.
- **Expected vs actual:** A 5-day-split power user clicking "Log Workout" expects to pick which day; instead it silently forces Push with no visible way to switch.
- **Repro:** Click "Log Workout" in the nav → always Push, regardless of what was logged last (logged two Push sessions and it stayed on Push).
- **UI.** No console/network errors. Workaround exists (Program page → Start workout), so papercut not blocker.

### 2. Dismissing the logger tour navigates away to /dashboard — papercut
- **Where:** `/log`, first-visit tour popup ("STEP 1 OF 2 … track your weight and reps").
- **What:** Clicking **"Skip tour"** navigated to `/dashboard` instead of just closing the tour and staying on the log page.
- **Expected vs actual:** Skipping a tour should dismiss the overlay in place; instead the user is bounced off the page they were trying to use.
- **Repro:** Fresh visit to `/log` → tour appears → click "Skip tour" → lands on `/dashboard`.
- **UI.** Impatient power users (who always skip tours) get kicked out of the logging flow.

### 3. Current weight in "Progress toward goal" is a smoothed average that disagrees with the latest logged weight — suggestion
- **Where:** Dashboard "PROGRESS TOWARD GOAL" card.
- **What:** Showed current **74.1 kg** while the latest logged bodyweight was **74.4 kg** (07-24) and `profile.weight` was 74.3. Confirmed in code: `averageInWindow()` averages logged weights across a window (intentional trend smoothing; card is labelled "still calibrating").
- **Expected vs actual:** A user who just logged 74.4 kg may be confused seeing "74.1 kg" as current with no explanation that it's a trailing average.
- **UI/design.** Low severity — behaviour is intentional, but the mismatch reads as a bug to the user. Suggest labelling it "trend" or showing the latest point too.

### 4. After toggling an exercise to unilateral, its "last time" hint shows the old single-rep value (not L/R) — cosmetic papercut
- **Where:** Logger, Barbell Curl on Pull day after I toggled its unilateral flag ON.
- **What:** The exercise now renders "Reps (L)/(R)" input columns correctly, but the "Last time" hint read "45 kg × 10" (single value) because the prior 07-19 session was logged bilaterally.
- **Expected vs actual:** Minor inconsistency between the new L/R input layout and the single-value historical hint. Understandable (history predates the flag change) but looks off. Cosmetic.
- **UI.**

### 5. Onboarding recorded trainingDays = 4 but the user built (with no friction) a 5-day program; experience field empty — papercut
- **Where:** Profile (`trainingDays: 4`, `experience: ""`) vs `/program/my` (5 training days).
- **What:** The program builder doesn't constrain day count to the onboarding `trainingDays`, so the profile's "4 training days" is stale/contradictory. `experience` was left empty for this Independent-mode account.
- **Expected vs actual:** Profile metadata should track the actual program, or the mismatch is at least worth surfacing. Low impact since it didn't block anything.
- **UI/data.**

## Positive notes
- **Unilateral flag persistence works (prior-run suspicion did NOT reproduce):** set the checkbox, saved, hard-reloaded, reopened editor → all three unilateral exercises reload **checked**; stored as `isUnilateral:true`; drives L/R input columns and L/R "last time" hints in the logger; and workouts save `repsLeft`/`repsRight` (with `reps:null`) correctly both via UI and API.
- **Historical data is immutable across program edits:** the editor header states "Past sessions stay as they were," and after renaming Barbell Row → Chest-Supported Row, the 07-19 logged session still shows "Barbell Row". No data-loss warnings needed because no data is lost.
- **Program edits reflect immediately in the logger:** Chest-Supported Row appeared, Lat Pulldown showed 4 sets, and the newly-unilateral Barbell Curl showed L/R columns.
- **Smart PR detection:** PRs use estimated 1RM, so Deadlift 185 kg × 4 is correctly ranked above 190 kg × 3; only sets that beat an *earlier* session count (first-ever sessions establish a baseline, not a PR — which is why "PRS THIS WEEK" was 0 after the very first workout and 8 after progression). Live "Finish – N new PRs!" counter worked.
- **Targets box is bulk-appropriate:** phase selector offers Gaining/Maintenance/Losing with "Gaining weight / Bulk phase" pre-selected (green); goal 80 kg, 3400 kcal, 7000 steps, no cutting assumptions anywhere. Bodyweight graph renders the "Goal 80 kg" line **above** current weight (correct gaining direction).
- **Calendar** correctly shows every backfilled + live session, including three sessions stacked on 07-24.
- **Zero console errors** across Dashboard, Program, Log, Progress, Calendar, Settings.
- Renaming an exercise correctly creates a fresh history identity (Chest-Supported Row shows no bogus "last time" from the old name).

## Notes on backdating artifacts (NOT reported as bugs)
- **"Last time" and profile.weight order by `createdAt`, not workout date.** Because the six days were backfilled *after* today's live logs, "last time" on a new Push showed the 07-18 session (95 kg) rather than 07-24 (100 kg), and `profile.weight` settled on the last write (74.3) rather than the latest date (74.4). In normal chronological use these coincide; the app's use of insert-order recency is reasonable.
- **Stored `isNewPr:true` on a single-session backfilled lift (Squat 150×4, 07-20) is ignored by the read-time PR table** — by design, since it never beat an earlier session (`progress.ts`: "Exercises that never beat their opening session are omitted"). Backfilled sessions still correctly serve as the *baseline* that today's PRs beat (Deadlift/Single-Arm DB Row/Lat Pulldown PRs all appear).
- **VOLUME BY MUSCLE GROUP counts hard sets per muscle, not tonnage** (`muscle-volume` sums performed set counts). So a unilateral set counts as one set (no L+R double-count) — correct and consistent with a "hard sets" volume model; the earlier "does volume count unilateral L+R" concern is moot.

## Data appendix
- **Account:** trainient.sim2+clerk_test@example.com — user_3GwrtpvK5mijjNDFQqtV8YxlsQ4. Mode independent, goal gain_weight, age 26, weight 74→goal 80 kg, kg. onboardingCompletedAt 2026-07-24.
- **Program:** "Marcus 5-Day Split" — Push / Pull / Legs / Upper / Arms+Delts. 3 unilateral exercises confirmed persisted (`isUnilateral:true`): Single-Arm DB Row (Pull), Bulgarian Split Squat (Legs), Single-Arm Preacher Curl (Arms+Delts). Mid-week edit: Barbell Row→Chest-Supported Row, Lat Pulldown sets 3→4, Barbell Curl → unilateral ON.
- **Daily logs (POST /api/daily-checkin, all 200):** 07-18 73.9kg/3200/8000, 07-19 74.0/3400/6500, 07-20 74.0/3100/7500, 07-21 74.1/3300/9000, 07-22 74.2/3500/6000, 07-23 74.3/3250/7200, plus today 07-24 74.4/3300/7000 (via UI check-in).
- **Workouts:** 8 total, all `mode:"independent"`, server-stamped `weekNumber:1`.
  - Backfill (POST /api/workouts, all 201): 07-18 Push, 07-19 Pull (Deadlift 185×3 PR-flagged; Single-Arm DB Row repsLeft/Right), 07-20 Legs (Squat 150×4 PR-flagged), 07-22 Upper, 07-23 Arms+Delts.
  - Via UI: 07-24 Push #1 (Bench 100×6, 0 PRs — first session), 07-24 Push #2 (Bench 102.5×6, "2 new PRs"), 07-24 Pull (edited day; Chest-Supported Row + unilateral Barbell Curl repsLeft/Right 10/10; "4 new PRs").
- **PR table (GET /api/progress/pr):** 8 rows, all 24 Jul — Bench 102.5×6, OHP 60×7, Incline DB 34×10, Cable Fly 22×14, Triceps Pushdown 40×12, Deadlift 185×4, Single-Arm DB Row 42×10, Lat Pulldown 82.5×10. Dashboard "PRS THIS WEEK" = 8 (consistent).
- **Endpoint confirmations:** daily-log writes = POST `/api/daily-checkin` (200); workouts = POST `/api/workouts` (201); program read = GET `/api/programs/current`; unilateral field name is `isUnilateral` (program) and `repsLeft`/`repsRight` with `reps:null` (logged sets). No non-2xx responses encountered.
