import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Dumbbell, Plus, Trash2, Save, Loader2, Pencil, ArrowUp, ArrowDown, GripVertical, Info, ListChecks, Timer, Clock, RotateCw, CalendarDays, Layers, Play } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  useGetProfile,
  useGetCalendarColors,
  useCreateManualProgram,
  useUpdateProfile,
  useGetSessionDurationStats,
  customFetch,
  getGetCurrentProgramQueryKey,
  getGetProfileQueryKey,
  type Program,
} from "@workspace/api-client-react";
import { formatSessionLength, MIN_SESSIONS_FOR_AVERAGE } from "@/lib/sessionDuration";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MUSCLE_OPTIONS } from "@/lib/muscles";
import { dayColorAt, dayTones } from "@/lib/dayColors";
import {
  CHECKLIST_ACCENT,
  CHECKLIST_CATEGORIES,
  DISTANCE_UNITS,
  MAX_WHEEL_SECONDS,
  TARGET_TYPE_OPTIONS,
  categoryMeta,
  clampTargetValue,
  describeTarget,
  describeTargetWithRounds,
  formatDuration,
  type ItemKind,
  type TargetType,
} from "@/lib/checklistItems";
import { DurationWheel } from "@/components/DurationWheel";
import { FIELD_LIMITS, MAX_DAY_LABEL, MAX_EXERCISE_NAME, rangeError } from "@/lib/fieldLimits";
import { WEEKDAY_LABELS, mondayIndexOf, todayDateString, upcomingSlots, type StoredSchedule } from "@/lib/programSchedule";
import { formatSplitType } from "@/lib/utils";
import { isPreCalibrationLocked } from "@/lib/calibration";
import {
  type ActiveSessionPointer,
  resolveActiveSession,
  discardActiveSession,
  startSession,
} from "@/lib/workoutSession";
import { WorkoutLogLockDialog } from "@/components/workout/WorkoutLogLockDialog";
import { DiscardSessionDialog } from "@/components/workout/DiscardSessionDialog";
import { ExerciseNamePicker } from "@/components/program/ExerciseNamePicker";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";

export type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rpe: number | null;
  restSeconds: number | null;
  cue: string | null;
  muscle: string;
  secondaryMuscle?: string | null;
  isUnilateral?: boolean;
  // Checklist items (see lib/checklistItems.ts). All optional: a row written before
  // this feature existed has none of them and is a lift by default. On a checklist
  // row `sets` carries the round count and `reps` the display target.
  kind?: ItemKind;
  targetType?: TargetType | null;
  targetSeconds?: number | null;
  targetValue?: number | null;
  targetUnit?: string | null;
  category?: string | null;
};

/** Legacy rows have no `kind`, so absent means lift. */
export function isChecklist(ex: { kind?: string | null }): boolean {
  return ex.kind === "checklist";
}

export type ProgramDay = {
  dayNumber: number;
  label: string;
  focus: string;
  exercises: Exercise[];
};

// The user's own per-day colour picks from Settings, keyed by day label. The
// calendar honours these, so every day-coloured surface here has to as well -
// otherwise a day recoloured in Settings would only change on the calendar.
function useDayColorOverrides(): Record<string, string> {
  const colorsQuery = useGetCalendarColors();
  const map: Record<string, string> = {};
  (colorsQuery.data ?? []).forEach((c) => { map[c.dayLabel] = c.hexColor; });
  return map;
}

// One row of the inset-grouped roster: name over muscles, sets × reps as quiet
// trailing text, a hairline under every row but the last. The separator lives on
// the inner block so it starts at the text inset, the way iOS grouped lists do.
function RosterRow({ ex }: { ex: Exercise }) {
  // A checklist row has no muscle and no sets×reps: the category (with a small
  // check in its colour) sits where the muscles would be, and the target
  // ("2:30", "× 20") where the sets × reps would be.
  const checklist = isChecklist(ex);
  const meta = checklist ? categoryMeta(ex.category) : null;
  const checkColor = meta?.token ?? CHECKLIST_ACCENT;
  const trailing = checklist ? describeTargetWithRounds({ ...ex, rounds: ex.sets }) : `${ex.sets} × ${ex.reps}`;

  return (
    <div className="group flex items-center pl-5">
      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[15px] pr-5 group-last:border-b-0">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-normal text-foreground">{ex.name}</h3>
          <p className="mt-[3px] truncate text-[12.5px] text-muted-foreground">
            {checklist ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: checkColor }}>
                <ListChecks className="h-3.5 w-3.5 shrink-0" />
                {meta ? meta.label : "Checklist"}
              </span>
            ) : (
              <>
                {ex.muscle || "—"}
                {ex.secondaryMuscle && <> · {ex.secondaryMuscle}</>}
              </>
            )}
          </p>
        </div>
        {trailing && <span className="whitespace-nowrap text-[15px] text-muted-foreground">{trailing}</span>}
      </div>
    </div>
  );
}

type EditExercise = {
  name: string;
  sets: string;
  reps: string;
  muscle: string;
  secondaryMuscle: string;
  isUnilateral: boolean;
  // Checklist fields. `kind` decides which row shape renders and which validation
  // applies; the rest are only read when kind === "checklist".
  kind: ItemKind;
  targetType: TargetType;
  /** Seconds, straight from the min/sec wheel - the same unit the API stores. */
  durationSeconds: number;
  targetValue: string;
  targetUnit: string;
  category: string;
};
type EditDay = { label: string; exercises: EditExercise[] };

const CHECKLIST_DEFAULTS = {
  kind: "checklist" as ItemKind,
  targetType: "none" as TargetType,
  durationSeconds: 0,
  targetValue: "",
  targetUnit: "m",
  category: "",
};

function newExercise(): EditExercise {
  // Section 1: default sets to 2 in the build-your-own flow.
  return {
    name: "", sets: "2", reps: "8-12", muscle: "", secondaryMuscle: "", isUnilateral: false,
    ...CHECKLIST_DEFAULTS,
    kind: "lift",
  };
}

// Starts as a plain tick-off: targetType "none", one round, no category. Every
// target field is optional by design, so typing a name is the whole minimum.
function newChecklistItem(): EditExercise {
  return {
    name: "", sets: "1", reps: "", muscle: "", secondaryMuscle: "", isUnilateral: false,
    ...CHECKLIST_DEFAULTS,
  };
}

