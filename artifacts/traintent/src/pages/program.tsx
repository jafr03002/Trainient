import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Dumbbell, Info, Plus, Trash2, Save, Loader2, Pencil, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { useGetCurrentProgram, useGetProfile, useCreateManualProgram, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentProgramQueryKey } from "@workspace/api-client-react";
import { MUSCLE_OPTIONS } from "@/lib/muscles";

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

function ExerciseCard({ ex }: { ex: Exercise }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className="bg-secondary/20 border border-border rounded-xl overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                {ex.muscle}
              </span>
              {ex.secondaryMuscle && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground border border-border">
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
          {ex.cue && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Info className="w-4 h-4" />
              {expanded ? <ChevronUp className="w-3 h-3 mt-0.5" /> : <ChevronDown className="w-3 h-3 mt-0.5" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Dumbbell className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{ex.sets} × {ex.reps}</span>
          </div>
        </div>

        {ex.cue && <p className="text-sm text-muted-foreground mt-3 italic">"{ex.cue}"</p>}
      </div>

      {expanded && ex.cue && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pb-4 border-t border-border/50 pt-3"
        >
          <div className="text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Primary muscle:</span> {ex.muscle}</p>
            {ex.secondaryMuscle && (
              <p className="mt-1"><span className="font-medium text-foreground">Secondary muscle:</span> {ex.secondaryMuscle}</p>
            )}
          </div>
        </motion.div>
      )}
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

type BuilderProps = {
  onSaved: () => void;
  onCancel?: () => void;
  // When provided, the builder edits this existing program instead of creating a new one.
  editProgram?: { id: number; programName: string; splitType: string; days: unknown } | null;
};

function ManualProgramBuilder({ onSaved, onCancel, editProgram }: BuilderProps) {
  const createManualProgram = useCreateManualProgram();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [programName, setProgramName] = useState(editProgram?.programName ?? "");
  const [days, setDays] = useState<EditDay[]>(
    editProgram ? programToEditDays(editProgram) : [{ label: "", exercises: [newExercise()] }],
  );
  const [dragDay, setDragDay] = useState<number | null>(null);

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
  }

  async function handleSave() {
    const programDays: ProgramDay[] = days.map((d, i) => ({
      dayNumber: i + 1,
      label: d.label || `Day ${i + 1}`,
      focus: d.label || `Day ${i + 1}`,
      exercises: d.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({
          name: e.name,
          sets: parseInt(e.sets) || 2,
          reps: e.reps,
          rpe: null,
          restSeconds: null,
          cue: null,
          muscle: e.muscle || MUSCLE_OPTIONS[0],
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
      onSaved();
    } finally {
      setSaving(false);
    }
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

      {days.map((day, di) => (
        <div
          key={di}
          onDragOver={(e) => { if (dragDay !== null) e.preventDefault(); }}
          onDrop={() => { if (dragDay !== null) moveDay(dragDay, di); setDragDay(null); }}
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
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                Day {di + 1}
              </span>
            </div>
            <input
              type="text"
              value={day.label}
              onChange={(e) => updateDay(di, "label", e.target.value)}
              placeholder={`Day ${di + 1} name (e.g. Push, Upper A)`}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary/20 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
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
              <div key={ei} className="rounded-lg border border-border/60 bg-secondary/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => updateExercise(di, ei, "name", e.target.value)}
                    placeholder="Exercise name"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground"
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
      ))}

      <button
        onClick={addDay}
        className="w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add training day
      </button>

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
    </div>
  );
}

export default function Program() {
  const { data: program, isLoading } = useGetCurrentProgram();
  const profileQuery = useGetProfile();
  const [activeDay, setActiveDay] = useState(0);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState(false);

  const isIndependent = profileQuery.data?.mode === "independent";

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

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-16">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No program yet</h2>
          <p className="text-muted-foreground mb-6">Complete onboarding to generate your AI program.</p>
          <Link href="/onboarding">
            <button className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
              Start onboarding
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Edit mode — reuse the builder, prefilled with this program. Past logged
  // sessions are snapshots, so editing the program never changes them.
  if (editing) {
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
              {program.splitType} · Week {program.weekNumber}
              {!program.aiGenerated && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">Custom</span>}
            </p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            data-testid="button-edit-program"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
        {program.programHighlights.length > 0 && (
          <div className="mt-3 space-y-2">
            {program.programHighlights.map((h, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm"
              >
                <span className="font-semibold text-foreground">{h.title}</span>
                <span className="text-muted-foreground"> — {h.detail}</span>
              </div>
            ))}
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
