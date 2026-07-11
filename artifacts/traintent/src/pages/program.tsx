import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Plus, Trash2, Save, Loader2, Pencil, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useGetProfile, useCreateManualProgram, useGenerateProgram, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentProgramQueryKey } from "@workspace/api-client-react";
import { MUSCLE_OPTIONS, MUSCLE_COLORS } from "@/lib/muscles";
import { formatSplitType } from "@/lib/utils";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rpe: number | null;
  restSeconds: number | null;
  cue: string | null;
  muscle: string;
  secondaryMuscle?: string | null;
  isUnilateral?: boolean;
};

type ProgramDay = {
  dayNumber: number;
  label: string;
  focus: string;
  exercises: Exercise[];
};

// Soft translucent background to pair with a muscle's solid accent color -
// falls back to the app's default primary-blue badge for anything unrecognized
// (blank/legacy muscle values).
function muscleAccent(muscle: string): { solid: string; soft: string } | null {
  const solid = MUSCLE_COLORS[muscle];
  if (!solid) return null;
  return { solid, soft: `hsla(${solid.slice(4, -1)}, 0.14)` };
}

function ExerciseCard({ ex }: { ex: Exercise }) {
  const primaryAccent = muscleAccent(ex.muscle);
  const secondaryAccent = ex.secondaryMuscle ? muscleAccent(ex.secondaryMuscle) : null;

  return (
    <motion.div
      layout
      className="bg-secondary/20 border border-border rounded-xl overflow-hidden"
    >
      <div className="p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              style={primaryAccent ? { backgroundColor: primaryAccent.soft, color: primaryAccent.solid, borderColor: primaryAccent.soft } : undefined}
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                primaryAccent ? "" : "bg-primary/10 text-primary border-primary/20"
              }`}
            >
              {ex.muscle}
            </span>
            {ex.secondaryMuscle && (
              <span
                style={secondaryAccent ? { backgroundColor: secondaryAccent.soft, color: secondaryAccent.solid, borderColor: secondaryAccent.soft } : undefined}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  secondaryAccent ? "" : "bg-secondary/40 text-muted-foreground border-border"
                }`}
              >
                {ex.secondaryMuscle}
              </span>
            )}
            {ex.isUnilateral && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Unilateral
              </span>
            )}
          </div>
          <h3 className="font-semibold text-foreground">{ex.name}</h3>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Dumbbell className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{ex.sets} × {ex.reps}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type EditExercise = {
  name: string;
  sets: string;
  reps: string;
  muscle: string;
  secondaryMuscle: string;
  isUnilateral: boolean;
};
type EditDay = { label: string; exercises: EditExercise[] };

function newExercise(): EditExercise {
  // Section 1: default sets to 2 in the build-your-own flow.
  return { name: "", sets: "2", reps: "8-12", muscle: "", secondaryMuscle: "", isUnilateral: false };
}

function programToEditDays(program: { days: unknown }): EditDay[] {
  const days = (program.days as ProgramDay[]) ?? [];
  return days.map((d) => ({
    label: d.label ?? "",
    exercises: (d.exercises ?? []).map((e) => ({
      name: e.name ?? "",
      sets: String(e.sets ?? 2),
      reps: e.reps ?? "",
      muscle: e.muscle ?? "",
      secondaryMuscle: e.secondaryMuscle ?? "",
      isUnilateral: !!e.isUnilateral,
    })),
  }));
}

// Shared between the Save-button gate and the draft-restore path, so a crash
// or reload mid-edit reproduces exactly the same "first missing field" flag
// the user would have seen by clicking Save right before it happened.
function findMissingName(days: EditDay[]): { day: number; exercise?: number } | null {
  for (let di = 0; di < days.length; di++) {
    if (!days[di].label.trim()) return { day: di };
    const missingExercise = days[di].exercises.findIndex((e) => !e.name.trim());
    if (missingExercise !== -1) return { day: di, exercise: missingExercise };
  }
  return null;
}

