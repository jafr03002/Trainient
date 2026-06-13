import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, X, Loader2, Timer } from "lucide-react";
import { useGetCurrentProgram, useCreateWorkout } from "@workspace/api-client-react";

type LoggedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number | null;
  completed: boolean;
};

type LoggedExercise = {
  name: string;
  muscle: string;
  sets: LoggedSet[];
  targetSets: number;
  targetReps: string;
  targetRpe: number;
  restSeconds: number;
};

function RestTimer({ seconds, onDismiss }: { seconds: number; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const iv = setInterval(() => setRemaining((r) => {
      if (r <= 1) { clearInterval(iv); onDismiss(); return 0; }
      return r - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [onDismiss]);

  const pct = (remaining / seconds) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-2xl p-5 shadow-xl w-52"
      data-testid="rest-timer"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Timer className="w-4 h-4 text-primary" />
          Rest timer
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="text-3xl font-bold text-primary text-center mb-3">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <motion.div className="h-full bg-primary" animate={{ width: `${pct}%` }} />
      </div>
    </motion.div>
  );
}

export default function Log() {
  const [, setLocation] = useLocation();
  const { data: program } = useGetCurrentProgram();
  const createWorkout = useCreateWorkout();
  const [logs, setLogs] = useState<LoggedExercise[]>([]);
  const [showTimer, setShowTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const startTime = useRef(Date.now());

  useEffect(() => {
    if (program?.days) {
      const day = (program.days as any[])[0];
      if (!day) return;
      setLogs(
        day.exercises.map((ex: any) => ({
          name: ex.name,
          muscle: ex.muscle,
          targetSets: ex.sets,
          targetReps: ex.reps,
          targetRpe: ex.rpe,
          restSeconds: ex.restSeconds,
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            setNumber: i + 1,
            weight: 0,
            reps: 0,
            rpe: null,
            completed: false,
          })),
        }))
      );
    }
  }, [program]);

  function updateSet(exIdx: number, setIdx: number, field: keyof LoggedSet, value: number | boolean) {
    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s),
      };
      return next;
    });
  }

  function completeSet(exIdx: number, setIdx: number) {
    updateSet(exIdx, setIdx, "completed", true);
    const ex = logs[exIdx];
    setTimerSeconds(ex.restSeconds);
    setShowTimer(true);
  }

  function addSet(exIdx: number) {
    setLogs((prev) => {
      const next = [...prev];
      const ex = next[exIdx];
      next[exIdx] = {
        ...ex,
        sets: [...ex.sets, { setNumber: ex.sets.length + 1, weight: 0, reps: 0, rpe: null, completed: false }],
      };
      return next;
    });
  }

  async function finishWorkout() {
    const duration = Math.round((Date.now() - startTime.current) / 60000);
    await createWorkout.mutateAsync({
      data: {
        date: new Date().toISOString().split("T")[0],
        dayNumber: (program?.days as any[])?.[0]?.dayNumber ?? 1,
        weekNumber: program?.weekNumber ?? 1,
        exercisesLogged: logs.map((ex) => ({
          name: ex.name,
          muscle: ex.muscle,
          sets: ex.sets,
        })),
        durationMinutes: duration,
        notes: null,
      },
    });
    setLocation("/dashboard");
  }

  if (!program) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading workout...</div>
      </div>
    );
  }

  const day = (program.days as any[])[0];

  return (
    <div className="p-6 max-w-3xl mx-auto pb-32">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">{day?.label ?? "Workout"}</h1>
        <p className="text-muted-foreground mt-1">{day?.focus}</p>
      </motion.div>

      <div className="mt-6 space-y-6">
        {logs.map((ex, exIdx) => (
          <motion.div
            key={ex.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: exIdx * 0.06 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
            data-testid={`log-exercise-${exIdx}`}
          >
            <div className="p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                  {ex.muscle}
                </span>
              </div>
              <h3 className="font-semibold text-foreground mt-1">{ex.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target: {ex.targetSets} × {ex.targetReps} @ RPE {ex.targetRpe} · {ex.restSeconds}s rest
              </p>
            </div>

            <div className="p-4">
              {/* Table header */}
              <div className="grid grid-cols-5 gap-2 mb-2 text-xs text-muted-foreground font-medium">
                <span>Set</span>
                <span>Target</span>
                <span>Weight</span>
                <span>Reps</span>
                <span>RPE</span>
              </div>

              <div className="space-y-2">
                {ex.sets.map((set, setIdx) => (
                  <div
                    key={set.setNumber}
                    className={`grid grid-cols-5 gap-2 items-center py-1 transition-colors ${
                      set.completed ? "opacity-60" : ""
                    }`}
                    data-testid={`set-row-${exIdx}-${setIdx}`}
                  >
                    <span className="text-sm text-muted-foreground font-medium">{set.setNumber}</span>
                    <span className="text-xs text-muted-foreground">{ex.targetReps}</span>
                    <input
                      type="number"
                      value={set.weight || ""}
                      onChange={(e) => updateSet(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary disabled:opacity-50"
                      data-testid={`input-weight-${exIdx}-${setIdx}`}
                    />
                    <input
                      type="number"
                      value={set.reps || ""}
                      onChange={(e) => updateSet(exIdx, setIdx, "reps", parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary disabled:opacity-50"
                      data-testid={`input-reps-${exIdx}-${setIdx}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={set.rpe ?? ""}
                        onChange={(e) => updateSet(exIdx, setIdx, "rpe", parseInt(e.target.value) || 0)}
                        placeholder="—"
                        disabled={set.completed}
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary disabled:opacity-50"
                        data-testid={`input-rpe-${exIdx}-${setIdx}`}
                      />
                      <button
                        onClick={() => set.completed ? undefined : completeSet(exIdx, setIdx)}
                        disabled={set.completed}
                        className={`p-1.5 rounded-lg transition-colors ${
                          set.completed
                            ? "bg-chart-2/20 text-chart-2"
                            : "bg-secondary/30 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                        }`}
                        data-testid={`button-complete-set-${exIdx}-${setIdx}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSet(exIdx)}
                className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`button-add-set-${exIdx}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add set
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 bg-background/90 backdrop-blur-sm border-t border-border">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={finishWorkout}
            disabled={createWorkout.isPending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            data-testid="button-finish-workout"
          >
            {createWorkout.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            ) : (
              "Finish workout"
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showTimer && (
          <RestTimer seconds={timerSeconds} onDismiss={() => setShowTimer(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
