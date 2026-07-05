# Traintent — Work Catalog

A running catalog of planned / pending work items. Each entry is self-contained
enough to pick up cold. Add new items at the top of the "Backlog" list.

---

## Backlog

- **[Calibration Phase](#calibration-phase)** — post-onboarding trial period (calibration week(s)) ending in a calibration review before the program officially starts
- **[Onboarding Alignment & Slim-Down](#onboarding-alignment--slim-down)** — fix muscle-list mismatch, add name, trim unused questions for Independent mode
- **Autoregulation engine** — fatigue + progress rule set (e1RM-based). Spec drafted in chat; not yet a doc.
- **Data hygiene** — delete the junk empty workout log (`workout_logs.id = 2`, all-zero test session).

---

## Calibration Phase

**Status:** planned · **Area:** post-onboarding flow (AI mode), program lifecycle
**Source diagram:** [`onboarding-and-calibration-phase-tree.drawio`](onboarding-and-calibration-phase-tree.drawio)

### Concept
After onboarding produces a program, the client does NOT start the "real"
program immediately. Instead they enter a **calibration phase** — one or more
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

### Open questions / decisions needed
- What exactly does the calibration review **ask** the client? (technique
  confidence, whether loads felt right, pain/issues, etc.)
- How is "**minimum 7 days**" enforced — calendar days since start, or N logged
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

---

## Onboarding Alignment & Slim-Down

**Status:** done · **Area:** `artifacts/traintent/src/pages/onboarding.tsx`, `lib/db/src/schema/userProfiles.ts`

### Context
Onboarding now branches by mode: everyone gets mode → name → body stats
(age, weight — the same fields editable in Settings) → review. AI mode
additionally gets goal → experience → training days → equipment → sex/injuries
→ priority muscles before review. Independent mode goes straight from body
stats to review, since none of the AI-only questions are used anywhere when
no program gets AI-generated. Switching modes only clears nothing — the form
is one object, so answers already given to AI-only questions survive going
back to Independent and forward to AI again.

### Issues to address
1. ~~Muscle list mismatch.~~ Done — onboarding's priority-muscle picker now
   imports the same 10-option `MUSCLE_OPTIONS` constant (`src/lib/muscles.ts`)
   used by the program builder, plus "No preference".
2. ~~No name capture.~~ Done — name is now asked right after mode selection
   and saved to `userProfiles.name`.
3. ~~Independent mode collects unused AI data.~~ Done — goal, experience,
   equipment, sex, and injuries are now only asked when AI mode is selected.
4. **Light validation.** Only mode/goal/experience/equipment gate advancement;
   the rest can be skipped with defaults — acceptable, just noted.

### Acceptance sketch
- ~~Onboarding priority-muscle options == the 10 program-builder options.~~ done
- ~~A name is captured and persisted to `userProfiles.name`.~~ done
- ~~Independent-mode flow no longer asks for data it can't use.~~ done
- No regression to the AI-mode generate-program path.

