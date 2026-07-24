# Alpha sim report — Persona 1: "Nora" (beginner cutter)

Account: `trainient.sim1+clerk_test@example.com` · Independent mode · kg · goal 78 → 70 kg
Simulated week: 2026-07-18 → 2026-07-24 (day 7 via real UI, days 1–6 backfilled via API)
App: main @ ace2e05, web :24301, viewport ~1536×639 (short laptop-style viewport)

## Summary

Sign-up, onboarding, program building, workout logging, daily check-in, and all review surfaces (dashboard week table, goal progress, bodyweight graph with goal line, PRs, volume chart, calendar) fundamentally **work** and the data flow is coherent end-to-end. The one serious problem is the **dashboard onboarding tour, which on a short viewport strands the user behind a dark overlay with the tooltip and Skip/Next buttons rendered off-screen** — a new user's very first post-onboarding moment can be a black screen they cannot escape without resizing the window. Beyond that, the issues are papercuts: repetitive/overlapping tours, the walkthrough dumping you out of the log page at its final step, and a slow content fade-in on Settings that looks like a blank page.

## Issues found

### 1. BLOCKER (viewport-dependent) — Dashboard tour tooltip + spotlight render off-screen; user stuck behind overlay
- **Where:** Dashboard, "Quick tour" that auto-starts right after independent onboarding (CoachmarkTour).
- **What happened:** After clicking "Let's go", the screen dimmed (fixed overlay `bg-black/60`) but no tooltip or highlight was visible anywhere. DOM inspection: the spotlight ring was at fixed y≈908 and the tooltip at fixed y≈766 in a 639px-tall viewport — both entirely below the fold, while `window.scrollY` remained 0. The tour does not scroll its target into view, and the tooltip (with Skip/Next) is `position:fixed`, so scrolling the page does not bring it into reach. Escape does not dismiss the tour either.
- **Expected:** Each tour step scrolls its target element into view (`scrollIntoView`) and clamps the tooltip within the viewport; Escape (or clicking the dimmed backdrop) should skip/dismiss.
- **Repro:** Fresh account → independent onboarding → land on dashboard with a browser window ≤ ~700px tall → "Let's go". Steps 1–3 (hero card, week table, targets card) are all below the fold at this height.
- **Evidence:** overlay divs `fixed inset-0 z-[60] bg-black/60` and `fixed z-[60] ... ring-4` at y=908 with viewport height 639; tooltip only became partially visible after manually scrolling ~halfway, and vanished again further down. Seen in UI.
- **Note:** at tall desktop viewports (~900px+) the targets may be on-screen and the tour probably behaves; alpha users on laptops (768–800px effective) are likely to hit this.

### 2. BUG — Tour tooltip textContent includes a raw `<style>` block (cosmetic in DOM, symptom of structure)
- **Where:** Same dashboard tour tooltips.
- **What:** The tooltip element's text content begins with the CoachRobot component's inline CSS (`.coach-robot .coach-float { animation: ... }`) because a `<style>` tag is rendered inside the tooltip container. Not user-visible, but it means the robot's styles are re-injected per tooltip; harmless today, fragile tomorrow.
- **Severity:** low bug / code smell. Seen in DOM.

### 3. PAPERCUT — Finishing the walkthrough kicks you out of the page you were told to use
- **Where:** End of the guided flow: dashboard tour → "tap Program" → program tour → build/save program → program-page tour (4 steps) → "tap Log Workout" → log-page tour (2 steps) → **Done**.
- **What happened:** Clicking "Done" on the log page's final tour step navigated me back to the dashboard, abandoning the workout form I was standing in ("This is where you save your workout" … and then it leaves the page). As a new user I then had to find my way back via Start workout.
- **Expected:** Done should end the overlay and leave me on the log page ready to type.
- Seen in UI.

### 4. PAPERCUT — Tours are repetitive and overlap in content
- **Where:** Program page.
- **What:** The program page got TWO separate tours in one session: a 2-step one on first visit ("This is your program page…", "You don't have a program yet, tap here") and, immediately after saving the program, a second 4-step tour starting with "Here is your program page where you will find your programs." Copy is near-duplicate ("Here is your program page…", then step 2 "Here is your program."). A fifth tour ran on the log page. Total: 4 tour sequences / 12 steps in the first ten minutes. It reads as unpolished and slightly patronizing by the third one.
- **Suggestion:** Merge into one continuous walkthrough (it already chains navigation!) and dedupe copy.

### 5. PAPERCUT — Cardio day-picker in onboarding step 5: "Minutes each day" input only appears after picking a day, causing layout shift and missed clicks
- **Where:** Onboarding "Set your targets" step.
- **What:** Selecting the first cardio day inserts the "Minutes each day:" row, shifting subsequent day chips; I (as a user, clicking quickly) missed Thu/Sat because the row jumped. Minor, but the pattern of content appearing between the control I'm using and the button I'm about to press invites double-click errors.
- **Suggestion:** Reserve the space for the minutes input from the start (disabled until a day is chosen).

