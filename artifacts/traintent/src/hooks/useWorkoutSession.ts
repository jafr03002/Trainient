import { useEffect, useRef, useState } from "react";
import {
  type LoggedExercise,
  type ActiveSessionPointer,
  draftKey,
  saveDraft,
  clearDraft,
  saveActiveSession,
  clearActiveSession,
  resolveActiveSession,
  startSession,
} from "@/lib/workoutSession";
import { dayStructureKey, reconcileDraftLogs } from "@/lib/sessionLogs";

type Navigate = (to: string, options?: { replace?: boolean }) => void;

/**
 * The logger's draft/session state machine. It only ever RESUMES a session -
 * sessions are started from the program page (see startSession) - and mirrors
 * every change to the draft in localStorage so a reload or reconnect picks up
 * exactly where the client left off.
 */
export function useWorkoutSession({
  program,
  userId,
  setLocation,
}: {
  program: any;
  userId: string | undefined;
  setLocation: Navigate;
}) {
  const [logs, setLogs] = useState<LoggedExercise[]>([]);
  const [activeDay, setActiveDay] = useState<any>(null);
  // Whether a session is open, once we've been able to look: null while the
  // program/user are still loading (nothing has been resolved yet), false when
  // there is genuinely nothing in progress - the idle screen.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  // A Start workout press reached this page and the session still couldn't be
  // written - localStorage is where a session lives, so a browser refusing it
  // (private mode, storage turned off, a full quota) means no workout can be
  // logged at all. Kept apart from `hasSession` because the idle screen's
  // "go and press Start workout" is exactly the wrong advice in that case.
  const [startFailed, setStartFailed] = useState(false);
  const [resumedElsewhere, setResumedElsewhere] = useState(false);
  // Epoch ms the session clock started. Restored from the draft, so a refresh
  // resumes the same clock rather than restarting it.
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Tracks which draft key `logs` currently reflects, so a refetch of
  // `program` (e.g. on network reconnect) doesn't clobber in-progress data -
  // the seed/rehydrate effect below only runs again if the day actually changes.
  const initializedKeyRef = useRef<string | null>(null);
  const currentDraftKeyRef = useRef<string | null>(null);
  const activeSessionRef = useRef<ActiveSessionPointer | null>(null);
  // Set the moment the session is deliberately ended (finished or cancelled),
  // so nothing re-seeds or re-saves it in the frames before we navigate away.
  const endingRef = useRef(false);

  // Which program day to log - passed as ?day=<dayNumber> from the program page -
  // and whether the client got here by pressing Start workout (`&start=1`) as
  // opposed to opening the logger from the nav. The two say different things:
  // `day` is which day is wanted, `start` is that a session was actually asked
  // for, and only the second one licenses beginning one (see the effect below).
  const { targetDayNumber, startRequested } = (() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("day");
    const n = raw ? parseInt(raw) : NaN;
    return {
      targetDayNumber: Number.isFinite(n) ? n : null,
      startRequested: params.get("start") === "1",
    };
  })();

  function resolveDay(days: any[]): any {
    if (targetDayNumber != null) {
      const found = days.find((d) => d.dayNumber === targetDayNumber);
      if (found) return found;
    }
    return days[0];
  }

  // A session begins on a deliberate press of Start workout, and this page
  // hangs off the pointer that press writes (see startSession) rather than off
  // the `?day=` in the URL. Opening /log by itself - the nav item, a bookmark -
  // asks for no session and gets none: the idle screen renders instead, so the
  // logger can be looked at without quietly starting a workout.
  //
  // The one exception is a press that arrives here having failed to leave a
  // pointer behind. `start=1` is that press, and honouring it is the difference
  // between landing in a running session and landing on "No logging ongoing"
  // one tap after Start workout - which reads as the button being broken, and
  // gives the client nowhere to go but the button they just pressed. The URL
  // carrying the request is dropped the moment it is served, so a later
  // refresh or Back can't replay it into a second session.
  useEffect(() => {
    if (!program?.days || !userId) return;
    // Finishing or cancelling clears the session and navigates away; a refetch
    // landing in that gap must not flash the idle screen over the leaving page.
    if (endingRef.current) return;

    // `resolveActiveSession` already dropped the pointer if its draft is gone,
    // so anything it returns is a live session on some day.
    let active = resolveActiveSession(userId);

    const dayOf = (pointer: ActiveSessionPointer) =>
      String(pointer.programId) === String(program.id)
        ? (program.days as any[]).find((d) => d.dayNumber === pointer.dayNumber)
        : undefined;

    let sessionDay = active ? dayOf(active.pointer) : undefined;

    // Belongs to another program, or to a day this program no longer has -
    // nothing on this page can render it.
    if (active && !sessionDay) {
      clearActiveSession(userId);
      active = null;
    }

    // Nothing in progress, but the client pressed Start workout on this day to
    // get here. Begin it, rather than showing them an idle screen that tells
    // them to go and press the button they just pressed. Checked after the
    // pointer above so a live session always wins: a press that collides with
    // one never reaches this page (the program page raises its discard dialog
    // first), and a resumed session must not be restarted from empty.
    if (!active && startRequested && targetDayNumber != null) {
      const wanted = (program.days as any[]).find((d) => d.dayNumber === targetDayNumber);
      if (wanted) {
        // startSession reports whether the session survived the write; false
        // means storage itself refused it, which is the one case where there
        // genuinely is nothing to log and the client deserves to know why.
        setStartFailed(!startSession(userId, program.id, wanted.dayNumber));
        active = resolveActiveSession(userId);
        sessionDay = active ? dayOf(active.pointer) : undefined;
      }
    }

    if (!sessionDay) {
      setHasSession(false);
      setActiveDay(null);
      setLogs([]);
      setStartedAt(null);
      setResumedElsewhere(false);
      initializedKeyRef.current = null;
      currentDraftKeyRef.current = null;
      activeSessionRef.current = null;
      return;
    }

    const day = sessionDay;
    setHasSession(true);
    setActiveDay(day);

    // `?day=` only says which day the client asked for; the open session decides
    // which one they get. Landing on a different one (or on a bare /log) means
    // they were sent back to the session already running, which the banner says.
    const requestedDay = resolveDay(program.days as any[]);
    const wasRedirected = !!requestedDay && requestedDay.dayNumber !== day.dayNumber;
    setResumedElsewhere(wasRedirected);
    // Replaces rather than pushes, which also spends the `start=1` request: it
    // has been served, and leaving it in the history entry would let a refresh -
    // or a Back out of the session the client just finished - ask for the day to
    // be started all over again.
    if (wasRedirected || startRequested) {
      setLocation(`/log?day=${day.dayNumber}`, { replace: true });
    }

    const key = draftKey(userId, program.id, day.dayNumber);
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

    // The draft always exists here - `resolveActiveSession` checked, and a
    // freshly started session's is simply empty, which reconciles to a blank
    // sheet built from the day. Resume its clock rather than restarting it: a
    // refresh or a reconnect mid-session must not reset the elapsed time to
    // zero. Drafts written before session timing existed have no start, so
    // adopt now.
    setLogs(reconcileDraftLogs(active!.draft.logs, day));
    setStartedAt(active!.draft.startedAt ?? Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, userId]);

  // Mirror every change to localStorage so a reconnect/reload can restore the
  // in-progress session instead of losing it. No "has anything been typed yet"
  // test any more: the draft exists from the moment Start workout is tapped
  // (startSession writes it), so a started session is a session whether or not
  // a number has been entered - and nothing lands here without one.
  useEffect(() => {
    const key = currentDraftKeyRef.current;
    if (!key || logs.length === 0 || endingRef.current) return;
    // Persist the running clock alongside the logs so a refresh resumes the
    // same start.
    saveDraft(key, logs, startedAt ?? Date.now());
    if (userId && activeSessionRef.current) {
      saveActiveSession(userId, activeSessionRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

  /**
   * The session is over - saved or discarded. Latches `endingRef` first so the
   * effects above can't re-seed or re-save it in the frames before the caller
   * navigates away, then throws away the draft and the pointer at it.
   */
  function endSession() {
    endingRef.current = true;
    if (currentDraftKeyRef.current) clearDraft(currentDraftKeyRef.current);
    if (userId) clearActiveSession(userId);
  }

  return { logs, setLogs, activeDay, hasSession, startFailed, resumedElsewhere, startedAt, endSession };
}
