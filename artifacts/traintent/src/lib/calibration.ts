export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export type PhaseRange = { phase: string; start: Date; end: Date };

// Program rows only carry a week number and a phase enum value - no dates.
// A week's real calendar range is onboardingCompletedAt + (weekNumber-1)*7
// through +6 days (mirrors trainingWeekNumber() on the API). Adjacent weeks
// sharing the same phase are merged into one continuous range.
export function buildPhaseRanges(
  programs: { weekNumber: number; shortTermPhase?: string | null }[],
  onboardingCompletedAt: string | null | undefined
): PhaseRange[] {
  if (!onboardingCompletedAt) return [];
  // Calendar day cells are midnight-aligned local dates, but onboardingCompletedAt
  // carries a time-of-day - normalize to that calendar date so week boundaries
  // land on whole days instead of splitting a day between two phases.
  const base = new Date(onboardingCompletedAt);
  base.setHours(0, 0, 0, 0);

  const weeks = programs
    .filter((p): p is { weekNumber: number; shortTermPhase: string } => !!p.shortTermPhase)
    .map((p) => {
      const start = addDays(base, (p.weekNumber - 1) * 7);
      return { phase: p.shortTermPhase, start, end: addDays(start, 6) };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

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

// calibration can run 1-3 weeks before a calibration_review week hands off to
// whatever phase comes next. While "today" falls anywhere in that stretch,
// other (still-provisional) future phases stay hidden from the calendar, and
// a persistent "review possible" nudge appears from day 8 onward.
export const CALIBRATION_FAMILY = new Set(["calibration", "calibration_review"]);

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
  programs: { weekNumber: number; shortTermPhase?: string | null }[],
  onboardingCompletedAt: string | null | undefined,
  calibrationWalkthroughSeenAt: string | null | undefined,
  today: Date
): boolean {
  if (calibrationWalkthroughSeenAt) return false;
  const groups = buildCalibrationGroups(buildPhaseRanges(programs, onboardingCompletedAt));
  return !!findCalibrationGroup(groups, today);
}
