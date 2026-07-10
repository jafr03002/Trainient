import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trophy, MessageSquare, ChevronDown } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useCreateWorkout, useGetPersonalRecords, useListWorkouts } from "@workspace/api-client-react";

type LoggedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  repsLeft: number;
  repsRight: number;
  completed: boolean;
  isNewPr: boolean;
};

type LoggedExercise = {
  name: string;
  muscle: string;
  isUnilateral: boolean;
  sets: LoggedSet[];
  targetSets: number;
  targetReps: string;
  notes: string;
  showNotes: boolean;
};

type PrFlash = { id: number; exercise: string; weight: number };

type WorkoutDraft = {
  logs: LoggedExercise[];
  savedAt: number;
};

type ActiveSessionPointer = {
  programId: string | number;
  dayNumber: number;
};

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // discard drafts older than a day

// Keyed on programId + day only - `weekNumber` is now a live calendar
// calculation (see api-server's trainingWeek helper) that can roll over
// mid-session, so it can't be used to identify a draft.
function draftKey(userId: string, programId: string | number, dayNumber: number): string {
  return `traintent:workout-draft:${userId}:${programId}:${dayNumber}`;
}

function activeSessionKey(userId: string): string {
  return `traintent:workout-draft:active:${userId}`;
}

// In-progress workout data lives only in memory otherwise, so a lost network
// connection (which triggers a page/data reload) wipes out everything the
// user has logged so far. Mirror it to localStorage as they go and restore
// it on the next mount so a reconnect never erases a session mid-workout.
function loadDraft(key: string): WorkoutDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutDraft;
    if (!parsed || !Array.isArray(parsed.logs)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > DRAFT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(key: string, logs: LoggedExercise[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ logs, savedAt: Date.now() } as WorkoutDraft));
  } catch {
    // localStorage unavailable (e.g. private browsing) - degrade to in-memory only
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function loadActiveSession(userId: string): ActiveSessionPointer | null {
  try {
    const raw = window.localStorage.getItem(activeSessionKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionPointer;
  } catch {
    return null;
  }
}

function saveActiveSession(userId: string, pointer: ActiveSessionPointer) {
  try {
    window.localStorage.setItem(activeSessionKey(userId), JSON.stringify(pointer));
  } catch {
    // ignore
  }
}

function clearActiveSession(userId: string) {
  try {
    window.localStorage.removeItem(activeSessionKey(userId));
  } catch {
    // ignore
  }
}

// A set with no real data (weight and all rep fields zero/empty) - e.g. an
// abandoned/empty session - should not count as "last time" or as "started".
function isEmptySet(s: any): boolean {
  if (!s) return true;
  return !(s.weight) && !(s.reps) && !(s.repsLeft) && !(s.repsRight);
}

function hasLoggedData(logs: LoggedExercise[]): boolean {
  return logs.some((ex) => ex.notes.trim() !== "" || ex.sets.some((s) => !isEmptySet(s)));
}

function buildFreshLogs(day: any): LoggedExercise[] {
  return day.exercises.map((ex: any) => ({
    name: ex.name,
    muscle: ex.muscle,
    isUnilateral: !!ex.isUnilateral,
    targetSets: ex.sets,
    targetReps: ex.reps,
    notes: "",
    showNotes: false,
    sets: Array.from({ length: ex.sets }, (_, i) => ({
      setNumber: i + 1,
      weight: 0,
      reps: 0,
      repsLeft: 0,
      repsRight: 0,
      completed: false,
      isNewPr: false,
    })),
  }));
}

// Estimated one-rep max (Epley-style) - PRs are judged on this, not raw
// weight, so a heavier low-rep set and a lighter high-rep set can be compared.
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Section 10: format a single previous set for the per-set "last time" hint.
function formatPrevSet(s: any): string | null {
  if (isEmptySet(s)) return null;
  if (s.repsLeft != null || s.repsRight != null) {
    return `${s.weight ?? 0}kg × ${s.repsLeft ?? 0}L / ${s.repsRight ?? 0}R`;
  }
  return `${s.weight ?? 0}kg × ${s.reps ?? 0}`;
}

export default function Log() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { data: program } = useGetCurrentProgram();
  const { data: personalRecords } = useGetPersonalRecords();
  const { data: history } = useListWorkouts({ limit: 200 });
  const createWorkout = useCreateWorkout();
  const [logs, setLogs] = useState<LoggedExercise[]>([]);
  const [activeDay, setActiveDay] = useState<any>(null);
  const [resumedElsewhere, setResumedElsewhere] = useState(false);
  const [prFlashes, setPrFlashes] = useState<PrFlash[]>([]);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const flashIdRef = useRef(0);

  // Tracks which draft key `logs` currently reflects, so a refetch of
  // `program` (e.g. on network reconnect) doesn't clobber in-progress data -
  // the seed/rehydrate effect below only runs again if the day actually changes.
  const initializedKeyRef = useRef<string | null>(null);
  const currentDraftKeyRef = useRef<string | null>(null);
  const activeSessionRef = useRef<ActiveSessionPointer | null>(null);

  const prBaselineRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (personalRecords) {
      const map: Record<string, number> = {};
      for (const pr of personalRecords) {
        map[pr.exercise.toLowerCase()] = estimatedOneRepMax(pr.maxWeight, pr.reps ?? 0);
      }
      prBaselineRef.current = map;
    }
  }, [personalRecords]);

  // Build "last time" lookup from workout history - keep the full set list of the
  // most recent prior log per exercise, so each set row can show its own match.
  // Also capture that session's note (per-exercise, not per-set) to surface under
  // the last set's hint.
  const lastSetsByExercise: Record<string, any[]> = {};
  const lastNoteByExercise: Record<string, string> = {};
  for (const log of (history ?? []) as any[]) {
    for (const ex of (log.exercisesLogged as any[]) ?? []) {
      const key = ex.name?.toLowerCase();
      if (!key || lastSetsByExercise[key]) continue; // history is newest-first; keep first seen
      // Only count sessions where this exercise actually has logged data.
      if (Array.isArray(ex.sets) && ex.sets.some((s: any) => !isEmptySet(s))) {
        lastSetsByExercise[key] = ex.sets;
        if (ex.notes) lastNoteByExercise[key] = ex.notes;
      }
    }
  }

  const sessionBestRef = useRef<Record<string, number>>({});

  // Which program day to log - passed as ?day=<dayNumber> from the program page.
  const targetDayNumber = (() => {
    const raw = new URLSearchParams(window.location.search).get("day");
    const n = raw ? parseInt(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  })();

  function resolveDay(days: any[]): any {
    if (targetDayNumber != null) {
      const found = days.find((d) => d.dayNumber === targetDayNumber);
      if (found) return found;
    }
    return days[0];
  }

  // Only one workout session can be in progress at a time. If a different day
  // already has an unfinished, unsaved draft, keep the user in that session
  // instead of silently starting a new one (which would orphan the old one).
  useEffect(() => {
    if (!program?.days || !user?.id) return;
    const requestedDay = resolveDay(program.days as any[]);
    if (!requestedDay) return;

    let day = requestedDay;

    const active = loadActiveSession(user.id);
    if (active && (active.programId !== program.id || active.dayNumber !== requestedDay.dayNumber)) {
      if (active.programId === program.id) {
        const activeDraft = loadDraft(draftKey(user.id, active.programId, active.dayNumber));
        const activeDayObj = (program.days as any[]).find((d) => d.dayNumber === active.dayNumber);
        if (activeDraft && activeDayObj) {
          day = activeDayObj;
        } else {
          clearActiveSession(user.id);
        }
      } else {
        clearActiveSession(user.id);
      }
    }

    setActiveDay(day);
    const wasRedirected = day.dayNumber !== requestedDay.dayNumber;
    setResumedElsewhere(wasRedirected);
    if (wasRedirected) {
      setLocation(`/log?day=${day.dayNumber}`, { replace: true });
    }

    const key = draftKey(user.id, program.id, day.dayNumber);
    activeSessionRef.current = { programId: program.id, dayNumber: day.dayNumber };

    // Already initialized for this exact day (e.g. `program` just refetched
    // after a reconnect) - don't touch in-progress `logs`.
    if (initializedKeyRef.current === key) return;

    initializedKeyRef.current = key;
    currentDraftKeyRef.current = key;

    const draft = loadDraft(key);
    if (draft) {
      setLogs(draft.logs);
      return;
    }

    setLogs(buildFreshLogs(day));
  }, [program, user?.id]);

  // Mirror every change to localStorage so a reconnect/reload can restore the
  // in-progress session instead of losing it. Only once real data has been
  // entered - an untouched sheet shouldn't block starting a different day.
  useEffect(() => {
    const key = currentDraftKeyRef.current;
    if (!key || logs.length === 0 || !hasLoggedData(logs)) return;
    saveDraft(key, logs);
    if (user?.id && activeSessionRef.current) {
      saveActiveSession(user.id, activeSessionRef.current);
    }
  }, [logs]);

  // Sets are saved implicitly by typing - no separate "confirm" step. Weight
  // and reps together mark a set as logged, and PR detection runs inline.
  function updateSet(exIdx: number, setIdx: number, field: "weight" | "reps" | "repsLeft" | "repsRight", value: number) {
    const ex = logs[exIdx];
    const set = ex.sets[setIdx];
    const merged = { ...set, [field]: value };

    const hasReps = ex.isUnilateral ? merged.repsLeft > 0 && merged.repsRight > 0 : merged.reps > 0;
    const completed = merged.weight > 0 && hasReps;

    let isNewPr = false;
    if (completed) {
      const nameKey = ex.name.toLowerCase();
      const reps = ex.isUnilateral ? Math.min(merged.repsLeft, merged.repsRight) : merged.reps;
      const score = estimatedOneRepMax(merged.weight, reps);
      const baseline = prBaselineRef.current[nameKey] ?? 0;
      const sessionBest = sessionBestRef.current[nameKey] ?? 0;
      const currentBest = Math.max(baseline, sessionBest);
      isNewPr = score > currentBest;

      if (isNewPr && !set.isNewPr) {
        sessionBestRef.current[nameKey] = score;
        const id = ++flashIdRef.current;
        setPrFlashes((f) => [...f, { id, exercise: ex.name, weight: merged.weight }]);
        setTimeout(() => setPrFlashes((f) => f.filter((x) => x.id !== id)), 4000);
      }
    }

    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s, si) => (si === setIdx ? { ...merged, completed, isNewPr } : s)),
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

  async function finishWorkout() {
    await createWorkout.mutateAsync({
      data: {
        date: new Date().toISOString().split("T")[0],
        dayNumber: activeDay?.dayNumber ?? 1,
        weekNumber: program?.weekNumber ?? 1,
        dayLabel: activeDay?.label ?? null,
        exercisesLogged: logs.filter((ex) => ex.name.trim()).map((ex) => ({
          name: ex.name,
          muscle: ex.muscle,
          sets: ex.sets.map((s) =>
            ex.isUnilateral
              ? { setNumber: s.setNumber, weight: s.weight, reps: null, repsLeft: s.repsLeft, repsRight: s.repsRight, completed: s.completed, isNewPr: s.isNewPr }
              : { setNumber: s.setNumber, weight: s.weight, reps: s.reps, completed: s.completed, isNewPr: s.isNewPr }
          ),
          notes: ex.notes || undefined,
        })),
        notes: null,
      } as any,
    });
    if (currentDraftKeyRef.current) clearDraft(currentDraftKeyRef.current);
    if (user?.id) clearActiveSession(user.id);
    setLocation("/dashboard");
  }

  function handleFinishClick() {
    const allSetsComplete = logs.every((ex) => ex.sets.every((s) => s.completed));
    if (allSetsComplete) {
      finishWorkout();
    } else {
      setShowIncompleteConfirm(true);
    }
  }

  function cancelWorkout() {
    if (currentDraftKeyRef.current) clearDraft(currentDraftKeyRef.current);
    if (user?.id) clearActiveSession(user.id);
    setShowCancelConfirm(false);
    setLocation("/program");
  }

  if (!program || !activeDay) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading workout...</div>
      </div>
    );
  }

  const day = activeDay;
  const sessionPrCount = logs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.isNewPr).length, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto pb-48 md:pb-32">
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
                <div>{flash.exercise} - {flash.weight} kg</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{day?.label ?? "Workout"}</h1>
            {resumedElsewhere && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-2 inline-block">
                Resuming your in-progress session - finish it before starting a new one.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors px-2 py-1.5"
              data-testid="button-cancel-workout"
            >
              Cancel workout
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 space-y-6">
        {logs.map((ex, exIdx) => {
          const prevSets = lastSetsByExercise[ex.name.toLowerCase()];
          const prevNote = lastNoteByExercise[ex.name.toLowerCase()];
          const gridCols = ex.isUnilateral ? "grid-cols-[2rem_1fr_1fr_1fr]" : "grid-cols-[2rem_1fr_1fr]";
          return (
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
                {ex.isUnilateral && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Unilateral</span>
                )}
              </div>
              <h3 className="font-semibold text-foreground mt-1">{ex.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target: {ex.targetSets} × {ex.targetReps}
              </p>
            </div>

            <div className="p-4">
              {/* Column headers */}
              {ex.isUnilateral ? (
                <div className={`grid ${gridCols} gap-2 mb-2 text-xs text-muted-foreground font-medium`}>
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps (L)</span>
                  <span>Reps (R)</span>
                </div>
              ) : (
                <div className={`grid ${gridCols} gap-2 mb-2 text-xs text-muted-foreground font-medium`}>
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps</span>
                </div>
              )}

              <div className="space-y-2">
                {ex.sets.map((set, setIdx) => {
                  const prevStr = formatPrevSet(prevSets?.[setIdx]);
                  return (
                  <div key={set.setNumber}>
                  <motion.div
                    layout
                    className={`grid ${gridCols} gap-2 items-center py-1 rounded-lg transition-all ${
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
                    <input
                      type="number"
                      value={set.weight || ""}
                      onChange={(e) => updateSet(exIdx, setIdx, "weight", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none transition-colors ${
                        set.isNewPr ? "border-amber-500/40 focus:border-amber-400" : "border-border focus:border-primary"
                      }`}
                      data-testid={`input-weight-${exIdx}-${setIdx}`}
                    />
                    {ex.isUnilateral ? (
                      <>
                        <input
                          type="number"
                          value={set.repsLeft || ""}
                          onChange={(e) => updateSet(exIdx, setIdx, "repsLeft", parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                          data-testid={`input-reps-left-${exIdx}-${setIdx}`}
                        />
                        <input
                          type="number"
                          value={set.repsRight || ""}
                          onChange={(e) => updateSet(exIdx, setIdx, "repsRight", parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                          data-testid={`input-reps-right-${exIdx}-${setIdx}`}
                        />
                      </>
                    ) : (
                      <input
                        type="number"
                        value={set.reps || ""}
                        onChange={(e) => updateSet(exIdx, setIdx, "reps", parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                        data-testid={`input-reps-${exIdx}-${setIdx}`}
                      />
                    )}
                  </motion.div>
                  {prevStr && (
                    <p className="text-[11px] text-muted-foreground/60 pl-8 mt-0.5" data-testid={`last-set-${exIdx}-${setIdx}`}>
                      Last time: {prevStr}
                    </p>
                  )}
                  {prevStr && prevNote && setIdx === ex.sets.length - 1 && (
                    <p className="text-[11px] text-primary/80 pl-8 mt-0.5" data-testid={`last-note-${exIdx}`}>
                      Note: {prevNote}
                    </p>
                  )}
                  </div>
                );})}
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-end mt-3">
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
        );})}
      </div>

      <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-4 bg-background/90 backdrop-blur-sm border-t border-border z-40">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleFinishClick}
            disabled={createWorkout.isPending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            data-testid="button-finish-workout"
          >
            {createWorkout.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            ) : sessionPrCount > 0 ? (
              <><Trophy className="w-5 h-5 text-amber-300" /> Finish - {sessionPrCount} new PR{sessionPrCount > 1 ? "s" : ""}!</>
            ) : (
              "Finish workout"
            )}
          </button>
        </div>
      </div>

      {/* Incomplete-sets confirmation */}
      <AnimatePresence>
        {showIncompleteConfirm && (
          <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowIncompleteConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 w-full max-w-sm bg-card border border-border rounded-t-2xl md:rounded-2xl p-5 space-y-4"
            >
              <div>
                <h3 className="font-semibold text-foreground">Not every set is logged</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Looks like some sets are still missing a weight or rep count. Finish anyway, or go back and fill them in?
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowIncompleteConfirm(false)}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground font-medium hover:bg-secondary/30 transition-colors"
                  data-testid="button-keep-logging"
                >
                  Keep logging
                </button>
                <button
                  onClick={() => { setShowIncompleteConfirm(false); finishWorkout(); }}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-finish-anyway"
                >
                  Finish anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancel-workout confirmation */}
      <AnimatePresence>
        {showCancelConfirm && (
          <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCancelConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 w-full max-w-sm bg-card border border-border rounded-t-2xl md:rounded-2xl p-5 space-y-4"
            >
              <div>
                <h3 className="font-semibold text-foreground">Discard this workout?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Everything you've logged in this session will be lost - it won't be saved.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground font-medium hover:bg-secondary/30 transition-colors"
                  data-testid="button-keep-workout"
                >
                  Keep logging
                </button>
                <button
                  onClick={cancelWorkout}
                  className="flex-1 h-11 rounded-xl bg-red-500/90 text-white font-semibold hover:bg-red-500 transition-colors"
                  data-testid="button-discard-workout"
                >
                  Discard workout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
