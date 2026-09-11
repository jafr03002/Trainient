import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { LoggedExercise } from "@/lib/workoutSession";

/**
 * The logger's two clocks: the session's elapsed time, and the countdowns on
 * timed checklist items.
 *
 * Both are DERIVED from absolute wall-clock timestamps (`startedAt`,
 * `timerEndsAt`) on every tick rather than counted down, because mobile
 * browsers throttle or freeze timers in a backgrounded tab: a counter would
 * drift or stall exactly when a 5-minute hold is running and the screen is
 * locked, while a timestamp resumes showing the right value the moment the tab
 * wakes. The same design carries straight over to a native port.
 */
export function useSessionTimers(
  logs: LoggedExercise[],
  setLogs: Dispatch<SetStateAction<LoggedExercise[]>>,
  startedAt: number | null,
) {
  // Seconds since the session clock started, recomputed each tick.
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, nowTs]);

  function patchItem(exIdx: number, patch: Partial<LoggedExercise>) {
    setLogs((prev) => prev.map((ex, i) => (i === exIdx ? { ...ex, ...patch } : ex)));
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

  return { elapsedSeconds, nowTs, startTimer, pauseTimer, resetTimer };
}
