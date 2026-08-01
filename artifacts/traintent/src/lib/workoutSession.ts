// The in-progress workout session. There is no server-side representation of
// one - no table, no endpoint - so "a session is in progress" means only that
// a draft plus a pointer to it exist in localStorage. Both the log page (which
// writes them) and the program page (which must offer to discard them before
// starting a different day) read through here, so the key format and the
// staleness rules live in exactly one place.

import type { ChecklistCategory } from "@/lib/checklistItems";

export type LoggedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  repsLeft: number;
  repsRight: number;
  completed: boolean;
  isNewPr: boolean;
};

export type LoggedExercise = {
  name: string;
  muscle: string;
  isUnilateral: boolean;
  sets: LoggedSet[];
  targetSets: number;
  targetReps: string;
  notes: string;
  showNotes: boolean;
  // Checklist items (see lib/checklistItems.ts). A checklist item has NO sets -
  // its `sets` array stays empty so it can never reach the volume/e1RM/PR maths,
  // which only counts sets carrying weight or reps.
  kind: "lift" | "checklist";
  targetType: string | null;
  targetSeconds: number | null;
  targetValue: number | null;
  targetUnit: string | null;
  category: ChecklistCategory | null;
  /** Rounds ticked off so far, 0..targetRounds. */
  completedRounds: number;
  targetRounds: number;
  /**
   * Wall-clock ms at which the running countdown expires - NOT a decrementing
   * counter. The whole session is mirrored to localStorage on every change and
   * mobile browsers throttle or freeze timers in a backgrounded tab, so a
   * counter would drift or stall exactly when a 5-minute hold is running and the
   * screen is locked. Null when idle or paused.
   */
  timerEndsAt: number | null;
  /** Seconds left while paused, so Resume picks up where Pause left off. */
  timerPausedRemaining: number | null;
};

export type WorkoutDraft = {
  logs: LoggedExercise[];
  savedAt: number;
  /**
   * Epoch ms when the session clock started - when the log page opened, not
   * when the first set was logged. Persisted so the elapsed time survives a
   * refresh or a backgrounded tab: the clock is always derived from
   * `Date.now() - startedAt`, never from a counter that would stop while the
   * tab is throttled. Optional because drafts written before session timing
   * existed don't carry one.
   */
  startedAt?: number;
};

export type ActiveSessionPointer = {
  programId: string | number;
  dayNumber: number;
};

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // discard drafts older than a day

// Keyed on programId + day only - `weekNumber` is now a live calendar
// calculation (see api-server's trainingWeek helper) that can roll over
// mid-session, so it can't be used to identify a draft.
export function draftKey(userId: string, programId: string | number, dayNumber: number): string {
  return `traintent:workout-draft:${userId}:${programId}:${dayNumber}`;
}

export function activeSessionKey(userId: string): string {
  return `traintent:workout-draft:active:${userId}`;
}

// In-progress workout data lives only in memory otherwise, so a lost network
// connection (which triggers a page/data reload) wipes out everything the
// user has logged so far. Mirror it to localStorage as they go and restore
// it on the next mount so a reconnect never erases a session mid-workout.
export function loadDraft(key: string): WorkoutDraft | null {
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

export function saveDraft(key: string, logs: LoggedExercise[], startedAt?: number) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ logs, savedAt: Date.now(), startedAt } as WorkoutDraft)
    );
  } catch {
    // localStorage unavailable (e.g. private browsing) - degrade to in-memory only
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadActiveSession(userId: string): ActiveSessionPointer | null {
  try {
    const raw = window.localStorage.getItem(activeSessionKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionPointer;
  } catch {
    return null;
  }
}

export function saveActiveSession(userId: string, pointer: ActiveSessionPointer) {
  try {
    window.localStorage.setItem(activeSessionKey(userId), JSON.stringify(pointer));
  } catch {
    // ignore
  }
}

export function clearActiveSession(userId: string) {
  try {
    window.localStorage.removeItem(activeSessionKey(userId));
  } catch {
    // ignore
  }
}

// The pointer is only meaningful while its draft still exists - the draft may
// have expired (DRAFT_MAX_AGE_MS) or already been saved and cleared. Self-heal
// a stale pointer so every caller can treat null as "nothing in progress".
export function resolveActiveSession(
  userId: string
): { pointer: ActiveSessionPointer; draft: WorkoutDraft } | null {
  const pointer = loadActiveSession(userId);
  if (!pointer) return null;
  const draft = loadDraft(draftKey(userId, pointer.programId, pointer.dayNumber));
  if (!draft) {
    clearActiveSession(userId);
    return null;
  }
  return { pointer, draft };
}

// Throw away whatever is in progress: the draft it points at, then the pointer.
export function discardActiveSession(userId: string) {
  const pointer = loadActiveSession(userId);
  if (pointer) {
    clearDraft(draftKey(userId, pointer.programId, pointer.dayNumber));
  }
  clearActiveSession(userId);
}
