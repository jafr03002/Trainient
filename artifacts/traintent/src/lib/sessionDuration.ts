// Session timing, client side: formatting for the live clock and the calendar,
// plus a restatement of the plausibility bands so the calendar can mark a
// session that won't be counted toward the user's average.
//
// These bands MUST stay in step with artifacts/api-server/src/lib/sessionDuration.ts,
// which is the source of truth - the server decides what actually gets averaged.
// Nothing here gates saving: a session is always stored exactly as recorded, and
// the user is never prompted about the clock.

export const MIN_SESSION_SECONDS = 3 * 60;
export const MAX_SESSION_SECONDS = 4 * 60 * 60;
export const MIN_SECONDS_PER_SET = 45;
export const MAX_SECONDS_PER_SET = 8 * 60;

type LoggedSetLike = {
  weight?: number | null;
  reps?: number | null;
  repsLeft?: number | null;
  repsRight?: number | null;
};
type LoggedExerciseLike = { sets?: LoggedSetLike[] };

function isPerformed(s: LoggedSetLike): boolean {
  return (s.weight || 0) > 0 || (s.reps || 0) > 0 || (s.repsLeft || 0) > 0 || (s.repsRight || 0) > 0;
}

export function plausibleBand(setCount: number): { min: number; max: number } | null {
  if (setCount <= 0) return null;
  const min = Math.max(MIN_SESSION_SECONDS, setCount * MIN_SECONDS_PER_SET);
  const max = Math.min(MAX_SESSION_SECONDS, setCount * MAX_SECONDS_PER_SET);
  return min <= max ? { min, max } : null;
}

/** Mirrors the server's gate, so the calendar's note matches what the average did. */
export function countsTowardAverage(log: {
  durationSeconds?: number | null;
  exercisesLogged?: unknown;
}): boolean {
  const exercises = (log.exercisesLogged as LoggedExerciseLike[] | null) ?? [];
  const setCount = exercises.reduce((n, ex) => n + (ex?.sets?.length ?? 0), 0);
  const band = plausibleBand(setCount);
  const d = log.durationSeconds;
  if (d == null || !band || d < band.min || d > band.max) return false;
  if (exercises.length === 0) return false;
  return exercises.every((ex) => (ex?.sets?.length ?? 0) > 0 && ex.sets!.every(isPerformed));
}

/** Ticking stopwatch: "18:42" under an hour, "1:07:15" at or past it. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Settled duration for display after the fact: "1h 04m" / "48m".
 *
 * Deliberately NOT called formatDuration: checklistItems exports one of those
 * for a per-item countdown ("2:30"), and both are imported into the same files.
 * A whole session reads in hours and minutes, an item's timer in minutes and
 * seconds, so they are different formats and must not be confusable.
 */
export function formatSessionLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (m === 60) return `${h + 1}h 00m`;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** "18:12" - the session's start time of day, which the calendar never had before. */
export function formatStartTime(startedAt: string): string {
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Last-resort estimate for a day nobody has trained yet and the AI never sized -
 * i.e. every Independent-mode day. Work time per set plus its prescribed rest,
 * plus a warm-up allowance.
 */
export const WARMUP_SECONDS = 8 * 60;
export const WORK_SECONDS_PER_SET = 40;
export const DEFAULT_REST_SECONDS = 90;

export function estimateDurationSeconds(
  exercises: { sets?: number | null; restSeconds?: number | null }[]
): number | null {
  if (!exercises.length) return null;
  const work = exercises.reduce(
    (total, ex) => total + (ex.sets || 0) * (WORK_SECONDS_PER_SET + (ex.restSeconds ?? DEFAULT_REST_SECONDS)),
    0
  );
  return work > 0 ? work + WARMUP_SECONDS : null;
}
