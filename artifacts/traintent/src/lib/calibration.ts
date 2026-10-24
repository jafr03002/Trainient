export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export type PhaseRange = { phase: string; start: Date; end: Date };

export type PhaseRow = {
  shortTermPhase?: string | null;
  weekInPhase?: number | null;
  generatedAt: string;
  aiGenerated?: boolean | null;
  startDate?: string | null;
};

function localMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Day 1 of AI training: the start date the client committed to, from the newest
// AI row that carries one (only the accepted generation row does, plus check-in
// rows of a rotating schedule, which copy it). Read as a local calendar date, so
// it lands on the day they picked in any timezone. Falls back to the server's
// training clock, which PATCH /programs/:id also moves to the start date.
export function trainingStart(programs: PhaseRow[], onboardingCompletedAt: string | null | undefined): Date | null {
  const started = programs
    .filter((p) => p.aiGenerated && p.startDate)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (started) return parseLocalDateString(started.startDate!);
  return onboardingCompletedAt ? localMidnight(new Date(onboardingCompletedAt)) : null;
}

// Program rows carry no dates of their own, and the API stamps every row with
// the CURRENT week (weekNumber is the live training week, not the row's), so
// each row's week is derived from when it was written instead:
// - a fresh start into calibration (generation, or a goal change at check-in)
//   covers the week it was written in - week 1 when written before day 1;
// - the output of the calibration review or a check-in is next week's program,
//   so it starts the week after the previous row's, or later if it came later.
// The newest row runs through today, so a calibration nobody has reviewed yet
// keeps covering the days after its first week. Adjacent weeks sharing a phase
// merge into one range.
export function buildPhaseRanges(
  programs: PhaseRow[],
  onboardingCompletedAt: string | null | undefined,
  today: Date = new Date()
): PhaseRange[] {
  const base = trainingStart(programs, onboardingCompletedAt);
  if (!base) return [];
  const weekIndexAt = (date: Date) =>
    Math.max(0, Math.floor(Math.round((localMidnight(date).getTime() - base.getTime()) / 86_400_000) / 7));

  const rows = programs
    .filter((p) => p.aiGenerated && !!p.shortTermPhase)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

  // Later rows win a week they share (a regenerated program, or two check-ins
  // landing on one week).
  const phaseByWeek = new Map<number, string>();
  let prevWeek = -1;
  for (const p of rows) {
    const writtenWeek = weekIndexAt(new Date(p.generatedAt));
    const freshStart = p.shortTermPhase === "calibration" && (p.weekInPhase ?? 1) <= 1;
    const week = freshStart || prevWeek < 0 ? writtenWeek : Math.max(writtenWeek, prevWeek + 1);
    phaseByWeek.set(week, p.shortTermPhase!);
    for (const w of phaseByWeek.keys()) if (w > week) phaseByWeek.delete(w);
    prevWeek = week;
  }

  const lastWeek = Math.max(prevWeek, weekIndexAt(today));
  const weeks: PhaseRange[] = [];
  let phase: string | undefined;
  for (let w = 0; w <= lastWeek; w++) {
    phase = phaseByWeek.get(w) ?? phase;
    if (!phase) continue;
    const start = addDays(base, w * 7);
    weeks.push({ phase, start, end: addDays(start, 6) });
  }

  const ranges: PhaseRange[] = [];
  for (const w of weeks) {
    const last = ranges[ranges.length - 1];
    if (last && last.phase === w.phase && addDays(last.end, 1).getTime() === w.start.getTime()) {
      last.end = w.end;
    } else {
      ranges.push({ ...w });
    }
  }
  return ranges;
}

export function findPhaseRange(ranges: PhaseRange[], date: Date): PhaseRange | undefined {
  const t = date.getTime();
  return ranges.find((r) => t >= r.start.getTime() && t <= r.end.getTime());
}

// Calibration is the first week; the calibration review (a readiness check,
// not a weekly check-in) moves them into the next phase. Until then it keeps
// running (see buildPhaseRanges). While "today" falls anywhere in it, other
// (still-provisional) future phases stay hidden from the calendar, and a
// persistent "review possible" nudge appears from day 8 onward.
// calibration_review is a legacy enum value the API never produces.
export const CALIBRATION_FAMILY = new Set(["calibration", "calibration_review"]);

export const FIRST_CHECKIN_AFTER_REVIEW_DAYS = 7;

