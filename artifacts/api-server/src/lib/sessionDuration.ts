// Decides which recorded session durations are trustworthy enough to average.
//
// A session is timed by wall clock from the moment the log page opens to the
// moment Finish is tapped, so the failure mode is a user who forgets to tap
// Finish and records 23 hours. We store whatever was recorded - the calendar shows what
// actually happened - and filter here, at read time, so the thresholds below can
// be retuned later without rewriting a single stored row.
//
// The frontend mirrors the bands in artifacts/traintent/src/lib/sessionDuration.ts
// (display only - it never gates saving). This file is the source of truth.

import { isPerformed, type LoggedExercise, type LoggedSet } from "./workoutAnalysis";

// Global band: catches the mis-tap and the overnight, regardless of workout size.
export const MIN_SESSION_SECONDS = 3 * 60;
export const MAX_SESSION_SECONDS = 4 * 60 * 60;

// Per-set band: scales with the day, so a 3h40m "6-set session" is rejected even
// though it clears the global ceiling.
export const MIN_SECONDS_PER_SET = 45;
export const MAX_SECONDS_PER_SET = 8 * 60;

// Nothing above a day is storable; the client clock is not trusted.
export const MAX_STORABLE_SECONDS = 24 * 60 * 60;

// How many recent eligible sessions the average is drawn from. Bounded so the
// number tracks current fitness rather than averaging in last year's pace.
export const AVERAGE_WINDOW = 10;

// One eligible session is a noisy average, but it is a real measurement of this
// user where the alternative (the AI's estimate) is a guess about them.
export const MIN_SAMPLES_FOR_AVERAGE = 1;

export function totalSetCount(exercisesLogged: unknown): number {
  const exercises = (exercisesLogged as LoggedExercise[] | null) ?? [];
  return exercises.reduce((n, ex) => n + (ex?.sets?.length ?? 0), 0);
}

/**
 * The intersection of the global and per-set bands. Returns null when no
 * duration could ever be plausible - a log with no sets, or a day so large the
 * two bands don't overlap.
 */
export function plausibleBand(setCount: number): { min: number; max: number } | null {
  if (setCount <= 0) return null;
  const min = Math.max(MIN_SESSION_SECONDS, setCount * MIN_SECONDS_PER_SET);
  const max = Math.min(MAX_SESSION_SECONDS, setCount * MAX_SECONDS_PER_SET);
  return min <= max ? { min, max } : null;
}

export function isPlausibleDuration(seconds: number | null | undefined, setCount: number): boolean {
  if (seconds == null || !Number.isFinite(seconds)) return false;
  const band = plausibleBand(setCount);
  if (!band) return false;
  return seconds >= band.min && seconds <= band.max;
}

/**
 * "Did they fill everything in?" - the user's rule for excluding half-logged
 * sessions. A set counts as filled once it has any data at all, which is
 * deliberately more permissive than the log page's `completed` flag: that flag
 * requires weight > 0, so a bodyweight set logged as reps-only would otherwise
 * disqualify an entire honest session.
 */
export function isFullyLogged(exercisesLogged: unknown): boolean {
  const exercises = (exercisesLogged as LoggedExercise[] | null) ?? [];
  if (exercises.length === 0) return false;
  return exercises.every(
    (ex) => (ex?.sets?.length ?? 0) > 0 && ex.sets.every((s: LoggedSet) => isPerformed(s))
  );
}

export type DurationCandidate = {
  durationSeconds: number | null;
  exercisesLogged: unknown;
};

/** The single gate. Everything that averages durations must go through this. */
export function countsTowardAverage(log: DurationCandidate): boolean {
  return (
    isPlausibleDuration(log.durationSeconds, totalSetCount(log.exercisesLogged)) &&
    isFullyLogged(log.exercisesLogged)
  );
}

/** "1h 04m" / "48m" - the calendar and program page rendering. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  // Rounding 59.6 minutes up must not render as "0h 60m".
  if (m === 60) return `${h + 1}h 00m`;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
