import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trophy, MessageSquare, ChevronDown, HelpCircle, Dumbbell, Check, Clock } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useCreateWorkout, useGetPersonalRecords, useListWorkouts, useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { isPreCalibrationLocked } from "@/lib/calibration";
import {
  CHECKLIST_ACCENT,
  categoryMeta,
  describeTarget,
  parseCategory,
  type ChecklistCategory,
} from "@/lib/checklistItems";
import { ChecklistLogCard } from "@/components/ChecklistLogCard";
import { LOGGED_SET_BOUNDS, clampToBounds } from "@/lib/fieldLimits";
import { formatClock } from "@/lib/sessionDuration";
import {
  type LoggedExercise,
  type ActiveSessionPointer,
  draftKey,
  loadDraft,
  saveDraft,
  clearDraft,
  saveActiveSession,
  clearActiveSession,
  resolveActiveSession,
} from "@/lib/workoutSession";
import { WorkoutLogLockDialog } from "@/components/workout/WorkoutLogLockDialog";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
import { toast } from "@/hooks/use-toast";

type PrFlash = { id: number; exercise: string; weight: number };

// A set with no real data (weight and all rep fields zero/empty) - e.g. an
// abandoned/empty session - should not count as "last time" or as "started".
function isEmptySet(s: any): boolean {
  if (!s) return true;
  return !(s.weight) && !(s.reps) && !(s.repsLeft) && !(s.repsRight);
}

// A ticked checklist item counts as real data. Without this a mobility-only session
// reads as empty: the day picker would stay unlocked mid-session and the draft could
// be discarded out from under the user.
function hasLoggedData(logs: LoggedExercise[]): boolean {
  return logs.some(
    (ex) => ex.notes.trim() !== "" || (ex.completedRounds ?? 0) > 0 || ex.sets.some((s) => !isEmptySet(s)),
  );
}

/**
 * Rebuilds the session from the CURRENT program day, then folds the user's entered
 * work back in by exercise name.
 *
 * A draft is just a JSON blob in localStorage with a 24h life, so it can easily
 * predate the shape the app now expects - a session left open across the release
 * that added checklist items restores entries with no `kind`, which then render as
 * lift cards with an empty muscle chip and a nonsense "Target: 1 x". Taking the
 * structure from the program and only the DATA from the draft fixes that, and as a
 * side effect also handles the program being edited mid-session (an added or
 * removed exercise no longer leaves the logger showing a stale list).
 */
/**
 * Identifies the shape of a day's exercise list - what is in it and how much of
 * each - so an edit to the program can be told apart from a plain refetch of it.
 * Deliberately ignores anything the logger doesn't build its rows from (muscle,
 * cue, category), since a change there shouldn't disturb an open session.
 */
function dayStructureKey(day: any): string {
  return ((day?.exercises as any[]) ?? [])
    .map((ex) => `${ex?.kind ?? "lift"}:${ex?.name ?? ""}:${ex?.sets ?? ""}:${ex?.reps ?? ""}:${ex?.targetSeconds ?? ""}`)
    .join("|");
}

function reconcileDraftLogs(draftLogs: LoggedExercise[], day: any): LoggedExercise[] {
  const byName = new Map<string, LoggedExercise>();
  for (const entry of draftLogs ?? []) {
    if (entry?.name) byName.set(entry.name.toLowerCase(), entry);
  }

  return buildFreshLogs(day).map((fresh) => {
    const saved = byName.get(fresh.name.toLowerCase());
    if (!saved) return fresh;

    if (fresh.kind === "checklist") {
      return {
        ...fresh,
        notes: saved.notes ?? "",
        showNotes: !!saved.showNotes,
        // Clamp: the program's round count may have been lowered since.
        completedRounds: Math.min(fresh.targetRounds, saved.completedRounds ?? 0),
        // A countdown is only restored while it is still in the future; one that
        // expired while the tab was closed is dropped rather than replayed.
        timerEndsAt: saved.timerEndsAt != null && saved.timerEndsAt > Date.now() ? saved.timerEndsAt : null,
        timerPausedRemaining: saved.timerPausedRemaining ?? null,
      };
    }

    return {
      ...fresh,
      notes: saved.notes ?? "",
      showNotes: !!saved.showNotes,
      // Keep the fresh row count (the program is the authority on how many sets
      // are prescribed) and copy across whatever the user actually logged.
      sets: fresh.sets.map((s, i) => {
        const savedSet = saved.sets?.[i];
        return savedSet ? { ...s, ...savedSet, setNumber: s.setNumber } : s;
      }),
    };
  });
}