// Rotating per-day accent so days are easy to tell apart at a glance - cycles
// if there are more days than colors. Exercises stay neutral/zebra-striped;
// only days get real color, per the "bland gray blends together" complaint.
const DAY_ACCENT_HUES: { h: number; s: number; l: number }[] = [
  { h: 217, s: 91, l: 60 }, // blue
  { h: 280, s: 68, l: 60 }, // purple
  { h: 38, s: 92, l: 50 },  // gold
  { h: 160, s: 84, l: 39 }, // teal
  { h: 350, s: 75, l: 55 }, // pink-red
  { h: 24, s: 90, l: 55 },  // orange
  { h: 199, s: 89, l: 48 }, // cyan
  { h: 142, s: 71, l: 45 }, // green
];

function dayAccent(index: number) {
  const { h, s, l } = DAY_ACCENT_HUES[index % DAY_ACCENT_HUES.length];
  return {
    solid: `hsl(${h}, ${s}%, ${l}%)`,
    soft: `hsla(${h}, ${s}%, ${l}%, 0.14)`,
    text: `hsl(${h}, ${Math.min(s, 80)}%, ${Math.max(l, 70)}%)`,
  };
}

type ProgramDraft = { programName: string; days: EditDay[]; savedAt: number };

const PROGRAM_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // discard drafts older than a day

// "new" covers the not-yet-created program in Independent mode - there's only
// ever one program per user, so a single draft slot for it is enough.
function programDraftKey(userId: string, programId: number | "new"): string {
  return `traintent:program-draft:${userId}:${programId}`;
}

function loadProgramDraft(key: string): ProgramDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgramDraft;
    if (!parsed || !Array.isArray(parsed.days)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > PROGRAM_DRAFT_MAX_AGE_MS) return null;
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

type BuilderProps = {
  onSaved: () => void;
  onCancel?: () => void;
  // When provided, the builder edits this existing program instead of creating a new one.
  editProgram?: { id: number; programName: string; splitType: string; days: unknown } | null;
};

