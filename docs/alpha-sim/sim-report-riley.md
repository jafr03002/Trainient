# Alpha Sim Report — Persona 3 "Riley" (erratic edge-case user)

- Account: trainient.sim3+clerk_test@example.com (Clerk test), userId user_3GxDo0vejqdB8NQw2cHiknxx3K2
- Mode: Independent (never left it). Units: LBS (switched to KG at the end as a test).
- Date of run (app "today"): 2026-07-24.

## Summary

Riley completed sign-up, Independent onboarding, built a deliberately messy manual program, logged a junk workout, did daily check-ins, backfilled sporadic days via API (with gaps + bad bodies), toggled units, and reviewed dashboard/progress/calendar. The app has **solid required-field / type / direction-check validation at the boundaries it chose to guard**, but has **essentially no range/plausibility validation** anywhere (client or server): negative, zero, and absurdly large numbers, and even a garbage date string, are all accepted and persisted. The most impactful real bugs are: (1) daily check-in unconditionally clobbers the profile's "current weight" even from a backdated/negative entry; (2) bodyweight chart + calendar mislabel stored-lbs data with the profile's current unit instead of each log's own unit; (3) a manual program save shows an empty "No program yet" state until a manual reload; (4) skipping the Log-Workout tour bounces the user out to the dashboard, abandoning the in-progress workout. No hard crashes or white-screens were observed; the app degrades but stays functional with junk data.

## Issues found

### Blockers
- None. No crash, white-screen, or dead-end state encountered.

### Bugs

1. **[bug] Daily check-in overwrites profile "current weight" from any date, including backdated/negative entries.** UI+API. `POST /api/daily-checkin` (dailyLogs.ts) does `db.update(userProfilesTable).set({ weight, weightUnit })` whenever `weight` is present, with no check that the log's date is the most recent. Repro: current weight was set via UI check-ins; then a backdated API check-in for **2026-07-18 with weight -50** overwrote the profile to **-50**. Expected: current weight should reflect the latest-dated log (or only "today"); Actual: last-written wins regardless of date. Evidence: Settings showed Weight -50 after the -50/2026-07-18 POST; `GET /api/profile` → `weight:-50`.

2. **[bug] Bodyweight logged in lbs is displayed as kg after a unit switch (per-log weightUnit ignored).** UI. Bodyweight logs are stored with their own `weightUnit` ("lbs"), but the Progress "Bodyweight over time" chart (axis, tooltip, goal line) and the Calendar session detail render using the profile's *current* unit. Repro: log weights in lbs → switch profile unit to kg in Settings → Progress tooltip shows "2026-07-18 Bodyweight: -50 kg" and goal line "Goal -50 kg", though those were entered as lbs. Expected: each point labeled with the unit it was recorded in, or a proper conversion; Actual: silent relabel to kg. (Note: the Settings lbs↔kg toggle itself also relabels the numeric value without converting — -50 lbs became -50 kg.)

3. **[bug] Workout set weights are labeled "kg" in the Calendar session detail even for an lbs user.** UI. While Riley was in LBS mode, the calendar session popup rendered sets as "-100kg × 0" and "99999kg × 500". The logging screen shows weight with no unit, but the read-back view hardcodes/wrong-labels kg. Expected: "lbs" for an lbs user; Actual: "kg".

4. **[bug] After saving a new manual program, My Program shows the empty "No program yet" state until a manual reload.** UI. `POST /api/programs` returned 201, but the page navigated to the empty state; the saved program only appeared after a full page reload of /program/my. Expected: saved program shown immediately; Actual: stale empty state (looks like the save failed).

5. **[bug] Skipping the Log-Workout tour navigates away to the Dashboard and abandons the in-progress workout.** UI. On /log, clicking "Skip tour" (STEP 1 OF 2) redirected to /dashboard instead of just dismissing the coach-mark. The started workout draft had to be re-entered by returning to Log Workout. Expected: skipping a tour dismisses it in place; Actual: bounces the user off the page.

6. **[bug] "Sets = 0" in the program builder is silently coerced to the default 2.** UI. Entering 0 in the Sets field (it visibly displayed 0) saved as sets:2 with no warning. Verified via `GET /api/programs/current?lineage=manual` → `sets:2`. Expected: either accept 0 or reject with a message; Actual: silent overwrite to 2.

### Papercuts

7. **[papercut] No range/plausibility validation on body stats & targets (client or server).** Onboarding accepted Age **999**, Weight **1500 lbs**, Goal weight **-50** (negative), Calorie target **0**, Step target **-500** (negative). All shown on the summary and persisted (`POST /api/profile` → 201). The goal-weight *direction* check works (see Positives) but there is no min/max/positive check.

8. **[papercut] Absurd auto-suggested calorie target from extreme weight.** The onboarding "Set your targets" step pre-filled **20000 kcal/day** (driven by the 1500 lbs weight with no clamp). Even reasonable inputs would benefit from clamping the suggestion.

9. **[papercut] No length limit on exercise names; long names overflow the UI.** A 223-char exercise name saved fully (only programName≤120 / splitType≤80 are bounded in `CreateManualProgramBody`). In the Calendar session detail the long name forced a horizontal scrollbar and shifted the modal layout (moved the Delete control).

10. **[papercut] Bad data breaks bodyweight chart scaling / axis labels.** The negative -50 point drops the line below the axis, and a future-dated entry (2027-12-31) stretches the x-axis so the rightmost date label overlaps the "Goal -50 kg" label. Renders without crashing but is unreadable at the right edge.

11. **[papercut] Onboarding step counter briefly shows the wrong/duplicate number mid-transition.** The mode screen flashed "STEP 2 OF 6", and each Continue increments the step number before the content swaps, so the same screen momentarily shows two different step numbers. Cosmetic animation artifact.

