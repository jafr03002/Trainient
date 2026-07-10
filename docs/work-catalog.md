# Traintent - Work Catalog

A running catalog of planned / pending work items. Each entry is self-contained
enough to pick up cold. Add new items at the top of the "Backlog" list.

---

## Backlog

- **[Program Presentation & Evaluation Gate](#program-presentation--evaluation-gate)** - post-generation loading screen, program display with muscle-volume breakdown, AI motivation, and a satisfied/not-satisfied gate. Implements steps 1-2 of Calibration Phase below; split into independent subtasks.
- **[Calibration Phase](#calibration-phase)** - post-onboarding trial period (calibration week(s)) ending in a calibration review before the program officially starts
- **[Independent / AI Program Separation](#independent--ai-program-separation)** - scope `/programs/current` and program editing to the active mode's program lineage; split the AI-mode empty state into profile-incomplete vs. ready-to-generate
- **[Onboarding Alignment & Slim-Down](#onboarding-alignment--slim-down)** - fix muscle-list mismatch, add name, trim unused questions for Independent mode
- **Autoregulation engine** - fatigue + progress rule set (e1RM-based). Spec drafted in chat; not yet a doc.
- **Data hygiene** - delete the junk empty workout log (`workout_logs.id = 2`, all-zero test session).

---

## Calibration Phase

**Status:** planned · **Area:** post-onboarding flow (AI mode), program lifecycle
**Source diagram:** [`onboarding-and-calibration-phase-tree.drawio`](onboarding-and-calibration-phase-tree.drawio)

### Concept
After onboarding produces a program, the client does NOT start the "real"
program immediately. Instead they enter a **calibration phase** - one or more
**calibration week(s)** to test the program and dial in technique/loads. It ends
with a **calibration review** that decides whether the client is ready to start
the program for real or needs more time / a reprogram.

Naming (locked): **calibration week(s)** = the time period · **calibration phase**
= the overall stage · **calibration review** = the end-of-phase evaluation gate.

### Flow (transcribed from the diagram)

1. **Onboarding questions → Program generation.**
2. **Gate: "Ok with program?"**
   - **No → "Why?"** capture the reason → **"Applicable to adjust?"**
     - **Yes →** adjust the necessary change → **regenerate** the program (loop to step 1).
     - **No →** proceed into calibration anyway.
   - **Yes →** proceed.
3. **Start calibration week(s).** Show an explainer first ("what a calibration
   week is") so the client understands the purpose.
4. **Calibration phase runs** for a **minimum of 7 days**.
5. **Calibration review** (end-of-phase gate) with three outcomes:
   - **Client ready → "Start program!"** (calibration ends, real program begins).
   - **Not ready yet → loop back** into the calibration phase (extend it).
   - **Client feedback → "Why?" → "Applicable to adjust?"**
     - **Yes → Reprogram** (apply changes, continue/loop).
     - **No → continue** in the phase.

**Note:** Steps 1-2 of the flow below (the "Ok with program?" gate, the Why/adjust loop) are
being built now as **[Program Presentation & Evaluation Gate](#program-presentation--evaluation-gate)**,
ahead of the calibration-week tracking itself. Don't re-spec that gate here - extend the section
below instead.

### Open questions / decisions needed
- What exactly does the calibration review **ask** the client? (technique
  confidence, whether loads felt right, pain/issues, etc.)
- How is "**minimum 7 days**" enforced - calendar days since start, or N logged
  sessions? (Diagram says days.)
- Does calibration apply to **Independent mode** too, or **AI mode only**?
- Data model: a phase/state on the program or profile (e.g. `calibrationStartedAt`,
  `calibrationStatus: in_progress | ready | started`) so the app knows which
  stage the user is in and can gate the dashboard/logger accordingly.
- How "Reprogram" differs from the initial generation (full regen vs targeted edit).

### Acceptance sketch
- After AI program generation, the user is placed in the calibration phase with
  a clear explainer, not the normal dashboard.
- The calibration review cannot resolve to "Start program" before the minimum
  duration is met.
- Review outcomes correctly route to: start program / extend phase / reprogram.

### AI mode dashboard: weekly check-in vs. calibration review card
- The "Time for your weekly check-in" dashboard card must not show if no program has been
  generated yet, and must not show while the client is in the calibration phase.
- During calibration, a "Calibration review" card takes its place - same icon/placement as the
  weekly check-in card, but with calibration-specific copy (e.g. "calibrated and ready to…";
  exact wording TBD).
- The calibration review card first appears after the calibration week minimum (1 week) has
  elapsed, and **stays visible** even after the client opens it and isn't ready yet / cancels out
  of the review - declining doesn't dismiss it.
- After 2 weeks in calibration, the card's copy changes to something else (TBD).
- After 2.5 weeks, the card adds a countdown ("4, 3, 2, 1 days left") warning that the client will
  be routed straight into the calibration-review screen on next login once time's up.
- Open: exact card copy/visual design for each stage - to be worked out via `/lavish`.

### Progress (as of 2026-07-08)
Barely started - one schema field added, nothing wired up yet:

- `calibrationCompletedAt: timestamp` added to `userProfilesTable`
  (`lib/db/src/schema/userProfiles.ts`), plus the matching `openapi.yaml` field and
  `profile.ts` serializer entry. **Still uncommitted, no migration generated, and nothing
  reads or writes it yet.** A single "completed" timestamp likely isn't enough on its own -
  see the "Data model" open question above (need to represent in-progress vs. ready state,
  and when calibration *started*, not just when it ended).
- The existing weekly check-in banner (`artifacts/traintent/src/pages/dashboard.tsx`,
  `showCheckinBanner`, ~line 56) has **no calibration awareness at all**: it shows for any
  AI-mode user once `onboardingCompletedAt` is set and they're 6+ days past that, full stop.
  It does not check whether a program has been generated, or whether the client is in
  calibration - both required by this spec.
- No "Calibration review" card component exists anywhere.
- No staged-copy logic (week-1 vs week-2 vs the 2.5-week countdown) exists.

Suggested next steps when picked back up: resolve the "Data model" open question first (likely
needs `calibrationStartedAt` + a status enum, not just `calibrationCompletedAt`), then run a
`/lavish` pass on the card's copy/visual states per stage before touching `dashboard.tsx`.

---

## Onboarding Alignment & Slim-Down

**Status:** done · **Area:** `artifacts/traintent/src/pages/onboarding.tsx`, `lib/db/src/schema/userProfiles.ts`

### Context
Onboarding now branches by mode: everyone gets mode → name → body stats
(age, weight - the same fields editable in Settings) → review. AI mode
additionally gets goal → experience → training days → equipment → sex/injuries
→ priority muscles before review. Independent mode goes straight from body
stats to review, since none of the AI-only questions are used anywhere when
no program gets AI-generated. Switching modes only clears nothing - the form
is one object, so answers already given to AI-only questions survive going
back to Independent and forward to AI again.

### Issues to address
1. ~~Muscle list mismatch.~~ Done - onboarding's priority-muscle picker now
   imports the same 10-option `MUSCLE_OPTIONS` constant (`src/lib/muscles.ts`)
   used by the program builder, plus "No preference".
2. ~~No name capture.~~ Done - name is now asked right after mode selection
   and saved to `userProfiles.name`.
3. ~~Independent mode collects unused AI data.~~ Done - goal, experience,
   equipment, sex, and injuries are now only asked when AI mode is selected.
4. **Light validation.** Only mode/goal/experience/equipment gate advancement;
   the rest can be skipped with defaults - acceptable, just noted.

### Acceptance sketch
- ~~Onboarding priority-muscle options == the 10 program-builder options.~~ done
- ~~A name is captured and persisted to `userProfiles.name`.~~ done
- ~~Independent-mode flow no longer asks for data it can't use.~~ done
- No regression to the AI-mode generate-program path.

---

## Independent / AI Program Separation

**Status:** done · **Area:** `artifacts/api-server/src/routes/programs.ts`,
`artifacts/traintent/src/pages/program.tsx`, `artifacts/traintent/src/pages/onboarding.tsx`

### Context
Independent and AI mode each own a separate program lineage, keyed by the existing
`programs.aiGenerated` flag - switching modes never surfaces or edits the other mode's
program:

- `GET /programs/current` resolves the latest program within the active mode's lineage
  (`aiGenerated` matching the profile's mode) instead of globally-latest across both.
- `PUT /programs/:id` is scoped to `userId` + `aiGenerated = false` in the query's `WHERE`
  itself, so it can never touch another user's row and can never edit an AI-generated program
  - even from a stale client. This also fixed a pre-existing bug where ownership was checked
  *after* the update ran instead of being part of the `WHERE`.
- `/program`'s Edit button and edit-draft auto-resume are hidden entirely in AI mode; editing
  only exists for Independent-mode (manual) programs.
- The AI-mode empty state now branches on whether the profile has `goal` + `experience` set:
  - **Profile incomplete** (e.g. onboarded via Independent mode, then switched to AI in
    Settings) - "Set up AI coaching" resumes onboarding straight into the AI-only questions,
    prefilling name/age/sex/weight/mode from the existing profile so the finish-step upsert
    doesn't clobber them.
  - **Ready to generate** - "Generate my program" calls `POST /programs/generate` directly
    from `/program`, no onboarding detour.

### Acceptance sketch
- Switching modes never shows or lets you edit the other mode's program.
- Editing (button + resume-from-draft) is unreachable in AI mode.
- An AI-mode profile missing goal/experience is routed to resume onboarding, not a dead-end
  "no program" screen; a complete AI-mode profile with no program yet can generate one without
  leaving `/program`.

---

## Program Presentation & Evaluation Gate

**Status:** planned · **Area:** `artifacts/traintent/src/pages/onboarding.tsx`,
`artifacts/api-server/src/routes/programs.ts`, `lib/api-spec/openapi.yaml`
**Relation:** implements steps 1-2 of [Calibration Phase](#calibration-phase) (the "Ok with
program?" gate + Why/adjust loop). Calibration weeks themselves are separate, later work.

### Concept
Today, finishing onboarding in AI mode calls `generateProgram` and redirects straight to
`/dashboard` with no review step (`onboarding.tsx`'s `review` step, `handleFinish`). This item
inserts a presentation-and-evaluation stage between generation and the dashboard:

1. **Generating screen** - animated loading state while the program is built, with rotating
   status copy ("Laying out the schedule…", "Setting up workouts…", "Structuring your split…")
   and a fitting icon/animation.
2. **Program display** - the generated program: days (only if the program has more than one),
   exercises with sets × rep ranges, plus a **muscle-volume breakdown** (sets per muscle group
   for the week).
3. **Motivation** - a short explanation of *why* this program looks the way it does, tailored
   to the user's actual inputs (goal, experience, split, priority muscles, injuries).
4. **Satisfaction gate** - "Happy with this?" Yes → continue to dashboard. No → "What would you
   change?" (structured categories + free text) → regenerate incorporating that feedback → back
   to step 1.

### Locked contracts
Fix these shapes now so frontend and backend subtasks can build against them without waiting on
each other:

```ts
// Program display - matches the existing ProgramDay/Exercise shape in program.tsx, unchanged.
type ProgramDay = { dayNumber: number; label: string; focus: string; exercises: Exercise[] };

// New: AI motivation, replacing the current free-text `aiNotes` string.
type ProgramHighlight = { title: string; detail: string };
// e.g. { title: "Upper/Lower split", detail: "Matches your 4 days/week and intermediate experience." }

// New: structured change-request feedback, sent back to trigger a regenerate.
type ProgramFeedback = {
  categories: (
    | "training_days" | "exercises" | "sets" | "split" | "order"
    | "session_length" | "equipment" | "priority_muscles" | "overall_volume"
  )[];
  note: string; // free text, optional
};
```

### Subtasks (independent - safe to run in parallel, each touches its own files)

1. **Generating-screen component** - new file, e.g.
   `src/components/onboarding/GeneratingScreen.tsx`. Self-contained animated loading screen,
   rotating status messages, no props beyond maybe a message-interval. No backend dependency.

2. **Muscle-volume chart component** - new file, e.g.
   `src/components/onboarding/MuscleVolumeChart.tsx`. Pure component: takes `days: ProgramDay[]`,
   sums sets per `muscle` across the week, renders a sorted bar/list. No backend dependency -
   computed entirely client-side from data already on the program.

3. **AI motivation backend** - `artifacts/api-server/src/routes/programs.ts` (the
   `/programs/generate` system prompt + response parsing) + `lib/api-spec/openapi.yaml` schema
   + `pnpm --filter @workspace/api-spec run codegen`. Change `ai_notes` (free string) to a
   `program_highlights: ProgramHighlight[]` array, and rewrite the prompt instruction so each
   highlight ties back to a concrete input (split choice, priority-muscle volume bump, injury
   accommodation, experience-based progression logic). Touches only backend + spec files.

4. **Motivation display component** - new file, e.g.
   `src/components/onboarding/ProgramHighlights.tsx`. Pure component: takes
   `highlights: ProgramHighlight[]`, renders as a short card list. Builds against the locked
   contract above - doesn't need subtask 3 to be finished, just the shape.

5. **Satisfaction gate + change-request UI** - new file, e.g.
   `src/components/onboarding/SatisfactionGate.tsx`. "Happy with this?" Yes/No; on No, chip
   multi-select over the `categories` list above + free-text note. Emits a `ProgramFeedback`.
   No backend dependency to build the UI - only needs the contract.

6. **Regenerate-with-feedback backend** - extend `/programs/generate` (or add
   `/programs/regenerate`) in `artifacts/api-server/src/routes/programs.ts` +
   `lib/api-spec/openapi.yaml` to accept a `ProgramFeedback` payload and fold it into the system
   prompt for a new generation pass. Independent of subtask 5's UI - only needs the contract.

### Integration (sequential - depends on 1-6 landing)
Wire the above into `onboarding.tsx`'s step machine: insert `generating` → `presentation`
(program display + highlights) → `satisfied` steps after the current `review` step, replacing
the direct `handleFinish` → `/dashboard` redirect. On "No," show the change-request UI, call the
regenerate endpoint, loop back to `generating`. This is glue work once the pieces above exist -
not parallelizable with them.

### Decisions
- `program_highlights` **replaces** `aiNotes` outright - one source of truth; the Program page
  renders highlights too instead of the old free-text note.
- **No hard cap** on regenerate attempts, but a **soft nudge after ~3**: show a message
  suggesting the user start and adjust as they train, while still allowing another regenerate if
  they insist.
- **No explicit "proceed anyway" button.** If the change-request form is submitted with no
  categories selected and no free-text note (nothing actionable given), treat it the same as
  "Yes, continue" and proceed straight to the dashboard.

### Acceptance sketch
- Finishing AI-mode onboarding shows the generating screen, then the presentation screen - never
  a silent redirect to `/dashboard`.
- The presentation screen shows day tabs (only if >1 day), exercises with sets/reps, and a
  muscle-volume breakdown computed from the actual program.
- Motivation highlights reference the user's actual inputs, not generic boilerplate.
- Declining triggers the structured feedback UI, and submitting it regenerates the program
  incorporating that feedback.

### As built
The presentation now ships as a click-through **card deck**
(`src/components/onboarding/PresentationDeck.tsx`) instead of one long scroll - five cards
navigated with Back/Next and a progress bar, reused inside `onboarding.tsx`'s `presentation`
phase (which no longer imports `MuscleVolumeChart` / `ProgramHighlights` / `SatisfactionGate`
directly):

1. **Program & split** - program name, split-type pills, and `programHighlights` as the
   profile-aware rationale.
2. **Timeline** - a goal-keyed arc of training phases with one-line motives. Template-driven
   client-side (keyed off the onboarding `goal`), *not* model-generated - an accepted
   first-pass simplification.
3. **Balance & schedule** - the `MuscleVolumeChart` plus a one-week schedule strip whose
   weekday placement is derived client-side from the training-day count (rest days spread),
   not a model/DB field.
4. **Sessions** - every training day as a tap-to-expand row showing its full exercise list
   (replaces the earlier "day tabs" display in the acceptance sketch above).
5. **Gate** - the existing `SatisfactionGate` as the closing card.

The deck is onboarding-only and receives `goal` + the program from onboarding form state. The
timeline and schedule content is illustrative default UX - client-side only, with no backend or
schema changes.

### Independent mode, UI fix on logediting workout
-Creating/editing a workout. Fix the UI here so that it is easy to make out the difference between the excerices/days the bland gray user intyerface makes it all kind of blend toghether. Lets have a discussion using lavish on this, Im thinking a border of different colors around each excercse card would be the best.

### Add muscle group
- Add core to the muscle group list across trainient

### Creating/edit workout confirmation
- After reating a program or editing existing when pressing save workout. If missing workout name or primary muscle group worked on an instance remind them that it isn't filled you can pass without entering muscle group but not pass if it doesnt have a name.

### Create program saving
- Information being written when creating a program or editing a program shall be saved in \program until it is saved. Even if the page reloads

### Weekly progress card deck (scratched)

**Status:** scratched - explored via `/lavish`, not being pursued right now. Kept here so the
exploration isn't lost if it comes back up.

**Concept:** A vertical card per week (Week N), fanned out like a hand of cards on `/progress`
(not the dashboard). Click a card and it expands into a centered, backdrop-blurred detail view
for that week.

**Decisions made during the design pass, in case this gets picked back up:**

- Progression is defined the same way as PR tracking: Epley-formula estimated 1RM, per exercise,
  per set. Compare each exercise's best e1RM this week vs. last week.
- Card headline = the best-improved exercise (name + %), not total volume. Total sets is demoted
  to a small secondary figure, never the headline.
- Expanded view leads with a top-3 ranked list of most-improved exercises, plus two aggregate
  percentages: % of tracked lifts that progressed vs. % that regressed week-over-week.
- Reuses the existing muscle-volume breakdown (donut + legend, from `GET /progress/muscle-volume`)
  as secondary detail inside the expanded card, not the headline.
- PR count gets a trophy icon, matching the existing `Trophy` usage elsewhere in the app.
- Backend gap: nothing today diffs e1RM week-over-week - `/progress/prs` computes e1RM per
  exercise but there's no aggregation comparing two weeks. Would be new work in
  `artifacts/api-server/src/routes/progress.ts`, not a reuse of an existing route.
- Open/unresolved when shelved: exact placement on `/progress` (top of page vs. between the two
  existing charts vs. replacing the muscle-volume chart entirely), how far back the deck should
  reach, and whether each week needs a deep-linkable URL.