function programToEditDays(program: { days: unknown }): EditDay[] {
  const days = (program.days as ProgramDay[]) ?? [];
  return days.map((d) => ({
    label: d.label ?? "",
    exercises: (d.exercises ?? []).map((e) => ({
      name: e.name ?? "",
      // A checklist item defaults to a single round; a lift keeps the old default.
      sets: String(e.sets ?? (isChecklist(e) ? 1 : 2)),
      reps: e.reps ?? "",
      muscle: e.muscle ?? "",
      secondaryMuscle: e.secondaryMuscle ?? "",
      isUnilateral: !!e.isUnilateral,
      kind: isChecklist(e) ? "checklist" : "lift",
      targetType: (e.targetType ?? "none") as TargetType,
      // Clamped to what the wheel can express, so a legacy row storing more than
      // an hour doesn't land on a position the picker can't scroll back to.
      durationSeconds: Math.min(Math.max(0, e.targetSeconds ?? 0), MAX_WHEEL_SECONDS),
      targetValue: e.targetValue != null ? String(e.targetValue) : "",
      targetUnit: e.targetUnit ?? "m",
      category: e.category ?? "",
    })),
  }));
}

// Which field is blocking the save, and what to say about it. `exercise` is
// undefined when the offender is the day's own name.
type FieldError = {
  day: number;
  exercise?: number;
  field: "label" | "name" | "sets";
  message: string;
};

const MISSING_FIELD_MESSAGE = "Missing fields above - fill them in before saving.";

// Shared between the Save-button gate and the draft-restore path, so a crash
// or reload mid-edit reproduces exactly the same "first bad field" flag
// the user would have seen by clicking Save right before it happened.
//
// Sets is checked here rather than being quietly coerced at save time: entering 0
// used to display 0, save 2, and say nothing about it.
function findInvalidField(days: EditDay[]): FieldError | null {
  for (let di = 0; di < days.length; di++) {
    if (!days[di].label.trim()) return { day: di, field: "label", message: MISSING_FIELD_MESSAGE };
    for (let ei = 0; ei < days[di].exercises.length; ei++) {
      const ex = days[di].exercises[ei];
      if (!ex.name.trim()) return { day: di, exercise: ei, field: "name", message: MISSING_FIELD_MESSAGE };
      // A checklist item requires nothing beyond its name. Its target fields are
      // optional on purpose - a blank duration just means "plain tick-off", not an
      // error - and its round count is picked from a bounded select, so neither can
      // be out of range. Rounds is still range-checked below via the shared path.
      if (ex.kind === "checklist") {
        const roundsMessage = ex.sets.trim() ? rangeError(ex.sets, FIELD_LIMITS.sets) : null;
        if (roundsMessage) return { day: di, exercise: ei, field: "sets", message: roundsMessage };
        continue;
      }
      // Blank is an error here, unlike the optional profile fields rangeError is
      // usually pointing at - an exercise has to have a set count.
      const setsMessage = ex.sets.trim()
        ? rangeError(ex.sets, FIELD_LIMITS.sets)
        : `Enter ${FIELD_LIMITS.sets.article} ${FIELD_LIMITS.sets.noun} between ${FIELD_LIMITS.sets.min} and ${FIELD_LIMITS.sets.max}.`;
      if (setsMessage) return { day: di, exercise: ei, field: "sets", message: setsMessage };
    }
  }
  return null;
}

// A day card's colour is its position in the program (day 1 = first palette
// colour), which is exactly what /program and the calendar derive their colours
// from once the program is saved - so what you see while editing is what you
// get everywhere else. Reordering days therefore reshuffles the colours, by
// design: the colour belongs to the slot, not to the card being dragged. A
// label the user has recoloured in Settings keeps that colour instead.
function editDayTones(day: EditDay, index: number, overrides: Record<string, string>) {
  return dayTones(overrides[day.label.trim()] ?? dayColorAt(index));
}

type ProgramDraft = { programName: string; days: EditDay[]; savedAt: number };

const PROGRAM_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // discard drafts older than a day

// "new" covers the not-yet-created manual program - there's only ever one
// manual program per user, so a single draft slot for it is enough.
export function programDraftKey(userId: string, programId: number | "new"): string {
  return `traintent:program-draft:${userId}:${programId}`;
}

export function loadProgramDraft(key: string): ProgramDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgramDraft;
    if (!parsed || !Array.isArray(parsed.days)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > PROGRAM_DRAFT_MAX_AGE_MS) return null;
    // Drafts written while days carried their own accent index still restore
    // fine - colour is positional now, so the stored field is simply ignored.
    return parsed;
  } catch {
    return null;
  }
}

function saveProgramDraft(key: string, programName: string, days: EditDay[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ programName, days, savedAt: Date.now() } as ProgramDraft));
  } catch {
    // localStorage unavailable (e.g. private browsing) - degrade to in-memory only
  }
}

function clearProgramDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Canonical, order- and whitespace-independent form of a builder state, so
// "does this draft actually differ from the saved program?" can't be answered
// wrongly by key order or a stray space. Defensive about missing fields: drafts
// are read back from localStorage and may predate any of them.
function serializeBuilderState(programName: string, days: EditDay[]): string {
  return JSON.stringify([
    (programName ?? "").trim(),
    (days ?? []).map((d) => [
      (d.label ?? "").trim(),
      (d.exercises ?? []).map((e) => [
        (e.name ?? "").trim(),
        (e.sets ?? "").trim(),
        (e.reps ?? "").trim(),
        e.muscle ?? "",
        e.secondaryMuscle ?? "",
        !!e.isUnilateral,
      ]),
    ]),
  ]);
}

// What the builder opens on before the user touches anything: the saved program
// when editing, or one blank day when creating.
function baselineBuilderState(program?: { programName: string; days: unknown } | null): string {
  return program
    ? serializeBuilderState(program.programName, programToEditDays(program))
    : serializeBuilderState("", [{ label: "", exercises: [newExercise()] }]);
}

// True only for a draft holding work that isn't already saved. The program page
// uses this - not the mere existence of a draft - to decide whether to reopen
// the builder, so a draft left behind by an earlier version (which saved one
// unconditionally, even for an untouched editor) can't pin the page to edit mode.
export function programDraftHasChanges(
  draft: ProgramDraft | null,
  program?: { programName: string; days: unknown } | null,
): boolean {
  if (!draft) return false;
  return serializeBuilderState(draft.programName, draft.days) !== baselineBuilderState(program);
}

type BuilderProps = {
  onSaved: () => void;
  onCancel?: () => void;
  // When provided, the builder edits this existing program instead of creating a new one.
  editProgram?: { id: number; programName: string; splitType: string; days: unknown } | null;
};

