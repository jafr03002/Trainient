import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { Dumbbell, Plus, Trash2, Save, Loader2, Pencil, ArrowUp, ArrowDown, GripVertical, Sparkles, Info } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  useGetProfile,
  useCreateManualProgram,
  useUpdateProfile,
  customFetch,
  getGetCurrentProgramQueryKey,
  getGetProfileQueryKey,
  type Program,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MUSCLE_OPTIONS, MUSCLE_COLORS } from "@/lib/muscles";
import { formatSplitType } from "@/lib/utils";
import { isPreCalibrationLocked } from "@/lib/calibration";
import { WorkoutLogLockDialog } from "@/components/workout/WorkoutLogLockDialog";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
import { useNavTourTarget, useNavTourClick } from "@/components/layout";

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
};

export type ProgramDay = {
  dayNumber: number;
  label: string;
  focus: string;
  exercises: Exercise[];
};

// Soft translucent background to pair with a muscle's solid accent color -
// falls back to the app's default primary-blue badge for anything unrecognized
// (blank/legacy muscle values).
function muscleAccent(muscle: string): { solid: string; soft: string; glow: string } | null {
  const solid = MUSCLE_COLORS[muscle];
  if (!solid) return null;
  return {
    solid,
    soft: `hsla(${solid.slice(4, -1)}, 0.14)`,
    glow: `hsla(${solid.slice(4, -1)}, 0.55)`,
  };
}

// Hero-card tint per training day: each muscle maps onto one of the Voltage
// chart tokens so a Pull day washes violet, Legs green, Push stays electric
// blue. Token *references* (not raw colors) so the wash always tracks the
// theme palette.
const MUSCLE_HERO_TOKEN: Record<string, string> = {
  Chest: "var(--primary)",
  Shoulders: "var(--chart-3)",
  Biceps: "var(--chart-5)",
  Triceps: "var(--chart-5)",
  "Upper Back": "var(--chart-4)",
  Lats: "var(--chart-4)",
  Quads: "var(--chart-2)",
  Hamstrings: "var(--chart-2)",
  Glutes: "var(--chart-2)",
  Calves: "var(--chart-2)",
  Core: "var(--chart-2)",
};

// The day's dominant color = the token most of its primary muscles map to;
// ties break toward the earliest exercise so the tint feels stable.
function dayHeroToken(day: ProgramDay): string {
  const counts = new Map<string, number>();
  for (const ex of day.exercises) {
    const token = MUSCLE_HERO_TOKEN[ex.muscle];
    if (token) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  let best = "var(--primary)";
  let bestCount = 0;
  for (const ex of day.exercises) {
    const token = MUSCLE_HERO_TOKEN[ex.muscle];
    if (!token) continue;
    const count = counts.get(token) ?? 0;
    if (count > bestCount) {
      best = token;
      bestCount = count;
    }
  }
  return best;
}

function RosterRow({ ex, index }: { ex: Exercise; index: number }) {
  const accent = muscleAccent(ex.muscle);
  const barColor = accent?.solid ?? "hsl(var(--primary))";
  const barGlow = accent?.glow ?? "hsl(var(--primary) / 0.55)";

  return (
    <div className="flex items-center gap-3 py-3 pl-2.5 pr-4 min-w-0">
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: barColor, boxShadow: `0 0 8px ${barGlow}` }}
      />
      <span className="font-display text-xs text-muted-foreground w-4 text-center shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-foreground truncate">{ex.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          <span className="font-medium" style={accent ? { color: accent.solid } : undefined}>
            {ex.muscle || "—"}
          </span>
          {ex.secondaryMuscle && <> · {ex.secondaryMuscle}</>}
          {ex.isUnilateral && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              Unilateral
            </span>
          )}
        </p>
      </div>
      <span className="font-display font-semibold text-[15px] text-foreground whitespace-nowrap">
        {ex.sets} × {ex.reps}
      </span>
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

export function ManualProgramBuilder({ onSaved, onCancel, editProgram }: BuilderProps) {
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

// The two program lineages are completely separate: the AI Coach page only
// ever reads/writes AI-generated programs, the My Program page only manual
// ones. This switcher makes both reachable from either page regardless of
// which training mode is active - the inactive lineage is view-only, never
// hidden, never overwritten, never deleted.
export function LineageSwitcher({ active }: { active: "ai" | "my" }) {
  const { data: profile } = useGetProfile();
  const activeMode: "ai" | "my" = profile?.mode === "independent" ? "my" : "ai";

  const tabs = [
    { key: "ai" as const, href: "/program/ai", label: "AI Coach", Icon: Sparkles },
    { key: "my" as const, href: "/program/my", label: "My own", Icon: Pencil },
  ];

  return (
    <div className="flex gap-2" data-testid="program-lineage-switcher">
      {tabs.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href}>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active === key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
            data-testid={`lineage-tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {activeMode === key && (
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                  active === key ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"
                }`}
              >
                Active
              </span>
            )}
          </button>
        </Link>
      ))}
    </div>
  );
}