export type CheckinGate =
  | { open: true; firstAfterReview: boolean }
  | { open: false; reason: "calibration" }
  | { open: false; reason: "after_review"; opensAt: Date };

// When a weekly check-in is allowed. Mirrors api-server's lib/checkinGate.ts,
// which enforces it - keep the two in step. None during calibration (the
// calibration review ends it, not a check-in); the first one opens a week after
// that review, read off the rows as the moment the AI lineage first left
// calibration. firstAfterReview: open, and nothing checked in since the review.
export function checkinGate(
  programs: PhaseRow[],
  latestCheckinAt: string | null | undefined,
  now: Date = new Date()
): CheckinGate {
  const newestFirst = programs
    .filter((p) => p.aiGenerated)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  if (newestFirst.length === 0) return { open: true, firstAfterReview: false };
  if (newestFirst[0]!.shortTermPhase === "calibration") return { open: false, reason: "calibration" };

  let reviewAt: Date | null = null;
  let sawCalibration = false;
  for (const p of newestFirst) {
    if (p.shortTermPhase === "calibration") {
      sawCalibration = true;
      break;
    }
    reviewAt = new Date(p.generatedAt);
  }
  if (!sawCalibration || !reviewAt) return { open: true, firstAfterReview: false };
  if (latestCheckinAt && new Date(latestCheckinAt).getTime() >= reviewAt.getTime()) return { open: true, firstAfterReview: false };

  const opensAt = new Date(reviewAt.getTime() + FIRST_CHECKIN_AFTER_REVIEW_DAYS * 86_400_000);
  return now.getTime() >= opensAt.getTime()
    ? { open: true, firstAfterReview: true }
    : { open: false, reason: "after_review", opensAt };
}

export type CalibrationGroup = { start: Date; end: Date };

export function buildCalibrationGroups(ranges: PhaseRange[]): CalibrationGroup[] {
  const family = ranges
    .filter((r) => CALIBRATION_FAMILY.has(r.phase))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const groups: CalibrationGroup[] = [];
  for (const r of family) {
    const last = groups[groups.length - 1];
    if (last && addDays(last.end, 1).getTime() === r.start.getTime()) {
      last.end = r.end;
    } else {
      groups.push({ start: r.start, end: r.end });
    }
  }
  return groups;
}

export function findCalibrationGroup(groups: CalibrationGroup[], date: Date): CalibrationGroup | undefined {
  const t = date.getTime();
  return groups.find((g) => t >= g.start.getTime() && t <= g.end.getTime());
}

// A day is eligible for "review possible" once it's at least 7 full days into
// the active calibration group (day 8 onward), through the group's end.
export function isReviewPossible(group: CalibrationGroup, date: Date): boolean {
  const t = date.getTime();
  return t >= group.start.getTime() && t <= group.end.getTime() && t >= addDays(group.start, 7).getTime();
}

// The calibration walkthrough shows once, the first time a client is living in an
// active calibration window - not gated by a route, just this computed boolean
// (mirrors dashboard.tsx's showCheckinBanner pattern).
export function shouldShowCalibrationWalkthrough(
  programs: PhaseRow[],
  onboardingCompletedAt: string | null | undefined,
  calibrationWalkthroughSeenAt: string | null | undefined,
  today: Date
): boolean {
  if (calibrationWalkthroughSeenAt) return false;
  const groups = buildCalibrationGroups(buildPhaseRanges(programs, onboardingCompletedAt));
  return !!findCalibrationGroup(groups, today);
}

// Local YYYY-MM-DD for a Date, matching how program.startDate is stored
// server-side (see api-server's programs.ts PATCH handler). Comparing
// calendar strings avoids parsing startDate with `new Date()`, which reads
// a bare YYYY-MM-DD as UTC midnight and can skew a day near the UTC boundary.
export function localDateString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Inverse of localDateString - builds a local midnight Date from a
// YYYY-MM-DD string, instead of `new Date(str)`, which reads it as UTC
// midnight and can display a day off near the UTC boundary.
export function parseLocalDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// preCalibrationPhase: an AI-generated program has been committed to a start
// date that's still in the future. Purely date-derived, like the calibration
// walkthrough gate above - not a persisted/backend concept. Independent
// (manual) programs are never locked, regardless of startDate.
export function isPreCalibrationLocked(
  program: { startDate?: string | null; aiGenerated?: boolean } | null | undefined,
  today: Date
): boolean {
  if (!program?.aiGenerated || !program.startDate) return false;
  return program.startDate.slice(0, 10) > localDateString(today);
}