export function ManualProgramBuilder({ onSaved, onCancel, editProgram }: BuilderProps) {
  const createManualProgram = useCreateManualProgram();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const colorOverrides = useDayColorOverrides();
  const draftKey = user?.id ? programDraftKey(user.id, editProgram?.id ?? "new") : null;
  // Captured once at mount - if the user's id weren't loaded yet on the very
  // first render, draftKey may still be null then even though it resolves a
  // moment later, so the initializers below use this snapshot consistently.
  const initialDraft = useRef(draftKey ? loadProgramDraft(draftKey) : null).current;

  const [saving, setSaving] = useState(false);
  const [programName, setProgramName] = useState(
    () => initialDraft?.programName ?? editProgram?.programName ?? "",
  );
  const [days, setDays] = useState<EditDay[]>(() =>
    initialDraft
      ? initialDraft.days
      : editProgram ? programToEditDays(editProgram) : [{ label: "", exercises: [newExercise()] }],
  );
  const [dragDay, setDragDay] = useState<number | null>(null);
  // The one field currently blocking a save. Seeded from the restored draft (if
  // any) so a crash/reload mid-edit shows the same flag a Save click would have.
  const [fieldError, setFieldError] = useState<FieldError | null>(
    () => (initialDraft ? findInvalidField(initialDraft.days) : null),
  );
  const [showMuscleConfirm, setShowMuscleConfirm] = useState(false);
  // A failed save used to be swallowed entirely: performSave had a `finally`
  // but no `catch`, so a rejected request left the builder sitting there with
  // no program saved and nothing on screen to say why. Hold the reason here so
  // the user sees it instead of an apparent no-op.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Cancel with unsaved work behind it asks first, rather than silently
  // throwing the edits away.
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Anything on screen that differs from what's already saved is unsaved work -
  // the baseline is the saved program (or a blank day), never the restored draft.
  const baseline = useRef(baselineBuilderState(editProgram)).current;
  const isDirty = serializeBuilderState(programName, days) !== baseline;

  // Mirror unsaved changes to localStorage so a reload never loses in-progress
  // program edits. A draft is *only* written while the builder differs from
  // what's already saved: a draft that matches the program is indistinguishable
  // from "nothing in progress", and my.tsx reads a draft's existence as the
  // signal to reopen the builder - so merely opening the editor and leaving
  // would otherwise pin the page to edit mode forever.
  useEffect(() => {
    if (!draftKey) return;
    if (!isDirty) {
      clearProgramDraft(draftKey);
      return;
    }
    saveProgramDraft(draftKey, programName, days);
  }, [draftKey, programName, days, isDirty]);

  function moveDay(from: number, to: number) {
    if (from === to) return;
    setDays((d) => {
      if (to < 0 || to >= d.length) return d;
      const next = [...d];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addDay() {
    setDays((d) => [...d, { label: "", exercises: [newExercise()] }]);
  }

  function removeDay(di: number) {
    setDays((d) => d.filter((_, i) => i !== di));
  }

  function updateDay(di: number, field: keyof EditDay, value: string) {
    setDays((d) => d.map((day, i) => i === di ? { ...day, [field]: value } : day));
    if (field === "label" && fieldError?.field === "label" && fieldError.day === di && value.trim()) {
      setFieldError(null);
    }
  }

  function addExercise(di: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: [...day.exercises, newExercise()] } : day
    ));
  }

  // Appends to the same `exercises` array as addExercise, so a checklist item is
  // reorderable against the lifts with the existing arrows rather than living in a
  // separate list that could only sit before or after them.
  function addChecklistItem(di: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: [...day.exercises, newChecklistItem()] } : day
    ));
  }

  function removeExercise(di: number, ei: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: day.exercises.filter((_, j) => j !== ei) } : day
    ));
  }

  function moveExercise(di: number, ei: number, dir: -1 | 1) {
    setDays((d) => d.map((day, i) => {
      if (i !== di) return day;
      const target = ei + dir;
      if (target < 0 || target >= day.exercises.length) return day;
      const ex = [...day.exercises];
      [ex[ei], ex[target]] = [ex[target], ex[ei]];
      return { ...day, exercises: ex };
    }));
  }

  // Several fields at once, for the library picker - choosing an exercise sets
  // its name and primary muscle together, which as two updateExercise calls
  // would have the second overwrite the first's stale copy of the day.
  function patchExercise(di: number, ei: number, patch: Partial<EditExercise>) {
    setDays((d) => d.map((day, i) =>
      i === di
        ? { ...day, exercises: day.exercises.map((ex, j) => j === ei ? { ...ex, ...patch } : ex) }
        : day
    ));
    // Clear the flag as soon as the offending field is made valid, so the red
    // border tracks the fix instead of waiting for another Save click.
    if (fieldError?.day !== di || fieldError.exercise !== ei) return;
    if (fieldError.field === "label") return;
    const fixed = patch[fieldError.field];
    if (typeof fixed !== "string") return;
    if (fieldError.field === "name" && fixed.trim()) setFieldError(null);
    if (fieldError.field === "sets" && fixed.trim() && !rangeError(fixed, FIELD_LIMITS.sets)) setFieldError(null);
  }

  function updateExercise(di: number, ei: number, field: keyof EditExercise, value: string | boolean | number) {
    const patch = { [field]: value } as Partial<EditExercise>;
    // Switching how an item is measured clears the previous measure's value, so
    // a duration left over from an earlier choice can't be saved against a
    // "distance" item and quietly arm a timer. Done here rather than in
    // patchExercise, which is a plain multi-field write with no rules of its own.
    if (field === "targetType") {
      if (value !== "duration") patch.durationSeconds = 0;
      if (value !== "count" && value !== "distance") patch.targetValue = "";
    }
    patchExercise(di, ei, patch);
  }

  async function performSave() {
    const programDays: ProgramDay[] = days.map((d, i) => ({
      dayNumber: i + 1,
      label: d.label.trim(),
      focus: d.label.trim(),
      exercises: d.exercises.map((e) => {
        if (e.kind === "checklist") {
          const targetSeconds = e.targetType === "duration" ? e.durationSeconds : null;
          const rounds = parseInt(e.sets, 10) || 1;
          const targetValue =
            (e.targetType === "count" || e.targetType === "distance") && e.targetValue.trim()
              ? clampTargetValue(Number(e.targetValue), e.targetType)
              : null;
          return {
            name: e.name.trim(),
            // `sets` is the round count and `reps` the display target on a
            // checklist row - reusing the required lift fields is what lets this
            // ship without changing Exercise's required set.
            sets: rounds,
            reps: describeTarget({
              targetType: e.targetType,
              targetSeconds,
              targetValue,
              targetUnit: e.targetUnit,
            }) ?? "",
            rpe: null,
            restSeconds: null,
            cue: null,
            // Deliberately blank: muscleKeyOf("") returns null, so the
            // muscle-volume breakdown and the day's hero tint both skip this row.
            muscle: "",
            secondaryMuscle: null,
            isUnilateral: false,
            kind: "checklist" as const,
            targetType: e.targetType,
            targetSeconds,
            targetValue,
            targetUnit: e.targetType === "distance" ? e.targetUnit : e.targetType === "count" ? "reps" : null,
            category: e.category || null,
          };
        }
        return {
          name: e.name.trim(),
          // Safe to parse bare: handleSave/findInvalidField already rejected anything
          // that isn't a whole number in range, so there's no fallback to hide a 0
          // behind any more.
          sets: parseInt(e.sets, 10),
          reps: e.reps,
          rpe: null,
          restSeconds: null,
          cue: null,
          muscle: e.muscle,
          secondaryMuscle: e.secondaryMuscle || null,
          isUnilateral: e.isUnilateral,
          kind: "lift" as const,
        };
      }),
    }));

    const body = {
      programName: programName || "My Program",
      splitType: editProgram?.splitType || "Custom",
      days: programDays,
    };

    setSaving(true);
    setSaveError(null);
    try {
      if (editProgram) {
        // Generated useUpdateProgram has a broken URL (literal :id), so call directly.
        await customFetch(`/api/programs/${editProgram.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await createManualProgram.mutateAsync({ data: body as any });
      }
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
      if (draftKey) clearProgramDraft(draftKey);
      onSaved();
    } catch (err) {
      // Surface the reason rather than failing silently. ApiError's message
      // already carries the status and whatever the server chose to return, so
      // this stays useful for a real failure without inventing a diagnosis.
      // The draft is deliberately left in place - the work isn't saved, so
      // clearing it would lose the program the user just built.
      //
      // ApiError also records which request failed. It isn't exported from
      // @workspace/api-client-react, so read those fields structurally rather
      // than widening that package's API for an error message. Naming the
      // method and URL is the difference between "something went wrong" and a
      // report that can actually be acted on.
      const request =
        err && typeof err === "object" && "method" in err && "url" in err
          ? ` [${String((err as { method: unknown }).method)} ${String((err as { url: unknown }).url)}]`
          : "";
      setSaveError(
        err instanceof Error
          ? `Couldn't save your program: ${err.message}${request}`
          : "Couldn't save your program. Please try again.",
      );
    } finally {
      setSaving(false);
      setShowMuscleConfirm(false);
    }
  }

  // Gate before performSave: block on the first bad field - a day's own name, an
  // exercise's name, or its set count - one at a time (fixing it and saving again
  // surfaces the next one, rather than dumping every error on screen at once).
  // Once those are clean, a dismissible reminder covers exercises with no muscle
  // group set (allowed to proceed, unlike a name).
  function handleSave() {
    const invalid = findInvalidField(days);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    setFieldError(null);

    // Checklist items are excluded: they have no muscle by design, so counting them
    // here would raise the reminder on every save of a program that has one.
    const hasUnsetMuscle = days.some((d) =>
      d.exercises.some((e) => e.kind !== "checklist" && e.name.trim() && !e.muscle),
    );
    if (hasUnsetMuscle) {
      setShowMuscleConfirm(true);
      return;
    }

    performSave();
  }

  // Cancel means "forget these edits", so the draft has to go with them -
  // leaving it behind used to bounce the user straight back into the builder
  // the next time the program page mounted (start a workout, log or discard it,
  // come back, and the edit view was waiting there as if Cancel never happened).
  function discardEdits() {
    if (draftKey) clearProgramDraft(draftKey);
    setShowCancelConfirm(false);
    onCancel?.();
  }

  function handleCancel() {
    if (isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    discardEdits();
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-muted-foreground block mb-1.5">Program name</label>
        <input
          type="text"
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          placeholder="e.g. My PPL Program"
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {days.map((day, di) => {
        const accent = editDayTones(day, di, colorOverrides);
        return (
        <div
          key={di}
          onDragOver={(e) => { if (dragDay !== null) e.preventDefault(); }}
          onDrop={() => { if (dragDay !== null) moveDay(dragDay, di); setDragDay(null); }}
          style={{ borderLeftColor: accent.solid, borderLeftWidth: 4 }}
          className={`p-5 rounded-xl bg-card border space-y-4 transition-colors ${
            dragDay === di ? "border-primary/60 opacity-60" : "border-border"
          }`}
          data-testid={`day-card-${di}`}
        >
          <div className="flex items-center gap-2">
            <div
              draggable
              onDragStart={() => setDragDay(di)}
              onDragEnd={() => setDragDay(null)}
              className="flex items-center gap-2 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground"
              title="Drag to reorder"
              data-testid={`day-drag-${di}`}
            >
              <GripVertical className="w-4 h-4" />
              <span
                style={{ backgroundColor: accent.soft, color: accent.text }}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
              >
                Day {di + 1}
              </span>
            </div>
            {/* min-w-0 is load-bearing: a text input's intrinsic width (~212px)
                is its automatic minimum size, so without it the input refuses to
                shrink on a phone and shoves the reorder and delete buttons out
                past the card's right edge. */}
            <input
              type="text"
              value={day.label}
              onChange={(e) => updateDay(di, "label", e.target.value)}
              maxLength={MAX_DAY_LABEL}
              placeholder={`Day ${di + 1} name (e.g. Push, Upper A)`}
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg border bg-secondary/20 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary ${
                fieldError?.field === "label" && fieldError.day === di ? "border-destructive" : "border-border"
              }`}
              data-testid={`day-name-input-${di}`}
            />
            {days.length > 1 && (
              <div className="flex items-center gap-0.5 shrink-0">
                {/* Arrow reorder mirrors the exercise rows and keeps days
                    reorderable where drag-and-drop is not available (touch). */}
                <button
                  onClick={() => moveDay(di, di - 1)}
                  disabled={di === 0}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                  title="Move day up"
                  data-testid={`day-move-up-${di}`}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveDay(di, di + 1)}
                  disabled={di === days.length - 1}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                  title="Move day down"
                  data-testid={`day-move-down-${di}`}
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeDay(di)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete day"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {day.exercises.map((ex, ei) => ex.kind === "checklist" ? (
              // A checklist row is deliberately a different shape from a lift row - no
              // muscle/sets/reps grid - so the two never blur together in a mixed
              // day. The reorder and delete controls are the same ones the lift
              // rows use. Background stays the same neutral fill as a lift row;
              // the accent border and pill carry the distinction on their own.
              <div
                key={ei}
                className="rounded-lg border border-chart-4/30 p-3 space-y-2 bg-secondary/10"
                data-testid={`checklist-item-${di}-${ei}`}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-chart-4/15 text-chart-4 text-[11px] font-medium flex items-center justify-center">
                    {ei + 1}
                  </span>
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-chart-4 border border-chart-4/30 bg-chart-4/10 rounded-full px-2 py-0.5">
                    <ListChecks className="w-3 h-3" />
                    <span className="hidden sm:inline">Checklist</span>
                  </span>
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => updateExercise(di, ei, "name", e.target.value)}
                    maxLength={MAX_EXERCISE_NAME}
                    placeholder="e.g. Couch stretch"
                    className={`flex-1 min-w-0 px-3 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground ${
                      fieldError?.field === "name" && fieldError.day === di && fieldError.exercise === ei
                        ? "border-destructive"
                        : "border-border"
                    }`}
                    data-testid={`checklist-name-input-${di}-${ei}`}
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => moveExercise(di, ei, -1)}
                      disabled={ei === 0}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                      title="Move up"
                      data-testid={`checklist-move-up-${di}-${ei}`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveExercise(di, ei, 1)}
                      disabled={ei === day.exercises.length - 1}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                      title="Move down"
                      data-testid={`checklist-move-down-${di}-${ei}`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeExercise(di, ei)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      data-testid={`checklist-remove-${di}-${ei}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* items-start because the duration wheel is taller than a text
                    input, and without it every other field on the line would be
                    stretched to match. */}
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-6 sm:col-span-5">
                    <label className="text-[11px] text-muted-foreground block mb-1">Track by</label>
                    <select
                      value={ex.targetType}
                      onChange={(e) => updateExercise(di, ei, "targetType", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary"
                      data-testid={`checklist-tracktype-${di}-${ei}`}
                    >
                      {TARGET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    {/* The wheel lives inside the Track by cell, directly under
                        the select that summons it, rather than in a band of its
                        own further down the card. Same column means it reads as
                        this selector's value, and it lays out identically on
                        mobile and desktop - the column is the only thing that
                        needs to be wide enough for it. */}
                    {ex.targetType === "duration" && (
                      <div className="mt-1.5">
                        <DurationWheel
                          seconds={ex.durationSeconds}
                          onChange={(s) => updateExercise(di, ei, "durationSeconds", s)}
                          accent="hsl(var(--chart-4))"
                          testId={`checklist-duration-${di}-${ei}`}
                        />
                      </div>
                    )}
                  </div>

                  {(ex.targetType === "count" || ex.targetType === "distance") && (
                    <div className={ex.targetType === "distance" ? "col-span-3 sm:col-span-2" : "col-span-3 sm:col-span-4"}>
                      <label className="text-[11px] text-muted-foreground block mb-1 text-center">Amount</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ex.targetValue}
                        onChange={(e) => updateExercise(di, ei, "targetValue", e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder={ex.targetType === "count" ? "20" : "400"}
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                        data-testid={`checklist-amount-input-${di}-${ei}`}
                      />
                    </div>
                  )}

                  {ex.targetType === "distance" && (
                    <div className="col-span-3 sm:col-span-2">
                      <label className="text-[11px] text-muted-foreground block mb-1 text-center">Unit</label>
                      <select
                        value={ex.targetUnit}
                        onChange={(e) => updateExercise(di, ei, "targetUnit", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary"
                        data-testid={`checklist-unit-${di}-${ei}`}
                      >
                        {DISTANCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  )}

                  <div className={ex.targetType === "count" || ex.targetType === "distance" ? "col-span-3" : "col-span-6 sm:col-span-3"}>
                    <label className="text-[11px] text-muted-foreground block mb-1 text-center">Rounds</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={ex.sets}
                      onChange={(e) => updateExercise(di, ei, "sets", e.target.value)}
                      placeholder="1"
                      className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary ${
                        fieldError?.field === "sets" && fieldError.day === di && fieldError.exercise === ei
                          ? "border-destructive"
                          : "border-border"
                      }`}
                      data-testid={`checklist-rounds-input-${di}-${ei}`}
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-6">
                    <label className="text-[11px] text-muted-foreground block mb-1">Category (optional)</label>
                    <select
                      value={ex.category}
                      onChange={(e) => updateExercise(di, ei, "category", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border/70 bg-secondary/10 text-foreground text-sm focus:outline-none focus:border-primary"
                      data-testid={`checklist-category-${di}-${ei}`}
                    >
                      <option value="">None</option>
                      {CHECKLIST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Confirms what the wheel actually arms, in words. Kept out of the
                    grid so it reads as a statement about the row rather than a
                    fourth field, and so it can appear and disappear without
                    reflowing the fields above it. */}
                {ex.targetType === "duration" && ex.durationSeconds > 0 && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold text-chart-4"
                    data-testid={`checklist-timer-hint-${di}-${ei}`}
                  >
                    <Timer className="w-3 h-3" />
                    Shows a {formatDuration(ex.durationSeconds)} timer when logging
                  </span>
                )}
              </div>
            ) : (
              <div
                key={ei}
                className={`rounded-lg border border-border/60 p-3 space-y-2 ${
                  ei % 2 === 0 ? "bg-secondary/10" : "bg-secondary/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-secondary/60 text-muted-foreground text-[11px] font-medium flex items-center justify-center">
                    {ei + 1}
                  </span>
                  <ExerciseNamePicker
                    value={ex.name}
                    onChange={(name) => updateExercise(di, ei, "name", name)}
                    // Picking from the library is a deliberate statement about
                    // the exercise, so it overwrites the primary muscle. The
                    // secondary muscle is left exactly as the user set it.
                    onPick={({ name, muscle }) => patchExercise(di, ei, { name, muscle })}
                    invalid={
                      fieldError?.field === "name" && fieldError.day === di && fieldError.exercise === ei
                    }
                    maxLength={MAX_EXERCISE_NAME}
                    testId={`exercise-name-input-${di}-${ei}`}
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => moveExercise(di, ei, -1)}
                      disabled={ei === 0}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveExercise(di, ei, 1)}
                      disabled={ei === day.exercises.length - 1}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeExercise(di, ei)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <label className="text-[11px] text-muted-foreground block mb-1">Primary muscle worked</label>
                    <select
                      value={ex.muscle}
                      onChange={(e) => updateExercise(di, ei, "muscle", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">Select…</option>
                      {MUSCLE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground block mb-1 text-center">Sets</label>
                    <input
                      type="text"
                      value={ex.sets}
                      onChange={(e) => updateExercise(di, ei, "sets", e.target.value)}
                      placeholder="Sets"
                      className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary ${
                        fieldError?.field === "sets" && fieldError.day === di && fieldError.exercise === ei
                          ? "border-destructive"
                          : "border-border"
                      }`}
                      data-testid={`exercise-sets-input-${di}-${ei}`}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground block mb-1 text-center">Reps</label>
                    <input
                      type="text"
                      value={ex.reps}
                      onChange={(e) => updateExercise(di, ei, "reps", e.target.value)}
                      placeholder="Reps"
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="col-span-12">
                    <label className="text-[11px] text-muted-foreground/80 block mb-1">Secondary muscle worked (optional)</label>
                    <select
                      value={ex.secondaryMuscle}
                      onChange={(e) => updateExercise(di, ei, "secondaryMuscle", e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border/70 bg-secondary/10 text-muted-foreground text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">None</option>
                      {MUSCLE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Section 2: subtle unilateral checkbox, low visual weight. */}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground/80 cursor-pointer w-fit select-none">
                  <input
                    type="checkbox"
                    checked={ex.isUnilateral}
                    onChange={(e) => updateExercise(di, ei, "isUnilateral", e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border accent-primary"
                  />
                  Unilateral (one side at a time)
                </label>
              </div>
            ))}
          </div>

          {/* Two explicit buttons rather than one "Add item" that opens a type
              menu: the menu would cost a tap on every add and hide the checklist
              feature behind a control you'd have to already know about. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              onClick={() => addExercise(di)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`add-exercise-${di}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add exercise
            </button>
            <button
              onClick={() => addChecklistItem(di)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`add-checklist-item-${di}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add checklist item
            </button>
          </div>
        </div>
        );
      })}

      <button
        onClick={addDay}
        className="w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add training day
      </button>

      {fieldError && (
        <p className="text-sm text-destructive" data-testid="name-error">
          {fieldError.message}
        </p>
      )}

      {saveError && (
        <div
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          data-testid="save-error"
        >
          {saveError}
        </div>
      )}

      {showMuscleConfirm ? (
        <div className="p-4 rounded-xl bg-secondary/20 border border-border space-y-3" data-testid="muscle-confirm">
          <p className="text-sm text-foreground">
            Some exercises don't have a muscle group set. You can save without it, but they won't
            show up in your muscle-volume breakdown.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMuscleConfirm(false)}
              className="px-5 h-11 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-muscle-confirm-back"
            >
              Go back
            </button>
            <button
              onClick={performSave}
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              data-testid="button-save-anyway"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                "Save anyway"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {onCancel && (
            <button
              onClick={handleCancel}
              data-testid="button-cancel-builder"
              className="px-5 h-12 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> {editProgram ? "Save changes" : "Save program"}</>
            )}
          </button>
        </div>
      )}

      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={(next) => { if (!next) setShowCancelConfirm(false); }}
      >
        <AlertDialogContent data-testid="dialog-discard-program-edits">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {editProgram
                ? "Your program stays exactly as it was saved - everything you changed here will be lost."
                : "The program you've started building won't be saved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Same footer ordering as DiscardSessionDialog: keep the safe action
              first on mobile instead of the destructive one. */}
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel data-testid="button-keep-editing">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={discardEdits}
              className="bg-red-500/90 text-white hover:bg-red-500"
              data-testid="button-discard-program-edits"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The read-only view of a program's schedule. Always shows the next seven days
// rather than "the week", because that is the question a rotating cycle actually
// answers - a 3-day rotation has no weeks, and pinning it to Mon-Sun would make
// it look like it repeated every seven days when it doesn't.
//
// Renders nothing at all for an unscheduled program, which covers every row that
// predates the feature. It is not what keeps the strip off the manual lineage,
// though - that is the caller's job, since a manual row can still carry a stale
// schedule. See the call site in ProgramWeekView.
//
// Parked (2026-09-23): the Sessions redesign of the program page took the week
// strip out for now, so nothing renders this. Kept because a reworked week view
// is expected back; restore it in ProgramWeekView between the hero and the tabs.
export function ScheduleStrip({
  schedule,
  startDate,
  days,
  colorFor,
  onPickDay,
}: {
  schedule: StoredSchedule | null;
  startDate: string | null;
  days: ProgramDay[];
  colorFor: (day: ProgramDay) => string;
  onPickDay?: (dayNumber: number) => void;
}) {
  if (!schedule?.slots?.length) return null;

  const today = todayDateString();
  const upcoming = upcomingSlots(schedule, startDate, today, 7);
  if (!upcoming.length) return null;

  const dayByNumber = new Map(days.map((d) => [d.dayNumber, d]));

  return (
    <div className="space-y-2" data-testid="program-schedule-strip">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {schedule.mode === "rotating" ? (
          <><RotateCw className="w-3.5 h-3.5" /> {schedule.slots.length}-day rotation</>
        ) : (
          <><CalendarDays className="w-3.5 h-3.5" /> Every week</>
        )}
      </div>
      {/* Scrolls rather than squeezing into 7 equal columns: at phone width that
          left every cell ~41px, where "Posterior 1" and "Posterior 2" both
          truncate to "Pos…" - useless for the one question this strip answers.
          Cells keep a floor width and scroll instead, the same idiom as the day
          switcher directly below. */}
      <div className="flex gap-1.5 overflow-x-auto">
        {upcoming.map(({ date, dayId }, i) => {
          const day = dayId != null ? dayByNumber.get(dayId) : null;
          const tones = day ? dayTones(colorFor(day)) : null;
          const isToday = i === 0;
          return (
            <button
              key={date}
              type="button"
              disabled={!day}
              onClick={() => day && onPickDay?.(day.dayNumber)}
              style={
                tones
                  ? { backgroundColor: tones.soft, boxShadow: `inset 0 0 0 1px ${tones.solid}` }
                  : undefined
              }
              className={`flex-1 shrink-0 basis-[4.75rem] rounded-lg px-1.5 py-2 text-center transition-colors ${
                tones ? "" : "bg-secondary/40 border border-border"
              } ${day ? "cursor-pointer" : "cursor-default"}`}
              data-testid={`schedule-strip-day-${i}`}
            >
              <span
                className={`block text-[10px] uppercase tracking-wide ${
                  isToday ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                {isToday ? "Today" : WEEKDAY_LABELS[mondayIndexOf(date) ?? 0]}
              </span>
              <span
                className="block text-[11px] font-medium truncate mt-0.5"
                style={tones ? { color: tones.text } : undefined}
              >
                {day ? day.label : <span className="text-muted-foreground">Rest</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Shown on a program page whose lineage is NOT the active training mode -
// explains why workout logging isn't offered there.
export function InactiveLineageNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] bg-card px-4 py-3.5" data-testid="inactive-lineage-notice">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {children}{" "}
        <Link href="/settings" className="text-foreground underline underline-offset-[3px]">Switch mode in Settings</Link>
      </p>
    </div>
  );
}

// Every program page state (loading, empty, builder, the program itself) sits
// in this wrapper, so the whole route wears the Sessions look: black canvas,
// neutral grey cards, thin Inter. See TrainientAppDesign.md.
export function ProgramPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-sessions min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 p-6">{children}</div>
    </div>
  );
}

// Titles on the program pages: large and light, as in the reference.
export const PROGRAM_TITLE_CLASS = "text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground";

// The two lineage badges shown after "Split · Week N".
export function ProgramBadge({ kind }: { kind: "ai" | "custom" }) {
  return kind === "ai" ? (
    <span className="rounded-full bg-[hsl(var(--sessions-cyan)/0.1)] px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--sessions-cyan))]">
      AI Coach
    </span>
  ) : (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
      Custom
    </span>
  );
}

// Marks the program-page leg of the first-run tour as seen. Shared by the
// "no program yet" empty state (my.tsx) and ProgramWeekView below so the flag
// name lives in one place - either surface finishing it retires both.
export function useFinishProgramTour(): () => void {
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  return () => {
    updateProfile.mutate(
      { data: { programPageTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
  };
}

type ProgramWeekViewProps = {
  program: Program;
  // Only the lineage matching the active training mode can start a workout -
  // workout logging always targets the active mode's current program, so a
  // "Start workout" on the other lineage's page would log against the wrong one.
  canStartWorkout: boolean;
  badge?: ReactNode;
  // Renders an Edit button in the header when provided (manual programs only).
  onEdit?: () => void;
  // The program-page coachmark tour ends by navigating into workout logging,
  // so it only runs on the active mode's page.
  tourEnabled?: boolean;
};

export function ProgramWeekView({ program, canStartWorkout, badge, onEdit, tourEnabled = false }: ProgramWeekViewProps) {
  const profileQuery = useGetProfile();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [activeDay, setActiveDay] = useState(0);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  // The in-progress session that "Start workout" would have to throw away.
  const [conflict, setConflict] = useState<ActiveSessionPointer | null>(null);
  const tourProgramBodyRef = useRef<HTMLDivElement>(null);
  const tourStartWorkoutRef = useRef<HTMLButtonElement>(null);
  const finishProgramTour = useFinishProgramTour();

  const showProgramTour =
    tourEnabled &&
    !!profileQuery.data && !profileQuery.data.programPageTourSeenAt &&
    !isPreCalibrationLocked(program, new Date());

  const durationStats = useGetSessionDurationStats();
  const days = program.days as ProgramDay[];
  const day = days[activeDay];
  const locked = isPreCalibrationLocked(program, new Date());
  // In Independent mode the user reaches this page straight from the empty-state
  // tour (my.tsx), which already opened with "This is your program page…", so
  // repeating that intro here reads as two overlapping tours. Drop it and open
  // on the real program. AI mode has no empty-state tour (the program is
  // generated), so it keeps the page intro as its first step.
  const isIndependent = profileQuery.data?.mode === "independent";
  const programTourSteps: CoachmarkStep[] = [
    ...(isIndependent
      ? []
      : [{ kind: "center", text: "Here is your program page — where all your programs live." } as CoachmarkStep]),
    // Ring the tabs *and* the roster: the step says "your training days and
    // exercises", and the tabs alone are the days half. Anchoring on the whole
    // block also drops the bubble below it, instead of over the exercises.
    { target: tourProgramBodyRef, text: "Here's your program — your training days and exercises." },
    // The tour hands over to the real Start workout button rather than to the
    // Log nav item, because this button is the only thing that opens a session:
    // tapping Log without one lands on the log page's idle screen, with nothing
    // there to walk the client through.
    {
      kind: "navClick",
      target: tourStartWorkoutRef,
      text: "Ready to train? Tap here to start logging your workout.",
    },
  ];

  // Checklist items are invisible to both figures, and get no figure of their own:
  // their `sets` is a round count for something like a stretch hold, so adding it
  // to "Sets" would overstate the day's training volume, and counting them under
  // "Exercises" would misdescribe them. The item itself still shows in the roster
  // below and in the logger - it just isn't summarised as a number up here, so the
  // stats read purely as lifting volume (matching trainingWorkloadFor server-side).
  const liftExercises = day ? day.exercises.filter((ex) => !isChecklist(ex)) : [];
  const totalSets = liftExercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);

  // How long this session takes - measured, or not shown at all. There is no
  // estimate tier any more: the tile appears once this day has been trained
  // MIN_SESSIONS_FOR_AVERAGE times and stays absent until then, so the number
  // never has to be labelled as a guess or defended as one.
  const sessionDuration = (() => {
    if (!day) return null;
    const measured = durationStats.data?.stats.find(
      (s) => (s.dayLabel != null ? s.dayLabel === day.label : s.dayNumber === day.dayNumber)
    );
    if (!measured || measured.sampleCount < MIN_SESSIONS_FOR_AVERAGE) return null;
    return { text: formatSessionLength(measured.averageSeconds), label: "Avg duration" };
  })();

  // This page is the only way to pick which day to log - the log page itself
  // shows just the one day it is logging. Only one session can be in progress
  // at a time, so starting a different day has to offer to discard the current
  // one rather than silently orphaning it.
  function handleStartWorkout() {
    if (!day) return; // also stops the old `?day=undefined` navigation
    // This button is the tour's last step, so tapping it retires that leg
    // whatever happens next - a lock dialog, a conflict dialog, or the session.
    if (showProgramTour) finishProgramTour();
    if (locked) {
      setLockDialogOpen(true);
      return;
    }
    const active = user?.id ? resolveActiveSession(user.id) : null;
    const isSameSession =
      !!active &&
      String(active.pointer.programId) === String(program.id) &&
      active.pointer.dayNumber === day.dayNumber;
    if (active && !isSameSession) {
      setConflict(active.pointer);
      return;
    }
    // Start it here, and say so in the URL. An already-open session for this
    // same day is resumed, never restarted, so its logged sets and its running
    // clock both survive the round trip.
    //
    // `start=1` is the tap itself, carried across the navigation: it tells the
    // log page that this day was asked for, so it can begin the session if it
    // finds none. Without it, anything that stopped the write below from
    // landing - storage the browser refused, or a `user` Clerk hadn't resolved
    // yet when the button was pressed - dead-ended on the logger's idle screen,
    // which reads as "you didn't press Start workout" to someone who just did.
    if (user?.id && !isSameSession) startSession(user.id, program.id, day.dayNumber);
    setLocation(`/log?day=${day.dayNumber}&start=1`);
  }

  // The pointer can name a day of the *other* lineage's program, which this
  // page can't label - fall back to something generic rather than guessing.
  const conflictLabel =
    conflict && String(conflict.programId) === String(program.id)
      ? days.find((d) => d.dayNumber === conflict.dayNumber)?.label ?? "your other workout"
      : "your other workout";

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className={PROGRAM_TITLE_CLASS}>{program.programName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
              <span>
                {formatSplitType(program.splitType)} · Week {program.weekNumber}
              </span>
              {badge}
            </p>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              aria-label="Edit program"
              title="Edit program"
              className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
              data-testid="button-edit-program"
            >
              <Pencil className="h-5 w-5" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Day hero - the frosted "Work Time" card: glass top with the day, a
          stats band, and Start workout as the bottom-sheet row with the white
          play button. */}
      {day && (
        <motion.div
          key={`hero-${activeDay}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="relative overflow-hidden rounded-[30px] bg-card"
          data-testid="program-day-hero"
        >
          <div className="sessions-glass relative flex h-[196px] flex-col justify-between overflow-hidden px-5 pb-5 pt-[18px]">
            <div className="sessions-watermark" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i}>{"Train with intent · ".repeat(6)}</div>
              ))}
            </div>
            <div className="relative flex items-start justify-between gap-3">
              <div className="grid h-[60px] w-[60px] place-items-center rounded-full bg-black/35 text-[hsl(var(--sessions-cyan))]">
                <Dumbbell className="h-[26px] w-[26px]" strokeWidth={1.6} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-white/85">
                <Layers className="h-3.5 w-3.5" strokeWidth={1.6} />
                {liftExercises.length} {liftExercises.length === 1 ? "exercise" : "exercises"}
              </span>
            </div>
            <div className="relative min-w-0">
              <p className="text-xs uppercase tracking-[0.12em] text-white/75">Day {day.dayNumber}</p>
              <h2 className="mt-1 truncate text-2xl font-normal tracking-[-0.01em] text-white">{day.focus}</h2>
            </div>
          </div>

          <div className="flex px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-light tracking-[-0.02em] text-foreground">{liftExercises.length}</p>
              <p className="text-[11px] uppercase leading-snug tracking-[0.1em] text-muted-foreground">Exercises</p>
            </div>
            <div className="min-w-0 flex-1 border-l border-border pl-3.5">
              <p className="text-2xl font-light tracking-[-0.02em] text-foreground">{totalSets}</p>
              <p className="text-[11px] uppercase leading-snug tracking-[0.1em] text-muted-foreground">Sets</p>
            </div>
            {sessionDuration && (
              <div className="min-w-0 flex-1 border-l border-border pl-3.5" data-testid="stat-session-duration">
                <p className="flex items-center gap-1.5 whitespace-nowrap text-2xl font-light tracking-[-0.02em] text-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{sessionDuration.text}</span>
                </p>
                <p className="text-[11px] uppercase leading-snug tracking-[0.1em] text-muted-foreground">
                  {sessionDuration.label}
                </p>
              </div>
            )}
          </div>

          <button
            ref={tourStartWorkoutRef}
            onClick={handleStartWorkout}
            className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center justify-between gap-3 rounded-3xl bg-secondary py-4 pl-5 pr-4 text-left transition-colors hover:bg-accent"
            data-testid="button-start-workout-program"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium uppercase tracking-[0.06em] text-foreground">Start workout</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {day.label} · {day.focus}
              </span>
            </span>
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-black">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </button>
        </motion.div>
      )}

      {/* The week strip (ScheduleStrip) is parked for now - see its comment. */}

      {/* Day switcher + roster. Grouped so the first-run tour can spotlight both
          at once: its step says "your training days and exercises", and the
          roster is what the second half of that sentence refers to. */}
      <div ref={tourProgramBodyRef} className="space-y-6">
        <div>
          <h2 className="mb-3 text-[21px] font-light tracking-[-0.01em] text-foreground">Training days</h2>
          <div
            className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="program-day-tabs"
          >
            {days.map((d, i) => {
              const isActive = activeDay === i;
              return (
                <button
                  key={d.dayNumber}
                  onClick={() => setActiveDay(i)}
                  data-testid={`tab-day-${d.dayNumber}`}
                  aria-pressed={isActive}
                  className={`shrink-0 whitespace-nowrap rounded-full px-[18px] py-2.5 text-sm transition-colors ${
                    isActive ? "bg-white font-medium text-black" : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Exercise roster - one inset-grouped card, no numbering. */}
        {day && day.exercises.length > 0 && (
          <div>
            <h2 className="mb-3 text-[21px] font-light tracking-[-0.01em] text-foreground">Exercises</h2>
            <motion.div
              key={activeDay}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-[26px] bg-card"
            >
              {day.exercises.map((ex, i) => (
                <RosterRow key={`${ex.name}-${i}`} ex={ex} />
              ))}
            </motion.div>
          </div>
        )}
      </div>

      {showProgramTour && <CoachmarkTour steps={programTourSteps} onDone={finishProgramTour} testIdPrefix="program-tour" />}

      <WorkoutLogLockDialog
        open={lockDialogOpen}
        programId={program.id}
        onCancel={() => setLockDialogOpen(false)}
      />

      <DiscardSessionDialog
        open={!!conflict}
        inProgressLabel={conflictLabel}
        targetLabel={day?.label ?? "this day"}
        onDismiss={() => setConflict(null)}
        // Bare `/log`, not `?day=`: the log page re-resolves the active session
        // against the mode's current program and lands on the right day with
        // its resume banner - which stays correct even when the session belongs
        // to the other lineage's program.
        onKeep={() => {
          setConflict(null);
          setLocation("/log");
        }}
        onDiscard={() => {
          if (user?.id && day) {
            discardActiveSession(user.id);
            startSession(user.id, program.id, day.dayNumber);
          }
          setConflict(null);
          if (day) setLocation(`/log?day=${day.dayNumber}&start=1`);
        }}
      />
    </div>
  );
}
