// The pure half of the workout logger: building a session's rows from a program
// day, folding a saved draft back into them, and reading the "last time" hints
// out of saved history. No React and no storage here - the log page's hooks
// (useWorkoutSession, usePrDetection) are the only things that hold state.

import { parseCategory } from "@/lib/checklistItems";
import type { LoggedExercise } from "@/lib/workoutSession";

// A set with no real data (weight and all rep fields zero/empty) - e.g. an
// abandoned/empty session - should not count as "last time" or as "started".
export function isEmptySet(s: any): boolean {
  if (!s) return true;
  return !(s.weight) && !(s.reps) && !(s.repsLeft) && !(s.repsRight);
}

// "12 Aug" - just enough to place a carried-forward note in time without
// widening the hint line it sits on. Null for a log with an unreadable date.
export function formatShortDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Identifies the shape of a day's exercise list - what is in it and how much of
 * each - so an edit to the program can be told apart from a plain refetch of it.
 * Deliberately ignores anything the logger doesn't build its rows from (muscle,
 * cue, category), since a change there shouldn't disturb an open session.
 */
export function dayStructureKey(day: any): string {
  return ((day?.exercises as any[]) ?? [])
    .map((ex) => `${ex?.kind ?? "lift"}:${ex?.name ?? ""}:${ex?.sets ?? ""}:${ex?.reps ?? ""}:${ex?.targetSeconds ?? ""}`)
    .join("|");
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
export function reconcileDraftLogs(draftLogs: LoggedExercise[], day: any): LoggedExercise[] {
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

export function buildFreshLogs(day: any): LoggedExercise[] {
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
export function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Section 10: format a single previous set for the per-set "last time" hint.
// `isUnilateral` is the exercise's *current* flag: when it's on but the historic
// set was logged bilaterally (single rep value), we tag the hint so the lone
// number doesn't look like a bug next to the new L/R input columns.
export function formatPrevSet(s: any, weightUnit: string, isUnilateral: boolean): string | null {
  if (isEmptySet(s)) return null;
  if (s.repsLeft != null || s.repsRight != null) {
    return `${s.weight ?? 0} ${weightUnit} × ${s.repsLeft ?? 0}L / ${s.repsRight ?? 0}R`;
  }
  const base = `${s.weight ?? 0} ${weightUnit} × ${s.reps ?? 0}`;
  return isUnilateral ? `${base} (both sides)` : base;
}

export type LastNote = { text: string; date: string | null };

// Build "last time" lookup from workout history - keep the full set list of the
// most recent prior log per exercise, so each set row can show its own match.
// Also carry that session's note (per-exercise, not per-set) forward, with the
// date it was written, so the logger can show it back under the set rows.
// Keyed by exercise rather than by program day on purpose: it keeps the note
// and the "Last time" numbers above it drawn from one and the same session.
export function buildLastSessionLookup(history: any[] | undefined): {
  lastSetsByExercise: Record<string, any[]>;
  lastNoteByExercise: Record<string, LastNote>;
} {
  const lastSetsByExercise: Record<string, any[]> = {};
  const lastNoteByExercise: Record<string, LastNote> = {};
  for (const log of (history ?? []) as any[]) {
    for (const ex of (log.exercisesLogged as any[]) ?? []) {
      const key = ex.name?.toLowerCase();
      if (!key || lastSetsByExercise[key]) continue; // history is newest-first; keep first seen
      // Only count sessions where this exercise actually has logged data.
      if (Array.isArray(ex.sets) && ex.sets.some((s: any) => !isEmptySet(s))) {
        lastSetsByExercise[key] = ex.sets;
        const text = typeof ex.notes === "string" ? ex.notes.trim() : "";
        if (text) lastNoteByExercise[key] = { text, date: log.date ?? null };
      }
    }
  }
  return { lastSetsByExercise, lastNoteByExercise };
}