function ManualProgramBuilder({ onSaved, onCancel, editProgram }: BuilderProps) {
  const createManualProgram = useCreateManualProgram();
  const queryClient = useQueryClient();
  const { user } = useUser();
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
  // exercise undefined => the day's own name is missing; otherwise it's that
  // exercise's name within the day. Seeded from the restored draft (if any) so
  // a crash/reload mid-edit shows the same flags a Save click would have.
  const [nameError, setNameError] = useState<{ day: number; exercise?: number } | null>(
    () => (initialDraft ? findMissingName(initialDraft.days) : null),
  );
  const [showMuscleConfirm, setShowMuscleConfirm] = useState(false);

  // Mirror every change to localStorage so a reload never loses in-progress
  // program edits - only cleared once the program actually saves.
  useEffect(() => {
    if (!draftKey) return;
    saveProgramDraft(draftKey, programName, days);
  }, [draftKey, programName, days]);

  function moveDay(from: number, to: number) {
    if (from === to) return;
    setDays((d) => {
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
    if (field === "label" && nameError?.day === di && nameError.exercise === undefined && value.trim()) {
      setNameError(null);
    }
  }

  function addExercise(di: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: [...day.exercises, newExercise()] } : day
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

  function updateExercise(di: number, ei: number, field: keyof EditExercise, value: string | boolean) {
    setDays((d) => d.map((day, i) =>
      i === di
        ? { ...day, exercises: day.exercises.map((ex, j) => j === ei ? { ...ex, [field]: value } : ex) }
        : day
    ));
    if (
      field === "name" && nameError?.day === di && nameError.exercise === ei &&
      typeof value === "string" && value.trim()
    ) {
      setNameError(null);
    }
  }

  async function performSave() {
    const programDays: ProgramDay[] = days.map((d, i) => ({
      dayNumber: i + 1,
      label: d.label.trim(),
      focus: d.label.trim(),
      exercises: d.exercises.map((e) => ({
        name: e.name.trim(),
        sets: parseInt(e.sets) || 2,
        reps: e.reps,
        rpe: null,
        restSeconds: null,
        cue: null,
        muscle: e.muscle,
        secondaryMuscle: e.secondaryMuscle || null,
        isUnilateral: e.isUnilateral,
      })),
    }));

    const body = {
      programName: programName || "My Program",
      splitType: editProgram?.splitType || "Custom",
      days: programDays,
    };

    setSaving(true);
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
    } finally {
      setSaving(false);
      setShowMuscleConfirm(false);
    }
  }

  // Gate before performSave: block on the first missing name - a day's own
  // name or an exercise's name within it - one at a time (fixing it and
  // saving again surfaces the next one, rather than dumping every error on
  // screen at once). Once every name is filled, a dismissible reminder covers
  // exercises with no muscle group set (allowed to proceed, unlike a name).
  function handleSave() {
    const missing = findMissingName(days);
    if (missing) {
      setNameError(missing);
      return;
    }
    setNameError(null);

    const hasUnsetMuscle = days.some((d) => d.exercises.some((e) => e.name.trim() && !e.muscle));
    if (hasUnsetMuscle) {
      setShowMuscleConfirm(true);
      return;
    }

    performSave();
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
        const accent = dayAccent(di);
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
            <input
              type="text"
              value={day.label}
              onChange={(e) => updateDay(di, "label", e.target.value)}
              placeholder={`Day ${di + 1} name (e.g. Push, Upper A)`}
              className={`flex-1 px-3 py-2 rounded-lg border bg-secondary/20 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary ${
                nameError?.day === di && nameError.exercise === undefined ? "border-destructive" : "border-border"
              }`}
              data-testid={`day-name-input-${di}`}
            />
            {days.length > 1 && (
              <button
                onClick={() => removeDay(di)}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {day.exercises.map((ex, ei) => (
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
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => updateExercise(di, ei, "name", e.target.value)}
                    placeholder="Exercise name"
                    className={`flex-1 px-3 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground ${
                      nameError?.day === di && nameError.exercise === ei ? "border-destructive" : "border-border"
                    }`}
                    data-testid={`exercise-name-input-${di}-${ei}`}
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
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
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

          <button
            onClick={() => addExercise(di)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add exercise
          </button>
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

      {nameError && (
        <p className="text-sm text-destructive" data-testid="name-error">
          Missing fields above - fill them in before saving.
        </p>
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
              onClick={onCancel}
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
    </div>
  );
}

export default function Program() {
  const { data: program, isLoading } = useGetCurrentProgram();
  const profileQuery = useGetProfile();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const generateProgram = useGenerateProgram();
  const [activeDay, setActiveDay] = useState(0);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const isIndependent = profileQuery.data?.mode === "independent";
  // AI onboarding is the only place goal/experience get set - Independent
  // mode's shorter flow skips them, so a mode switch can land here with a
  // profile that exists but isn't ready for the AI to generate from yet.
  const aiProfileReady = !!profileQuery.data?.goal && !!profileQuery.data?.experience;

  // Drop the user back into the builder, mid-edit, if a reload or crash
  // interrupted them before they saved - a draft existing is exactly that
  // signal. Only checked once: after this, Cancel (which intentionally
  // leaves the draft in place) must not immediately snap back into it.
  // Editing only exists in Independent mode, so AI mode never resumes into it.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current || isLoading || profileQuery.isLoading || !user?.id || !isIndependent) return;
    autoResumedRef.current = true;

    if (program) {
      if (loadProgramDraft(programDraftKey(user.id, program.id))) setEditing(true);
    } else {
      if (loadProgramDraft(programDraftKey(user.id, "new"))) setBuilding(true);
    }
  }, [isLoading, profileQuery.isLoading, user?.id, program, isIndependent]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateProgram.mutateAsync({});
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
    } finally {
      setGenerating(false);
    }
  }

  if (isLoading || profileQuery.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading your program...</div>
      </div>
    );
  }

  if (!program) {
    if (isIndependent) {
      return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-foreground">My Program</h1>
            <p className="text-muted-foreground mt-1">Build your own training program.</p>
          </motion.div>

          <AnimatePresence>
            {!building ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
              >
                <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-bold text-foreground mb-2">No program yet</h2>
                <p className="text-muted-foreground mb-8">Create your first training program with your own days and exercises.</p>
                <button
                  onClick={() => setBuilding(true)}
                  className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Create your program
                </button>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <ManualProgramBuilder onSaved={() => setBuilding(false)} onCancel={() => setBuilding(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    if (!aiProfileReady) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="text-center py-16">
            <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">A few things to set before AI can build your program</h2>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              We don't have your goal, experience, or equipment yet - the AI coach needs those to write a program.
            </p>
            <Link href="/onboarding">
              <button className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                Set up AI coaching
              </button>
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-16">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No program yet</h2>
          <p className="text-muted-foreground mb-8">Your AI coach has what it needs - generate your first program to get started.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              "Generate my program"
            )}
          </button>
          {generateProgram.isError && !generating && (
            <p className="text-sm text-destructive mt-4">Something went wrong generating your program. Try again.</p>
          )}
        </div>
      </div>
    );
  }

  // Edit mode - reuse the builder, prefilled with this program. Past logged
  // sessions are snapshots, so editing the program never changes them.
  // Independent-only: AI mode has no path to set `editing` true, but this
  // guard keeps it that way even if that ever changes.
  if (editing && isIndependent) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Edit program</h1>
          <p className="text-muted-foreground mt-1">Change days, exercises, sets and muscles. Past sessions stay as they were.</p>
        </motion.div>
        <ManualProgramBuilder
          editProgram={{ id: program.id, programName: program.programName, splitType: program.splitType, days: program.days }}
          onSaved={() => { setEditing(false); setActiveDay(0); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const days = program.days as ProgramDay[];
  const day = days[activeDay];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{program.programName}</h1>
            <p className="text-muted-foreground mt-1">
              {formatSplitType(program.splitType)} · Week {program.weekNumber}
              {!program.aiGenerated && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">Custom</span>}
            </p>
          </div>
          {isIndependent && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
              data-testid="button-edit-program"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
        {program.aiGenerated && !(program.shortTermPhase || program.energyBalance || program.dailyStepTarget || program.trainingWorkload) && (
          <div className="mt-3 p-4 rounded-xl bg-card border border-border" data-testid="program-monitoring-unavailable">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Program monitoring</h2>
            <p className="text-sm text-muted-foreground">
              Monitoring data isn't available for this program - regenerate to get phase, energy balance, and step/cardio targets.
            </p>
          </div>
        )}
        {program.aiGenerated && (program.shortTermPhase || program.energyBalance || program.dailyStepTarget || program.trainingWorkload) && (
          <div className="mt-3 p-4 rounded-xl bg-card border border-border space-y-3" data-testid="program-monitoring">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Program monitoring</h2>
            <div className="flex flex-wrap gap-2">
              {program.shortTermPhase && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border font-medium capitalize">
                  {program.shortTermPhase.replace(/_/g, " ")}
                </span>
              )}
              {program.energyBalance && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border font-medium capitalize">
                  {program.energyBalance.replace(/_/g, " ")} energy balance
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {program.trainingWorkload && (
                <div>
                  <div className="text-xs text-muted-foreground">Training workload</div>
                  <div className="font-medium text-foreground">
                    {program.trainingWorkload.daysTrained} days · {program.trainingWorkload.totalVolumeSets} sets
                  </div>
                </div>
              )}
              {program.dailyStepTarget && (
                <div>
                  <div className="text-xs text-muted-foreground">Daily steps</div>
                  <div className="font-medium text-foreground capitalize">{program.dailyStepTarget}</div>
                </div>
              )}
              {(program.shortTermGoalWeight != null || program.longTermGoalWeight != null) && (
                <div>
                  <div className="text-xs text-muted-foreground">Goal weight</div>
                  <div className="font-medium text-foreground">
                    {program.shortTermGoalWeight ?? "-"} → {program.longTermGoalWeight ?? "-"} {profileQuery.data?.weightUnit ?? "kg"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="program-day-tabs">
        {days.map((d, i) => (
          <button
            key={d.dayNumber}
            onClick={() => setActiveDay(i)}
            data-testid={`tab-day-${d.dayNumber}`}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeDay === i
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            <span className={`text-xs ${activeDay === i ? "opacity-80" : "opacity-60"}`}>{i + 1}</span>
            {d.label}
          </button>
        ))}
      </div>

      {day && (
        <motion.div
          key={activeDay}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-foreground">{day.focus}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{day.exercises.length} exercises</p>
            </div>
            <Link href={`/log?day=${day.dayNumber}`}>
              <button
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-start-workout-program"
              >
                Start workout
              </button>
            </Link>
          </div>

          {day.exercises.map((ex) => (
            <ExerciseCard key={ex.name} ex={ex} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