function buildFreshLogs(day: any): LoggedExercise[] {
  return day.exercises.map((ex: any) => {
    const isChecklistItem = ex.kind === "checklist";
    const targetRounds = Math.max(1, ex.sets ?? 1);
    return {
      name: ex.name,
      muscle: ex.muscle,
      isUnilateral: !!ex.isUnilateral,
      targetSets: ex.sets,
      targetReps: ex.reps,
      notes: "",
      showNotes: false,
      kind: isChecklistItem ? "checklist" : "lift",
      targetType: ex.targetType ?? null,
      targetSeconds: ex.targetSeconds ?? null,
      targetValue: ex.targetValue ?? null,
      targetUnit: ex.targetUnit ?? null,
      category: parseCategory(ex.category),
      completedRounds: 0,
      targetRounds,
      timerEndsAt: null,
      timerPausedRemaining: null,
      // Deliberately empty for a checklist item: a placeholder set would be picked
      // up by the volume and PR maths as soon as anything wrote a number into it.
      sets: isChecklistItem
        ? []
        : Array.from({ length: ex.sets }, (_, i) => ({
            setNumber: i + 1,
            weight: 0,
            reps: 0,
            repsLeft: 0,
            repsRight: 0,
            completed: false,
            isNewPr: false,
          })),
    };
  });
}

// Estimated one-rep max (Epley-style) - PRs are judged on this, not raw
// weight, so a heavier low-rep set and a lighter high-rep set can be compared.
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Section 10: format a single previous set for the per-set "last time" hint.
// `isUnilateral` is the exercise's *current* flag: when it's on but the historic
// set was logged bilaterally (single rep value), we tag the hint so the lone
// number doesn't look like a bug next to the new L/R input columns.
function formatPrevSet(s: any, weightUnit: string, isUnilateral: boolean): string | null {
  if (isEmptySet(s)) return null;
  if (s.repsLeft != null || s.repsRight != null) {
    return `${s.weight ?? 0} ${weightUnit} × ${s.repsLeft ?? 0}L / ${s.repsRight ?? 0}R`;
  }
  const base = `${s.weight ?? 0} ${weightUnit} × ${s.reps ?? 0}`;
  return isUnilateral ? `${base} (both sides)` : base;
}

