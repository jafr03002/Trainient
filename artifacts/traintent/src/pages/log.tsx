import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Loader2, Trophy, MessageSquare, ChevronDown } from "lucide-react";
import { useGetCurrentProgram, useCreateWorkout, useGetPersonalRecords } from "@workspace/api-client-react";

type LoggedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number | null;
  completed: boolean;
  isNewPr: boolean;
};

type LoggedExercise = {
  name: string;
  muscle: string;
  sets: LoggedSet[];
  targetSets: number;
  targetReps: string;
  targetRpe: number;
  notes: string;
  showNotes: boolean;
};

type PrFlash = { id: number; exercise: string; weight: number };

export default function Log() {
  const [, setLocation] = useLocation();
  const { data: program } = useGetCurrentProgram();
  const { data: personalRecords } = useGetPersonalRecords();
  const createWorkout = useCreateWorkout();
  const [logs, setLogs] = useState<LoggedExercise[]>([]);
  const [prFlashes, setPrFlashes] = useState<PrFlash[]>([]);
  const flashIdRef = useRef(0);

  const prBaselineRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (personalRecords) {
      const map: Record<string, number> = {};
      for (const pr of personalRecords) {
        map[pr.exercise.toLowerCase()] = pr.maxWeight;
      }
      prBaselineRef.current = map;
    }
  }, [personalRecords]);

  const sessionBestRef = useRef<Record<string, number>>({});

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
          notes: "",
          showNotes: false,
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            setNumber: i + 1,
            weight: 0,
            reps: 0,
            rpe: null,
            completed: false,
            isNewPr: false,
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

  function updateNotes(exIdx: number, notes: string) {
    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], notes };
      return next;
    });
  }

  function toggleNotes(exIdx: number) {
    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], showNotes: !next[exIdx].showNotes };
      return next;
    });
  }

  function completeSet(exIdx: number, setIdx: number) {
    const ex = logs[exIdx];
    const set = ex.sets[setIdx];
    const weight = set.weight ?? 0;
    const nameKey = ex.name.toLowerCase();

    const baseline = prBaselineRef.current[nameKey] ?? 0;
    const sessionBest = sessionBestRef.current[nameKey] ?? 0;
    const currentBest = Math.max(baseline, sessionBest);
    const isNewPr = weight > 0 && weight > currentBest;

    if (isNewPr) {
      sessionBestRef.current[nameKey] = weight;
      const id = ++flashIdRef.current;
      setPrFlashes((f) => [...f, { id, exercise: ex.name, weight }]);
      setTimeout(() => setPrFlashes((f) => f.filter((x) => x.id !== id)), 4000);
    }

    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s, si) =>
          si === setIdx ? { ...s, completed: true, isNewPr } : s
        ),
      };
      return next;
    });
  }

  function addSet(exIdx: number) {
    setLogs((prev) => {
      const next = [...prev];
      const ex = next[exIdx];
      next[exIdx] = {
        ...ex,
        sets: [...ex.sets, { setNumber: ex.sets.length + 1, weight: 0, reps: 0, rpe: null, completed: false, isNewPr: false }],
      };
      return next;
    });
  }

  async function finishWorkout() {
    const day = (program?.days as any[])?.[0];
    await createWorkout.mutateAsync({
      data: {
        date: new Date().toISOString().split("T")[0],
        dayNumber: day?.dayNumber ?? 1,
        weekNumber: program?.weekNumber ?? 1,
        dayLabel: day?.label ?? null,
        exercisesLogged: logs.map((ex) => ({
          name: ex.name,
          muscle: ex.muscle,
          sets: ex.sets,
          notes: ex.notes || undefined,
        })),
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
  const sessionPrCount = logs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.isNewPr).length, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto pb-32">
      {/* PR Toast Stack */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {prFlashes.map((flash) => (
            <motion.div
              key={flash.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 bg-amber-500/90 backdrop-blur-sm text-black font-semibold text-sm px-4 py-3 rounded-xl shadow-xl"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-medium opacity-80">New personal record!</div>
                <div>{flash.exercise} — {flash.weight} kg</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{day?.label ?? "Workout"}</h1>
            <p className="text-muted-foreground mt-1">{day?.focus}</p>
          </div>
          {sessionPrCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold"
            >
              <Trophy className="w-4 h-4" />
              {sessionPrCount} PR{sessionPrCount > 1 ? "s" : ""}
            </motion.div>
          )}
        </div>
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
                {(() => {
                  const baseline = prBaselineRef.current[ex.name.toLowerCase()];
                  return baseline ? (
                    <span className="text-xs text-muted-foreground">PR: {baseline} kg</span>
                  ) : null;
                })()}
              </div>
              <h3 className="font-semibold text-foreground mt-1">{ex.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target: {ex.targetSets} × {ex.targetReps} @ RPE {ex.targetRpe}
              </p>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-5 gap-2 mb-2 text-xs text-muted-foreground font-medium">
                <span>Set</span>
                <span>Target</span>
                <span>Weight</span>
                <span>Reps</span>
                <span>RPE</span>
              </div>

              <div className="space-y-2">
                {ex.sets.map((set, setIdx) => (
                  <motion.div
                    key={set.setNumber}
                    layout
                    className={`grid grid-cols-5 gap-2 items-center py-1 rounded-lg transition-all ${
                      set.isNewPr ? "bg-amber-500/8 -mx-1 px-1" : set.completed ? "opacity-55" : ""
                    }`}
                    data-testid={`set-row-${exIdx}-${setIdx}`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground font-medium">{set.setNumber}</span>
                      {set.isNewPr && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                          <Trophy className="w-3 h-3 text-amber-400" />
                        </motion.div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{ex.targetReps}</span>
                    <input
                      type="number"
                      value={set.weight || ""}
                      onChange={(e) => updateSet(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      disabled={set.completed}
                      className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none disabled:opacity-50 transition-colors ${
                        set.isNewPr ? "border-amber-500/40 focus:border-amber-400" : "border-border focus:border-primary"
                      }`}
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
                        onClick={() => !set.completed && completeSet(exIdx, setIdx)}
                        disabled={set.completed}
                        className={`p-1.5 rounded-lg transition-colors ${
                          set.isNewPr
                            ? "bg-amber-500/20 text-amber-400"
                            : set.completed
                            ? "bg-chart-2/20 text-chart-2"
                            : "bg-secondary/30 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                        }`}
                        data-testid={`button-complete-set-${exIdx}-${setIdx}`}
                      >
                        {set.isNewPr ? <Trophy className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={() => addSet(exIdx)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-add-set-${exIdx}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add set
                </button>
                <button
                  onClick={() => toggleNotes(exIdx)}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    ex.notes
                      ? "text-primary"
                      : ex.showNotes
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`button-toggle-notes-${exIdx}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {ex.notes ? "Note saved" : "Add note"}
                  <ChevronDown className={`w-3 h-3 transition-transform ${ex.showNotes ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Notes textarea */}
              <AnimatePresence>
                {ex.showNotes && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={ex.notes}
                      onChange={(e) => updateNotes(exIdx, e.target.value)}
                      placeholder="How did this feel? e.g. felt strong, elbow pain, grip gave out..."
                      rows={2}
                      autoFocus
                      className="w-full mt-3 px-3 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                      data-testid={`textarea-notes-${exIdx}`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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
            ) : sessionPrCount > 0 ? (
              <><Trophy className="w-5 h-5 text-amber-300" /> Finish — {sessionPrCount} new PR{sessionPrCount > 1 ? "s" : ""}!</>
            ) : (
              "Finish workout"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
