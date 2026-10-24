// The hard-coded half of the calibration review: when it is open, when
// calibration ends on its own, whether the client is paused, and the hard
// checks. Pure functions over rows and YYYY-MM-DD strings, so the AI never
// decides any of it (lib/calibrationReview.ts calls these, then asks the AI only
// for the judgement - see knowledge/ti-calibration-review.md).
//
// Day 1 is the start date. The review opens on day 8 and the last day to take
// it is day 21 (calibration's maxWeeks: 3 in phaseTemplate.ts). A client who
// hasn't passed by then leaves calibration on day 22, unless they are paused
// (ill, or injured so they can't train). Recovering opens a fresh window: the
// review is open straight away and the exit moves to 7 days later at the
// earliest. After an extend the review opens again the next day.

import { daysAgoStr, inWindow, weekWindow } from "./dateWindow";
import { computeSessionAdherence, type AdherenceLogRow } from "./sessionAdherence";

export const REVIEW_OPENS_DAY = 8;
export const LAST_REVIEW_DAY = 21;
export const RECOVERY_WINDOW_DAYS = 7;
export const REQUIRED_WEIGH_INS = 3;
export const REQUIRED_NUTRITION_LOGS = 3;

export function addDaysStr(date: string, n: number): string {
  return daysAgoStr(date, -n);
}