export default function Log() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { data: program, isLoading: isProgramLoading } = useGetCurrentProgram();
  const { data: profile } = useGetProfile();
  const isIndependent = profile?.mode === "independent";
  const weightUnit = profile?.weightUnit ?? "kg";
  const { data: personalRecords } = useGetPersonalRecords();
  const { data: history } = useListWorkouts({ limit: 200 });
  const createWorkout = useCreateWorkout();
  const [logs, setLogs] = useState<LoggedExercise[]>([]);
  const [activeDay, setActiveDay] = useState<any>(null);
  const [resumedElsewhere, setResumedElsewhere] = useState(false);
  const [prFlashes, setPrFlashes] = useState<PrFlash[]>([]);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Epoch ms the session clock started, and the seconds since, recomputed each
  // tick. Null until the user logs their first real set.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const flashIdRef = useRef(0);
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const tourSetRowRef = useRef<HTMLDivElement>(null);
  const tourHelpRef = useRef<HTMLButtonElement>(null);
  const tourFinishRef = useRef<HTMLButtonElement>(null);

  function finishLogTour() {
    updateProfile.mutate(
      { data: { weightLoggingTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
    // After the tour ends (skipped or finished), send the user back to the
    // dashboard.
    setLocation("/dashboard");
  }

  // Tracks which draft key `logs` currently reflects, so a refetch of
  // `program` (e.g. on network reconnect) doesn't clobber in-progress data -
  // the seed/rehydrate effect below only runs again if the day actually changes.
  const initializedKeyRef = useRef<string | null>(null);
  const currentDraftKeyRef = useRef<string | null>(null);
  const activeSessionRef = useRef<ActiveSessionPointer | null>(null);

  // Prior all-time best score per exercise, plus the set of exercises that have
  // ever been logged before - both drawn from saved history (previous sessions
  // only; the in-progress session isn't saved yet). A set can only be a PR if
  // it beats a set from an earlier session, so an exercise the user has never
  // logged has no baseline to beat and its first sets are never PRs.
  const prBaselineRef = useRef<Record<string, number>>({});
  const priorLoggedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const best: Record<string, number> = {};
    const seen = new Set<string>();
    for (const log of (history ?? []) as any[]) {
      for (const ex of (log.exercisesLogged as any[]) ?? []) {
        const key = ex.name?.toLowerCase();
        if (!key || !Array.isArray(ex.sets)) continue;
        for (const s of ex.sets) {
          if (isEmptySet(s)) continue;
          seen.add(key);
          const reps = s.repsLeft != null || s.repsRight != null
            ? Math.min(s.repsLeft ?? 0, s.repsRight ?? 0)
            : (s.reps ?? 0);
          const score = estimatedOneRepMax(s.weight ?? 0, reps);
          if (score > (best[key] ?? 0)) best[key] = score;
        }
      }
    }
    // Genuine PRs from the server may reach back past history's 200-log window;
    // fold them in so the baseline never regresses for very active users.
    for (const pr of personalRecords ?? []) {
      const key = pr.exercise.toLowerCase();
      seen.add(key);
      const score = estimatedOneRepMax(pr.maxWeight, pr.reps ?? 0);
      if (score > (best[key] ?? 0)) best[key] = score;
    }
    prBaselineRef.current = best;
    priorLoggedRef.current = seen;
  }, [history, personalRecords]);

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

    // `resolveActiveSession` already dropped the pointer if its draft is gone,
    // so anything it returns is a live session on some day.
    const active = resolveActiveSession(user.id);
    if (
      active &&
      (String(active.pointer.programId) !== String(program.id) ||
        active.pointer.dayNumber !== requestedDay.dayNumber)
    ) {
      const activeDayObj =
        String(active.pointer.programId) === String(program.id)
          ? (program.days as any[]).find((d) => d.dayNumber === active.pointer.dayNumber)
          : undefined;
      if (activeDayObj) {
        day = activeDayObj;
      } else {
        // Belongs to another program, or to a day this program no longer has.
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

    // The seed key covers the day AND the shape of its exercise list. Keying on
    // the day alone meant an edit to the program could never reach an open
    // logger: saving invalidates the program query, but this page often mounts
    // and seeds from the cached copy BEFORE that refetch lands, and every later
    // run then early-returned because the day hadn't changed. The added item was
    // invisible until the draft was discarded - and discarding only helped when
    // it happened to come after the refetch, which is why it took a few tries.
    const seedKey = `${key}::${dayStructureKey(day)}`;
    if (initializedKeyRef.current === seedKey) return;

    // Same day, different structure: the program was edited while this session
    // was open. Re-seed from the new structure but keep what the user has
    // already entered - reconcile folds it back in by exercise name.
    const structureChangedMidSession = currentDraftKeyRef.current === key;

    initializedKeyRef.current = seedKey;
    currentDraftKeyRef.current = key;

    if (structureChangedMidSession) {
      setLogs((prev) => reconcileDraftLogs(prev, day));
      return;
    }

    const draft = loadDraft(key);
    if (draft) {
      setLogs(reconcileDraftLogs(draft.logs, day));
      // Resume the original clock rather than restarting it - a refresh or a
      // reconnect mid-session must not reset the elapsed time to zero. Drafts
      // written before session timing existed have no start, so adopt now.
      setStartedAt(draft.startedAt ?? Date.now());
      return;
    }

    setLogs(buildFreshLogs(day));
    // The clock runs from the moment the session opens, not from the first
    // logged set - the user is here to train, and a timer that stays blank
    // until they type reads as broken.
    setStartedAt(Date.now());
  }, [program, user?.id]);

  // The session clock. Recomputed from the start timestamp on every tick rather
  // than incremented, so a throttled background tab can't make it drift.
  useEffect(() => {
    if (startedAt == null) {
      setElapsedSeconds(null);
      return;
    }
    const update = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Mirror every change to localStorage so a reconnect/reload can restore the
  // in-progress session instead of losing it. Only once real data has been
  // entered - an untouched sheet shouldn't block starting a different day.
  useEffect(() => {
    const key = currentDraftKeyRef.current;
    if (!key || logs.length === 0 || !hasLoggedData(logs)) return;
    // Persist the running clock alongside the logs so a refresh resumes the
    // same start. The draft is still only written once there's real data, so
    // opening the page and backing out leaves nothing behind.
    saveDraft(key, logs, startedAt ?? Date.now());
    if (user?.id && activeSessionRef.current) {
      saveActiveSession(user.id, activeSessionRef.current);
    }
  }, [logs]);

  // Drives the countdown display. Only runs while a timer is actually going, so an
  // ordinary lifting session schedules nothing. The remaining time is always
  // derived from `timerEndsAt` rather than counted down here, so a throttled or
  // frozen tab (backgrounded phone, locked screen) resumes showing the correct
  // value instead of however far the interval got.
  const hasRunningTimer = logs.some((ex) => ex.timerEndsAt != null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRunningTimer) return;
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [hasRunningTimer]);

  // A finished countdown ticks its own round off, so a completed hold needs no
  // extra tap. `nowTs` must stay in the dep list: `logs` does not change while a
  // countdown runs, so depending on it alone would leave an expired timer frozen
  // at 0:00 instead of completing its round. Comparing against the clock (rather
  // than counting down) also catches a timer that expired while the tab was hidden.
  useEffect(() => {
    const now = Date.now();
    const expired = logs.some((ex) => ex.timerEndsAt != null && ex.timerEndsAt <= now);
    if (!expired) return;
    setLogs((prev) =>
      prev.map((ex) => {
        if (ex.timerEndsAt == null || ex.timerEndsAt > now) return ex;
        return {
          ...ex,
          completedRounds: Math.min(ex.targetRounds, ex.completedRounds + 1),
          timerEndsAt: null,
          timerPausedRemaining: null,
        };
      }),
    );
  }, [logs, nowTs]);

  // Sets are saved implicitly by typing - no separate "confirm" step. Weight
  // and reps together mark a set as logged, and PR detection runs inline.
  function updateSet(exIdx: number, setIdx: number, field: "weight" | "reps" | "repsLeft" | "repsRight", value: number) {
    const ex = logs[exIdx];
    const set = ex.sets[setIdx];
    // Clamped to the bands the API accepts, so a stray minus sign or a held-down
    // key can't produce a session that silently fails to save (and can't poison
    // the PR / volume maths that reads these numbers back).
    const bounded = clampToBounds(value, field === "weight" ? LOGGED_SET_BOUNDS.weight : LOGGED_SET_BOUNDS.reps);
    const merged = { ...set, [field]: bounded };

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
      // Only a PR when it beats a set from an earlier session. The first time an
      // exercise is ever logged there is nothing to beat, so it is not a PR.
      const hasPrior = priorLoggedRef.current.has(nameKey);
      isNewPr = hasPrior && score > currentBest;

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

  // Checklist items get their own completion path. They must NOT go through
  // updateSet, whose `completed = weight > 0 && hasReps` can never be true for
  // something with no weight and no reps.
  function patchItem(exIdx: number, patch: Partial<LoggedExercise>) {
    setLogs((prev) => prev.map((ex, i) => (i === exIdx ? { ...ex, ...patch } : ex)));
  }

  /**
   * Completes the current round of a timed item and rolls straight on to the
   * next one - clearing the timer resets it to the full hold, ready to start
   * again. Unlike toggleChecklistRound this only ever moves forward: a swipe is
   * a one-way gesture, so it must not un-tick a finished item by accident.
   *
   * Undo comes for free at the end: once the last round lands the item is done,
   * the filling card gives way to the ordinary checklist row, and that row's
   * tick clears it.
   */
  function completeChecklistRound(exIdx: number) {
    const ex = logs[exIdx];
    patchItem(exIdx, {
      completedRounds: Math.min(ex.targetRounds, ex.completedRounds + 1),
      timerEndsAt: null,
      timerPausedRemaining: null,
    });
  }

  /** Tick the next round, or untick everything once all rounds are done. */
  function toggleChecklistRound(exIdx: number) {
    const ex = logs[exIdx];
    const done = ex.completedRounds >= ex.targetRounds;
    patchItem(exIdx, {
      completedRounds: done ? 0 : ex.completedRounds + 1,
      // Ticking by hand cancels any running countdown for that round.
      timerEndsAt: null,
      timerPausedRemaining: null,
    });
  }

  function startTimer(exIdx: number) {
    const ex = logs[exIdx];
    const seconds = ex.timerPausedRemaining ?? ex.targetSeconds ?? 0;
    if (seconds <= 0) return;
    patchItem(exIdx, { timerEndsAt: Date.now() + seconds * 1000, timerPausedRemaining: null });
  }

  function pauseTimer(exIdx: number) {
    const ex = logs[exIdx];
    if (ex.timerEndsAt == null) return;
    patchItem(exIdx, {
      timerEndsAt: null,
      timerPausedRemaining: Math.max(0, Math.ceil((ex.timerEndsAt - Date.now()) / 1000)),
    });
  }

  function resetTimer(exIdx: number) {
    patchItem(exIdx, { timerEndsAt: null, timerPausedRemaining: null });
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
    try {
      await createWorkout.mutateAsync({
        data: {
          date: new Date().toISOString().split("T")[0],
          dayNumber: activeDay?.dayNumber ?? 1,
          weekNumber: program?.weekNumber ?? 1,
          dayLabel: activeDay?.label ?? null,
          // Sent exactly as recorded, however implausible - an overnight session
          // is stored honestly and simply fails the plausibility band when
          // averages are computed. The user is never asked about the clock.
          startedAt: startedAt ? new Date(startedAt).toISOString() : null,
          durationSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
          exercisesLogged: logs.filter((ex) => ex.name.trim()).map((ex) => {
            if (ex.kind === "checklist") {
              return {
                name: ex.name,
                muscle: "",
                // No sets, ever. An empty array is what keeps this row out of the
                // volume, e1RM and PR maths on the way back in.
                sets: [],
                kind: "checklist" as const,
                completedRounds: ex.completedRounds,
                targetSeconds: ex.targetSeconds,
                category: ex.category,
                notes: ex.notes || undefined,
              };
            }
            return {
              name: ex.name,
              muscle: ex.muscle,
              kind: "lift" as const,
              sets: ex.sets.map((s) =>
                ex.isUnilateral
                  ? { setNumber: s.setNumber, weight: s.weight, reps: null, repsLeft: s.repsLeft, repsRight: s.repsRight, completed: s.completed, isNewPr: s.isNewPr }
                  : { setNumber: s.setNumber, weight: s.weight, reps: s.reps, completed: s.completed, isNewPr: s.isNewPr }
              ),
              notes: ex.notes || undefined,
            };
          }),
          notes: null,
        },
      });
    } catch {
      // Leave the draft and the user on the page - losing a finished session to a
      // failed request would be far worse than an extra tap on Finish.
      toast({
        title: "Couldn't save your workout",
        description: "Your session is still here. Please try again.",
        variant: "destructive",
      });
      return;
    }
    if (currentDraftKeyRef.current) clearDraft(currentDraftKeyRef.current);
    if (user?.id) clearActiveSession(user.id);
    const loggedCount = logs.filter((ex) => ex.name.trim()).length;
    toast({
      title: "Workout saved 🎉",
      description:
        sessionPrCount > 0
          ? `${sessionPrCount} new PR${sessionPrCount > 1 ? "s" : ""}! Nice work.`
          : `${loggedCount} exercise${loggedCount === 1 ? "" : "s"} logged.`,
    });
    setLocation("/dashboard");
  }

  function handleFinishClick() {
    // Checklist items count toward the gate exactly like sets do. Nothing is
    // blocked either way - an unticked item only means Finish warns first, and
    // the confirm sheet still lets the session through.
    const allSetsComplete = logs.every((ex) => {
      if (ex.kind === "checklist") {
        return ex.completedRounds >= ex.targetRounds;
      }
      return ex.sets.every((s) => s.completed);
    });
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

  if (program && isPreCalibrationLocked(program, new Date())) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <WorkoutLogLockDialog
          open
          programId={program.id}
          onCancel={() => setLocation("/dashboard")}
        />
      </div>
    );
  }

  // The active mode's lineage has no program to log against - the manual
  // lineage in Independent mode, the AI lineage in AI mode. Once the query has
  // settled (and the profile is known, so the copy/CTA match the mode), send
  // the user to their program page to create/generate one instead of spinning
  // on "Loading..." forever.
  if (!isProgramLoading && !program && profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-20">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No program to log yet</h2>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            {isIndependent
              ? "You haven't built a program yet. Create one to start logging your workouts."
              : "You don't have a program yet. Generate one with your AI coach to start logging your workouts."}
          </p>
          <Link href={isIndependent ? "/program/my" : "/program/ai"}>
            <button
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-log-no-program-cta"
            >
              {isIndependent ? "Create your program" : "Generate my program"}
            </button>
          </Link>
        </div>
      </div>
    );
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
  const showLogTour = !!profile && !profile.weightLoggingTourSeenAt && logs.length > 0;
  const logTourSteps: CoachmarkStep[] = [
    { target: tourSetRowRef, text: "Here you can track your weight and reps." },
    ...(!isIndependent ? [{ target: tourHelpRef, text: "Not sure how to perform this exercise? Tap the ? whenever you need it." }] : []),
    { target: tourFinishRef, text: "This is where you save your workout." },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto pb-12">
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
                <div>{flash.exercise} - {flash.weight} {weightUnit}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{day?.label ?? "Workout"}</h1>
            {/* Ambient information, not an achievement - deliberately not given
                the PR pill's treatment, and kept out of the corner the PR badge
                and "Cancel workout" already share. */}
            {elapsedSeconds != null && (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5"
                data-testid="text-session-duration"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium tabular-nums">{formatClock(elapsedSeconds)}</span>
              </div>
            )}
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

      {/* No day picker here on purpose: the page logs exactly the one day named
          above. Switching days happens on the program page, which prompts to
          discard this session first (see DiscardSessionDialog). */}

      <div className="mt-6 space-y-6">
        {logs.map((ex, exIdx) => {
          // Checklist items render in program order, inline among the exercise
          // cards - a warmup item appears above the first lift because that is
          // where it sits in the day.
          if (ex.kind === "checklist") {
            const meta = categoryMeta(ex.category);
            const accent = meta?.token ?? CHECKLIST_ACCENT;
            const allDone = ex.completedRounds >= ex.targetRounds;
            const isRunning = ex.timerEndsAt != null;
            const timed = (ex.targetSeconds ?? 0) > 0 && ex.targetType === "duration";
            const remaining = isRunning
              ? Math.max(0, Math.ceil((ex.timerEndsAt! - Date.now()) / 1000))
              : ex.timerPausedRemaining ?? ex.targetSeconds ?? 0;
            const total = ex.targetSeconds ?? 0;
            const target = describeTarget(ex);

            // A timed item gets the filling card with swipe-to-complete. Every
            // other checklist item keeps the tick, which is still the right
            // control when there is no duration to visualise.
            if (timed && !allDone) {
              return (
                <motion.div
                  key={`${ex.name}-${exIdx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: exIdx * 0.06 }}
                  data-testid={`log-checklist-${exIdx}`}
                >
                  <ChecklistLogCard
                    name={ex.name}
                    accent={accent}
                    label={meta ? meta.label : "Checklist"}
                    completedRounds={ex.completedRounds}
                    targetRounds={ex.targetRounds}
                    remaining={remaining}
                    total={total}
                    isRunning={isRunning}
                    isPaused={ex.timerPausedRemaining != null}
                    onCompleteRound={() => completeChecklistRound(exIdx)}
                    onStart={() => startTimer(exIdx)}
                    onPause={() => pauseTimer(exIdx)}
                    onReset={() => resetTimer(exIdx)}
                    testId={`checklist-${exIdx}`}
                  />
                </motion.div>
              );
            }

            return (
              <motion.div
                key={`${ex.name}-${exIdx}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: exIdx * 0.06 }}
                // Same neutral card fill as an exercise card; the accent border,
                // icon and timer carry the distinction without a colour wash.
                className="rounded-xl overflow-hidden border bg-card"
                style={{ borderColor: `color-mix(in srgb, ${accent} 32%, transparent)` }}
                data-testid={`log-checklist-${exIdx}`}
              >
                <div className="p-4 flex items-center gap-3">
                  <button
                    onClick={() => toggleChecklistRound(exIdx)}
                    aria-pressed={allDone}
                    // An untouched tick renders no text, so without an explicit
                    // label this button reaches a screen reader unnamed.
                    aria-label={
                      allDone
                        ? `${ex.name} — done, tap to clear`
                        : `${ex.name} — mark round ${Math.min(ex.completedRounds + 1, ex.targetRounds)} of ${ex.targetRounds} done`
                    }
                    className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                      allDone
                        ? "bg-chart-2/15 border-chart-2/50 text-chart-2"
                        : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                    title={allDone ? "Mark as not done" : "Mark a round done"}
                    data-testid={`checklist-tick-${exIdx}`}
                  >
                    {allDone ? (
                      <Check className="w-4 h-4" />
                    ) : ex.completedRounds > 0 ? (
                      <span className="text-[11px] font-display font-bold tabular-nums">
                        {ex.completedRounds}/{ex.targetRounds}
                      </span>
                    ) : null}
                  </button>

                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-semibold text-foreground truncate ${allDone ? "opacity-55 line-through" : ""}`}
                    >
                      {ex.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      <span className="font-medium" style={{ color: accent }}>
                        {meta ? meta.label : "Checklist"}
                      </span>
                      {ex.targetRounds > 1 && (
                        <> · round {Math.min(ex.completedRounds + 1, ex.targetRounds)} of {ex.targetRounds}</>
                      )}
                      {target && ex.targetRounds === 1 && <> · {target}</>}
                    </p>
                  </div>

                  {!timed && target && (
                    <span className="font-display font-semibold text-[15px] text-foreground whitespace-nowrap shrink-0">
                      {target}
                    </span>
                  )}
                </div>

              </motion.div>
            );
          }

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
            <div className="p-4 border-b border-border/50 flex items-start justify-between gap-2">
              <div>
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
              {!isIndependent && (
                <button
                  ref={exIdx === 0 ? tourHelpRef : undefined}
                  onClick={() => setLocation(`/exercises/how-to?name=${encodeURIComponent(ex.name)}`)}
                  className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  title="How to perform this exercise"
                  data-testid={`button-exercise-help-${exIdx}`}
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              )}
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
                  const prevStr = formatPrevSet(prevSets?.[setIdx], weightUnit, ex.isUnilateral);
                  return (
                  <div key={set.setNumber}>
                  <motion.div
                    ref={exIdx === 0 && setIdx === 0 ? tourSetRowRef : undefined}
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
                      min={LOGGED_SET_BOUNDS.weight.min}
                      max={LOGGED_SET_BOUNDS.weight.max}
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
                          min={LOGGED_SET_BOUNDS.reps.min}
                          max={LOGGED_SET_BOUNDS.reps.max}
                          value={set.repsLeft || ""}
                          onChange={(e) => updateSet(exIdx, setIdx, "repsLeft", parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
                          data-testid={`input-reps-left-${exIdx}-${setIdx}`}
                        />
                        <input
                          type="number"
                          min={LOGGED_SET_BOUNDS.reps.min}
                          max={LOGGED_SET_BOUNDS.reps.max}
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
                        min={LOGGED_SET_BOUNDS.reps.min}
                        max={LOGGED_SET_BOUNDS.reps.max}
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

      {/* Finishing lives at the end of the list, in normal flow - not in a bar
          pinned to the bottom. On a phone that bar sat above the tab nav, and
          the keyboard pushed both up over the set rows the user was typing
          into; a full-width primary button in the scrolling thumb's path also
          made ending the session an easy mis-tap. Scrolling past the last
          exercise is the natural end of a session, so the button waits there.
          The tour scrolls this into view for its final step (CoachmarkTour
          calls scrollIntoView on each anchored target). */}
      <button
        ref={tourFinishRef}
        onClick={handleFinishClick}
        disabled={createWorkout.isPending}
        className="w-full h-12 mt-8 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
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

      {showLogTour && <CoachmarkTour steps={logTourSteps} onDone={finishLogTour} testIdPrefix="log-tour" />}

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