### Server-side validation gaps (API, `POST /api/daily-checkin`)

12. **[bug] Garbage date string is accepted and stored.** Body `{date:"not-a-date", calories:100}` → **200**, stored `date:"not-a-date"`. `date` is validated as `zod.string()` only; the column is plain text. This pollutes the date space and could break date-range/label logic.

13. **[papercut] Future dates accepted.** `{date:"2027-12-31", weight:180, calories:2000}` → **200**, stored. No "not in the future" guard.

14. **[papercut] Negative numbers accepted.** `{date:"2026-07-18", weight:-50, calories:-999, steps:-100}` → **200**, all stored as-is.

## Positive notes (validation that DID work)

- **Onboarding mode step**: Continue is disabled until a mode is chosen.
- **Goal-weight direction check works**: with goal "Lose weight" and current 1500 lbs, entering target 1600 was blocked with a clear inline message ("...1600 lbs is above your current 1500 lbs - that's gaining weight..."). (It only catches direction, not negatives — see #7.)
- **Onboarding state persistence**: Back/forward preserved Age 999, Weight 1500, unit=lbs, name, and goal-weight selections.
- **Program builder required fields**: saving with an empty Day name showed "Missing fields above - fill them in before saving" and highlighted the field red.
- **Muscle-group soft warning**: saving an exercise with no muscle shows an in-app "Save anyway / Go back" warning (optional, not a hard block) — reasonable.
- **Workout "missing sets" soft warning**: finishing with Set 1 reps=0 prompted an in-app "Not every set is logged — Finish anyway / Keep logging" modal.
- **Workout draft persistence**: navigating Log→Calendar→Log kept the half-filled set values (-100 / 99999 / 500).
- **Daily check-in upsert works**: re-saving today's check-in with different values overwrote the first (Fri 24 went 2500cal/8000steps → 1800cal/5000steps, still "3/4 logged", no duplicate).
- **Delete workout is an in-app HTML confirm modal** (verified in calendar.tsx: `showDeleteConfirm` state, not window.confirm) and correctly removed the session from the calendar.
- **Server rejects missing/mistyped required fields**: missing `date` → 400; `calories:"lots"`, `steps:true` → 400 with precise zod path/message.
- **Mode integrity**: workout logged with `mode:"independent"`; profile stayed `mode:"independent"` throughout; weightUnit correctly stored per-log as "lbs" at write time.
- **Tours dismiss cleanly** on the Program page (Skip tour just closed it); no tour got stuck or infinitely reappeared (aside from the Log-Workout skip redirect, #5).
- No app-level console errors on any page. The only console errors seen were Chrome-extension noise ("A listener indicated an asynchronous response... message channel closed").

## Data appendix

- Email: trainient.sim3+clerk_test@example.com / userId user_3GxDo0vejqdB8NQw2cHiknxx3K2
- Final profile: `{name:"Riley", mode:"independent", goal:"lose_weight", goalWeight:-50, age:999, weight:-50, weightUnit:"kg", dailyCalorieTarget:0, dailyStepTarget:-500}`
- Manual program: "Riley Mess Program" / splitType "Custom" / Day 1 "Chaos Day" / 1 exercise (223-char name, muscle:"", **sets:2** despite entering 0, reps "8-12").
- Workout (later deleted): id 24, date 2026-07-24, "Chaos Day", mode independent, sets: `[{weight:-100,reps:0,completed:false},{weight:99999,reps:500,completed:true}]`.

### Daily-log dates posted (gaps intentional)
- Via UI: 2026-07-24 (weight 200→195, cal 2500→1800, steps 8000→5000 — upsert overwrite).
- Via API backfill (200 OK): 2026-07-19 (w198/2200cal/7000steps), 2026-07-22 (w197/2000cal/6500steps/Running 30min).
- Gaps left empty: 2026-07-20, 07-21, 07-23, 07-25, 07-26.

### Bad-body tests — `POST /api/daily-checkin`
| Body | Status | Result |
|---|---|---|
| `{calories:2000}` (missing date) | **400** | zod: date "Required" |
| `{date:"2026-07-20", calories:"lots", steps:true}` | **400** | zod: calories/steps "Expected number" |
| `{date:"2027-12-31", weight:180, calories:2000}` | **200** | stored (future date accepted) |
| `{date:"2026-07-18", weight:-50, calories:-999, steps:-100}` | **200** | stored as-is (negatives accepted); also clobbered profile weight → -50 |
| `{date:"not-a-date", calories:100}` | **200** | stored `date:"not-a-date"` (garbage date accepted) |

- POST /api/profile (onboarding finish): 201 with age 999 / weight 1500 lbs / goalWeight -50 / calorie 0 / step -500.
- POST /api/programs (manual save): 201 (but page showed empty state until reload — issue #4).

## Edge-case handling summary (graceful vs not)
- Empty required fields (mode, day name, missing `date`): **handled** (blocked with clear messaging).
- Wrong-direction goal weight: **handled** (blocked inline).
- Wrong types over API: **handled** (400).
- Extreme/negative/zero numeric values (age, weight, goal, calories, steps, set weights/reps): **NOT handled** — silently accepted & persisted everywhere.
- Garbage/future date over API: **NOT handled** — accepted & persisted.
- sets=0: **NOT handled gracefully** — silently coerced to 2.
- Unit switch with existing data: **NOT handled** — relabels without converting; historical lbs shown as kg.
- Long text: **NOT handled** — no limit; overflows UI.
- Back-nav / draft persistence / upsert / in-app delete: **handled well**.