// Server-local calendar date of a timestamp, matching todayDateString().
export function dateStringOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function daysBetween(from: string, to: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export type CalibrationProgramRow = {
  id: number;
  shortTermPhase: string | null;
  generatedAt: Date;
  startDate: string | null;
};

export type CalibrationReviewRow = {
  id: number;
  kind: string;
  verdict: string;
  submittedAt: Date;
  resumedAt: Date | null;
};

// The calibration the client is in right now: the newest AI row must be on
// calibration. A regenerated program during calibration adds rows to the same
// run, so the run starts at the oldest of the consecutive calibration rows.
export function currentCalibrationRun<T extends CalibrationProgramRow>(
  aiPrograms: T[],
): { current: T; runStart: T } | null {
  const newestFirst = [...aiPrograms].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  if (newestFirst[0]?.shortTermPhase !== "calibration") return null;
  let runStart = newestFirst[0];
  for (const p of newestFirst) {
    if (p.shortTermPhase !== "calibration") break;
    runStart = p;
  }
  return { current: newestFirst[0], runStart };
}

// Day 1: the start date the client committed to (newest AI row carrying one),
// else the training clock. A calibration entered later - a goal change at a
// check-in starts the template over - begins when that row was written.
export function calibrationStartDate(
  aiPrograms: CalibrationProgramRow[],
  runStart: CalibrationProgramRow,
  onboardingCompletedAt: Date | null | undefined,
): string {
  const withStart = [...aiPrograms]
    .filter((p) => p.startDate)
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
  const trainingStart = withStart?.startDate ?? (onboardingCompletedAt ? dateStringOf(onboardingCompletedAt) : null);
  const runStartDate = dateStringOf(runStart.generatedAt);
  if (!trainingStart) return runStartDate;
  return trainingStart > runStartDate ? trainingStart : runStartDate;
}

export type ReviewBlockedReason = "too_early" | "paused" | "retake_tomorrow" | "ended";

export type CalibrationWindow = {
  calibrationDay: number;
  startDate: string;
  reviewOpensOn: string;
  lastReviewDate: string;
  autoExitOn: string;
  paused: boolean;
  // The paused review row, when paused - POST /calibration/recovered stamps it.
  pausedReviewId: number | null;
  reviewOpen: boolean;
  reviewBlockedReason: ReviewBlockedReason | null;
  nextReviewAvailableOn: string | null;
  autoExitDue: boolean;
};

// `reviews` are this calibration run's reviews (submitted after the run began).
export function calibrationWindow(args: {
  today: string;
  startDate: string;
  reviews: CalibrationReviewRow[];
}): CalibrationWindow {
  const { today, startDate } = args;
  const reviews = [...args.reviews].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  const latest = reviews[0];

  const calibrationDay = daysBetween(startDate, today) + 1;
  const reviewOpensOn = addDaysStr(startDate, REVIEW_OPENS_DAY - 1);

  let lastReviewDate = addDaysStr(startDate, LAST_REVIEW_DAY - 1);
  for (const r of reviews) {
    if (!r.resumedAt) continue;
    const fresh = addDaysStr(dateStringOf(r.resumedAt), RECOVERY_WINDOW_DAYS - 1);
    if (fresh > lastReviewDate) lastReviewDate = fresh;
  }
  const autoExitOn = addDaysStr(lastReviewDate, 1);

  const paused = latest?.verdict === "paused" && !latest.resumedAt;
  const extendedToday = latest?.verdict === "extend" && dateStringOf(latest.submittedAt) === today;

  let reviewBlockedReason: ReviewBlockedReason | null = null;
  let nextReviewAvailableOn: string | null = null;
  if (paused) {
    reviewBlockedReason = "paused";
  } else if (today < reviewOpensOn) {
    reviewBlockedReason = "too_early";
    nextReviewAvailableOn = reviewOpensOn;
  } else if (today > lastReviewDate) {
    reviewBlockedReason = "ended";
  } else if (extendedToday) {
    reviewBlockedReason = "retake_tomorrow";
    const tomorrow = addDaysStr(today, 1);
    // Extending on the last day leaves no tomorrow to retake on - the exit runs.
    nextReviewAvailableOn = tomorrow <= lastReviewDate ? tomorrow : null;
  }

  return {
    calibrationDay,
    startDate,
    reviewOpensOn,
    lastReviewDate,
    autoExitOn,
    paused,
    pausedReviewId: paused ? latest!.id : null,
    reviewOpen: reviewBlockedReason === null,
    reviewBlockedReason,
    nextReviewAvailableOn,
    autoExitDue: !paused && today > lastReviewDate,
  };
}

export type CalibrationChecks = {
  allMet: boolean;
  windowStart: string;
  windowEnd: string;
  fullRotation: { met: boolean; logged: number; planned: number; missingDays: string[] };
  weighIns: { met: boolean; count: number; required: number };
  nutritionLogs: { met: boolean; count: number; required: number };
};

// The hard checks, over the same 7-day window the check-in uses. A full
// rotation = every day of the program logged at least once in the window.
export function calibrationChecks(args: {
  today: string;
  programDays: { dayNumber: number; label?: string | null }[];
  workoutLogs: AdherenceLogRow[];
  bodyweightLogs: { date: string }[];
  dailyLogs: { date: string; calories: number | null }[];
}): CalibrationChecks {
  const { start, end } = weekWindow(args.today);
  const adherence = computeSessionAdherence({
    today: args.today,
    programDays: args.programDays,
    workoutLogs: args.workoutLogs,
  });
  const weighIns = new Set(args.bodyweightLogs.filter((l) => inWindow(l.date, start, end)).map((l) => l.date)).size;
  const nutritionLogs = new Set(
    args.dailyLogs.filter((l) => l.calories != null && inWindow(l.date, start, end)).map((l) => l.date),
  ).size;

  const fullRotation = {
    met: adherence.plannedSessions > 0 && adherence.loggedSessions >= adherence.plannedSessions,
    logged: adherence.loggedSessions,
    planned: adherence.plannedSessions,
    missingDays: adherence.missingDays.map((d) => d.label),
  };
  const weigh = { met: weighIns >= REQUIRED_WEIGH_INS, count: weighIns, required: REQUIRED_WEIGH_INS };
  const nutrition = {
    met: nutritionLogs >= REQUIRED_NUTRITION_LOGS,
    count: nutritionLogs,
    required: REQUIRED_NUTRITION_LOGS,
  };
  return {
    allMet: fullRotation.met && weigh.met && nutrition.met,
    windowStart: start,
    windowEnd: end,
    fullRotation,
    weighIns: weigh,
    nutritionLogs: nutrition,
  };
}

export type CalibrationSessionFeedback = {
  equipment: "yes" | "some_missing" | "no";
  formConfidence: number;
  pain: "none" | "discomfort" | "pain";
  painWhere?: string | null;
  overallFeel: number;
};

export type CalibrationSession = {
  workoutLogId: number;
  date: string;
  dayNumber: number;
  dayLabel: string | null;
  note: string | null;
  exerciseNotes: { exercise: string; note: string }[];
  feedback: CalibrationSessionFeedback | null;
};

// Every calibration session since day 1, oldest first - the feedback bank the
// review reads (session note, exercise notes, the post-session questions).
export function calibrationSessions(
  logs: {
    id: number;
    date: string;
    dayNumber: number;
    dayLabel: string | null;
    mode: string;
    loggingMode: string;
    notes: string | null;
    exercisesLogged: unknown;
    calibrationFeedback: unknown;
    createdAt: Date;
  }[],
  startDate: string,
): CalibrationSession[] {
  return logs
    .filter((l) => l.mode === "ai" && l.loggingMode === "calibration" && l.date >= startDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((l) => ({
      workoutLogId: l.id,
      date: l.date,
      dayNumber: l.dayNumber,
      dayLabel: l.dayLabel,
      note: l.notes?.trim() || null,
      exerciseNotes: ((l.exercisesLogged as { name?: string; notes?: string | null }[] | null) ?? [])
        .filter((ex) => ex?.name && ex.notes?.trim())
        .map((ex) => ({ exercise: ex.name!, note: ex.notes!.trim() })),
      feedback: (l.calibrationFeedback as CalibrationSessionFeedback | null) ?? null,
    }));
}

export function feedbackSummary(sessions: CalibrationSession[]) {
  const answered = sessions.filter((s) => s.feedback);
  const avg = (nums: number[]) =>
    nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
  const equipment = { yes: 0, some_missing: 0, no: 0 };
  for (const s of answered) equipment[s.feedback!.equipment]++;
  return {
    sessionsLogged: sessions.length,
    sessionsWithFeedback: answered.length,
    averageFormConfidence: avg(answered.map((s) => s.feedback!.formConfidence)),
    averageOverallFeel: avg(answered.map((s) => s.feedback!.overallFeel)),
    equipment,
    painReports: answered
      .filter((s) => s.feedback!.pain !== "none")
      .map((s) => ({
        date: s.date,
        dayLabel: s.dayLabel,
        pain: s.feedback!.pain as "discomfort" | "pain",
        where: s.feedback!.painWhere?.trim() || null,
      })),
  };
}

type StoredExercise = {
  name: string;
  sets: number;
  reps: string;
  rpe?: number | null;
  restSeconds?: number | null;
  cue?: string | null;
  muscle: string;
  kind?: string;
  [key: string]: unknown;
};
type StoredDay = { dayNumber: number; label?: string | null; exercises?: StoredExercise[]; [key: string]: unknown };

export type ProposedSwap = {
  day_number: number;
  replace: string;
  with: { name: string; sets: number; reps: string; rest_seconds: number; cue: string; muscle: string };
  why: string;
};

export type AppliedSwap = {
  dayNumber: number;
  dayLabel: string | null;
  replaced: string;
  replacement: { name: string; sets: number; reps: string; rpe: null; restSeconds: number; cue: string; muscle: string };
  why: string;
};

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Applies the AI's swaps to a copy of the program days. A swap whose day or
// exercise can't be found is dropped (the model named something that isn't
// there), and each exercise is swapped at most once. Checklist items are never
// swapped - they aren't lifts.
export function applyExerciseSwaps(
  days: StoredDay[],
  swaps: ProposedSwap[],
): { days: StoredDay[]; applied: AppliedSwap[] } {
  const next = days.map((d) => ({ ...d, exercises: [...(d.exercises ?? [])] }));
  const applied: AppliedSwap[] = [];
  const touched = new Set<string>();
  for (const swap of swaps) {
    const day = next.find((d) => d.dayNumber === swap.day_number);
    if (!day) continue;
    const index = day.exercises.findIndex(
      (ex) => ex.kind !== "checklist" && normalizeName(ex.name) === normalizeName(swap.replace),
    );
    const key = `${day.dayNumber}:${index}`;
    if (index < 0 || touched.has(key)) continue;
    touched.add(key);
    const replacement = {
      name: swap.with.name,
      sets: swap.with.sets,
      reps: swap.with.reps,
      rpe: null,
      restSeconds: swap.with.rest_seconds,
      cue: swap.with.cue,
      muscle: swap.with.muscle,
    };
    const replaced = day.exercises[index]!.name;
    day.exercises[index] = replacement;
    applied.push({ dayNumber: day.dayNumber, dayLabel: day.label ?? null, replaced, replacement, why: swap.why });
  }
  return { days: next, applied };
}