// Shown on a program page whose lineage is NOT the active training mode -
// explains why workout logging isn't offered there.
export function InactiveLineageNotice({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-3" data-testid="inactive-lineage-notice">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-sm text-muted-foreground leading-relaxed">
        {children}{" "}
        <Link href="/settings" className="text-primary hover:underline">Switch mode in Settings</Link>
      </p>
    </div>
  );
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
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const [activeDay, setActiveDay] = useState(0);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const tourDayTabsRef = useRef<HTMLDivElement>(null);
  const tourStartWorkoutRef = useRef<HTMLButtonElement>(null);
  const logNavTarget = useNavTourTarget("/log");

  function finishProgramTour() {
    updateProfile.mutate(
      { data: { programPageTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
  }

  const showProgramTour =
    tourEnabled &&
    !!profileQuery.data && !profileQuery.data.programPageTourSeenAt &&
    !isPreCalibrationLocked(program, new Date());
  useNavTourClick("/log", showProgramTour ? finishProgramTour : null);

  const days = program.days as ProgramDay[];
  const day = days[activeDay];
  const locked = isPreCalibrationLocked(program, new Date());
  const programTourSteps: CoachmarkStep[] = [
    { kind: "center", text: "Here is your program page where you will find your programs." },
    { target: tourDayTabsRef, text: "Here is your program." },
    { target: tourStartWorkoutRef, text: "You can click here and you can start logging." },
    { kind: "navClick", target: logNavTarget, text: "Now let's log a workout — tap here." },
  ];

  const totalSets = day ? day.exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0) : 0;
  const heroToken = day ? dayHeroToken(day) : "var(--primary)";

  const startWorkoutButton = locked ? (
    <button
      onClick={() => setLockDialogOpen(true)}
      className="w-full mt-4 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors glow-primary"
      data-testid="button-start-workout-program"
    >
      Start workout
    </button>
  ) : (
    <Link href={`/log?day=${day?.dayNumber}`} className="block">
      <button
        ref={tourStartWorkoutRef}
        className="w-full mt-4 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors glow-primary"
        data-testid="button-start-workout-program"
      >
        Start workout
      </button>
    </Link>
  );

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{program.programName}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {formatSplitType(program.splitType)} · Week {program.weekNumber}
              {badge}
            </p>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
              data-testid="button-edit-program"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      </motion.div>

      {/* Day hero - gradient wash + border tinted by the day's dominant muscle color */}
      {day && (
        <motion.div
          key={`hero-${activeDay}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ "--hero": heroToken } as CSSProperties}
          className="relative overflow-hidden rounded-2xl border border-[hsl(var(--hero)/0.3)] bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--hero)/0.20),transparent_55%),linear-gradient(135deg,hsl(var(--hero)/0.07),transparent_45%)] bg-card p-5"
          data-testid="program-day-hero"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--hero))]">
            Day {day.dayNumber}
          </p>
          <h2 className="font-display text-2xl font-bold text-foreground mt-1">{day.focus}</h2>
          <div className="flex mt-4 pt-3 border-t border-border">
            <div className="flex-1 min-w-0">
              <p className="font-display text-xl font-bold text-foreground">{day.exercises.length}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">Exercises</p>
            </div>
            <div className="flex-1 min-w-0 border-l border-border pl-4">
              <p className="font-display text-xl font-bold text-foreground">{totalSets}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">Sets</p>
            </div>
          </div>
          {startWorkoutButton}
        </motion.div>
      )}

      {/* Day switcher */}
      <div
        ref={tourDayTabsRef}
        className="flex gap-1.5 rounded-xl border border-border bg-secondary/60 p-1 overflow-x-auto"
        data-testid="program-day-tabs"
      >
        {days.map((d, i) => (
          <button
            key={d.dayNumber}
            onClick={() => setActiveDay(i)}
            data-testid={`tab-day-${d.dayNumber}`}
            className={`flex-1 min-w-0 truncate rounded-lg px-2 py-1.5 text-sm transition-colors ${
              activeDay === i
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground font-medium"
            }`}
          >
            <span className={`text-xs mr-1 ${activeDay === i ? "opacity-80" : "opacity-60"}`}>{i + 1} ·</span>
            {d.label}
          </button>
        ))}
      </div>

      {/* Exercise roster */}
      {day && (
        <motion.div
          key={activeDay}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border border-border bg-card divide-y divide-border/60 overflow-hidden"
        >
          {day.exercises.map((ex, i) => (
            <RosterRow key={ex.name} ex={ex} index={i} />
          ))}
        </motion.div>
      )}

      {showProgramTour && <CoachmarkTour steps={programTourSteps} onDone={finishProgramTour} testIdPrefix="program-tour" />}

      <WorkoutLogLockDialog
        open={lockDialogOpen}
        programId={program.id}
        onCancel={() => setLockDialogOpen(false)}
      />
    </div>
  );
}
