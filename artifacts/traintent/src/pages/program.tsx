import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Dumbbell, Zap, Info, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useGetCurrentProgram, useGetProfile, useCreateManualProgram } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentProgramQueryKey } from "@workspace/api-client-react";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rpe: number | null;
  restSeconds: number | null;
  cue: string | null;
  muscle: string;
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
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                {ex.muscle}
              </span>
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
          {ex.rpe && (
            <div className="flex items-center gap-1.5 text-sm">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">RPE {ex.rpe}</span>
            </div>
          )}
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
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

type EditExercise = { name: string; sets: string; reps: string; muscle: string };
type EditDay = { label: string; exercises: EditExercise[] };

function ManualProgramBuilder({ onSaved }: { onSaved: () => void }) {
  const createManualProgram = useCreateManualProgram();
  const queryClient = useQueryClient();
  const [programName, setProgramName] = useState("");
  const [days, setDays] = useState<EditDay[]>([
    { label: "", exercises: [{ name: "", sets: "3", reps: "8-12", muscle: "" }] },
  ]);

  function addDay() {
    setDays((d) => [...d, { label: "", exercises: [{ name: "", sets: "3", reps: "8-12", muscle: "" }] }]);
  }

  function removeDay(di: number) {
    setDays((d) => d.filter((_, i) => i !== di));
  }

  function updateDay(di: number, field: keyof EditDay, value: string) {
    setDays((d) => d.map((day, i) => i === di ? { ...day, [field]: value } : day));
  }

  function addExercise(di: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: [...day.exercises, { name: "", sets: "3", reps: "8-12", muscle: "" }] } : day
    ));
  }

  function removeExercise(di: number, ei: number) {
    setDays((d) => d.map((day, i) =>
      i === di ? { ...day, exercises: day.exercises.filter((_, j) => j !== ei) } : day
    ));
  }

  function updateExercise(di: number, ei: number, field: keyof EditExercise, value: string) {
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
          sets: parseInt(e.sets) || 3,
          reps: e.reps,
          rpe: null,
          restSeconds: null,
          cue: null,
          muscle: e.muscle || "General",
        })),
    }));

    await createManualProgram.mutateAsync({
      data: {
        programName: programName || "My Program",
        splitType: "Custom",
        days: programDays as any,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
    onSaved();
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
        <div key={di} className="p-5 rounded-xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-3">
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

          <div className="space-y-2">
            {day.exercises.map((ex, ei) => (
              <div key={ei} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={ex.name}
                  onChange={(e) => updateExercise(di, ei, "name", e.target.value)}
                  placeholder="Exercise name"
                  className="col-span-4 px-3 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                />
                <input
                  type="text"
                  value={ex.muscle}
                  onChange={(e) => updateExercise(di, ei, "muscle", e.target.value)}
                  placeholder="Muscle"
                  className="col-span-3 px-3 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                />
                <input
                  type="text"
                  value={ex.sets}
                  onChange={(e) => updateExercise(di, ei, "sets", e.target.value)}
                  placeholder="Sets"
                  className="col-span-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={ex.reps}
                  onChange={(e) => updateExercise(di, ei, "reps", e.target.value)}
                  placeholder="Reps"
                  className="col-span-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeExercise(di, ei)}
                  className="col-span-1 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-0.5 -mt-1">
            <span className="col-span-4">Exercise</span>
            <span className="col-span-3">Muscle</span>
            <span className="col-span-2 text-center">Sets</span>
            <span className="col-span-2 text-center">Reps</span>
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

      <button
        onClick={handleSave}
        disabled={createManualProgram.isPending}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {createManualProgram.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
        ) : (
          <><Save className="w-4 h-4" /> Save program</>
        )}
      </button>
    </div>
  );
}

export default function Program() {
  const { data: program, isLoading } = useGetCurrentProgram();
  const profileQuery = useGetProfile();
  const [activeDay, setActiveDay] = useState(0);
  const [building, setBuilding] = useState(false);

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
                <ManualProgramBuilder onSaved={() => setBuilding(false)} />
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

  const days = program.days as ProgramDay[];
  const day = days[activeDay];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">{program.programName}</h1>
        <p className="text-muted-foreground mt-1">
          {program.splitType} · Week {program.weekNumber}
          {!program.aiGenerated && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">Custom</span>}
        </p>
        {program.aiNotes && (
          <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm text-muted-foreground">
            {program.aiNotes}
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
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeDay === i
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
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
            <Link href="/log">
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