### 6. SUGGESTION — Landing page is an empty headline
- **Where:** `/` logged out.
- **What:** Only "Train With Intent" + "Start training". No feature blurb, screenshots, or hint of what the app does; the sign-up panel's copy is also entirely about "AI-generated programs" even though the app has a full independent mode (and this alpha is aimed at it). An independent-mode-curious alpha user gets zero preview of what they're signing up for.

### 7. SUGGESTION — Auth branding oversells AI for an independent-mode alpha
- **Where:** Sign-up/sign-in right-hand brand panel: "AI-generated programs built around your goals … with Coach adjusting the plan every week."
- **What:** If alpha explicitly excludes AI mode/paid services, this promise is the first thing every tester reads. Consider neutral copy ("Build your program, log honestly, see progression").

### 8. OBSERVATION (works, but worth knowing) — First workout gives no PRs and no feedback moment
- **Where:** Log page → Finish workout.
- **What:** Finishing the first-ever workout silently redirects to the dashboard; hero still says "Ready to start your workout?" and PRs THIS WEEK = 0 (by design, PRs require beating an earlier session — the Progress page explains this nicely). There is no "workout saved 🎉" confirmation; a first-timer wonders if it worked until they find the calendar/progress entries. After the backdated week existed, today's session correctly produced 3 PRs with NEW badges.
- **Suggestion:** A save confirmation/toast or a small summary screen after Finish workout.

### 9. PAPERCUT — Settings page fades in over ~3s; initially looks blank/broken
- **Where:** `/settings` (likely all pages have the entrance animation; Settings has enough content that the delay is noticeable).
- **What:** On navigation the content was present in DOM (opacity animating) but the page looked essentially black for a couple of seconds before fading in.
- Seen in UI; screenshot sequence confirms.

### 10. OBSERVATION — API path inconsistency: write is `POST /api/daily-checkin`, reads are `GET /api/daily-logs/week`
- Not user-facing; tripped me (and would trip any future API consumer/tester): the obvious `POST /api/daily-logs` returns 404. Consider aliasing. Seen in API.

### 11. OBSERVATION — Profile "Weight" in Settings is silently overwritten by the latest daily check-in
- After backfilling, Settings showed weight 76.8 (the last-posted backfill day) rather than the 78 entered at onboarding or today's 76.6. For chronological use this is fine (profile tracks latest weigh-in — arguably a feature); just noting the coupling is invisible to the user. Also the number input displays locale commas ("76,6") while API/graphs use dots — cosmetic.

## What worked well (positive notes)

- **Onboarding flow** is clear and friendly: mode explanation ("no AI involved") is honest; goal step offers a goal-weight sub-dialog with sane direction copy ("Enter a target below your current 76.6 kg"); targets step pre-suggests sensible defaults (1950 kcal / 8000 steps) and the summary screen is accurate.
- **Program builder** is fast to use: sensible defaults (2 sets, 8–12 reps), muscle dropdowns constrained to the fixed list, unilateral checkbox discoverable but out of the way, Add exercise/day flows fine, and the saved program page (day tabs, exercise list with muscle tags, sets×reps) is genuinely nice.
- **Data coherence end-to-end is excellent:** every backdated API write appeared exactly where it should — dashboard week table (calories/steps/cardio ✓ per day), bodyweight graph (7-point downtrend + dashed "Goal 70 kg" line), volume-by-muscle stacked bar, PR list with NEW badges (correctly only for today's heavier session), calendar chips with distinct colors per day label on the right dates, and the goal progress card ("6.6 kg to go", "still calibrating").
- **Targets box** (DIET PHASE card) round-trips edits correctly (step target 9000 → 9500 persisted) and the phase picker copy (Bulk/Maintenance/Diet) is clear.
- No genuine app console errors on any page (only Chrome-extension messaging noise).
- Sign-up with Clerk test OTP worked smoothly; validation feedback on password was clear.

## Data appendix

- Workouts: UI 2026-07-24 Full Body A (GS 12kg, CP 20, LP 30); API 07-18 A (10/18/25), 07-20 B (Leg Press 80, Row 35, DBSP 8), 07-22 C (RDL 16, Incline 12, Curl 8) — all 201.
- Daily checkins: 07-18…07-23 via `POST /api/daily-checkin` (200 ×6; weights 78.0→76.8, Walk 20/25 min on 21 & 23), 07-24 via UI (76.6 kg / 1800 / 9000 / Walk 20).
- `POST /api/daily-logs` → 404 (route is `/api/daily-checkin`).
- Signed out at end; tab left on landing page.
