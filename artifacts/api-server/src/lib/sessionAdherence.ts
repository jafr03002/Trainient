// Derives "how many of this week's program days did the client actually log?"
// from workout_logs, replacing the old self-reported "did you complete all
// sessions?" check-in question.
//
// Deliberately counts LOGGED sessions, not COMPLETED ones - the two are not the
// same, and nothing in the data can tell them apart. A client who trains and
// forgets to log looks identical to one who skipped. The check-in form asks a
// follow-up question when this comes up short, and the prompt is worded as
// "logged" throughout, so the model never silently treats a logging gap as a
// training gap.
//
// It also cannot tell WHICH weekdays were trained: a ProgramDay is
// { dayNumber, label, focus, exercises } with no weekday and no date, and
// nothing persists a schedule (the SCHEDULE_SLOTS map in the frontend's
// PresentationDeck is display-only). So this is a count, not a calendar check.

import { isPerformed, type LoggedExercise } from "./workoutAnalysis";
import { weekWindow, inWindow } from "./dateWindow";

type ProgramDay = { dayNumber: number; label?: string | null; focus?: string | null };

export type AdherenceLogRow = {
  date: string;
  dayNumber: number;
  dayLabel: string | null;
  mode: string;
  exercisesLogged: unknown;
};

export type AdherenceDay = { dayNumber: number; label: string; date: string | null };

export type SessionAdherence = {
  windowStart: string;
  windowEnd: string;
  plannedSessions: number;
  loggedSessions: number;
  loggedDays: AdherenceDay[];
  missingDays: AdherenceDay[];
  // Qualifying logs beyond the first for a given program day - e.g. Push logged
  // twice. Reported separately so a repeat can't push loggedSessions past
  // plannedSessions and read as "5 of 4".
  extraSessions: number;
};

// A log counts only if it holds real data. The log page can persist a row with
// empty sets (an opened-then-abandoned session), and the calendar already
// filters those out for display - counting them here would inflate adherence.
function hasRealData(log: AdherenceLogRow): boolean {
  const exercises = (log.exercisesLogged as LoggedExercise[] | null) ?? [];
  return exercises.some((ex) => Array.isArray(ex?.sets) && ex.sets.some(isPerformed));
}

export function computeSessionAdherence(args: {
  today: string;
  programDays: ProgramDay[];
  workoutLogs: AdherenceLogRow[];
}): SessionAdherence {
  const { today, programDays, workoutLogs } = args;
  const { start, end } = weekWindow(today);

  // Denominator is the live program's own day count, never profile.trainingDays -
  // deload and calibration weeks legitimately prescribe fewer days and must not
  // be scored as misses.
  const plannedSessions = programDays.length;

  const qualifying = workoutLogs
    // Independent-mode sessions belong to the manual lineage and must not count
    // toward an AI-coach check-in.
    .filter((l) => l.mode === "ai")
    .filter((l) => inWindow(l.date, start, end))
    .filter(hasRealData)
    // Oldest first, so the date kept per program day is the first time it was
    // trained this week.
    .sort((a, b) => a.date.localeCompare(b.date));

  const firstDateByDay = new Map<number, string>();
  let extraSessions = 0;
  for (const log of qualifying) {
    if (firstDateByDay.has(log.dayNumber)) {
      extraSessions++;
    } else {
      firstDateByDay.set(log.dayNumber, log.date);
    }
  }

  const labelFor = (d: ProgramDay, fallbackFrom?: AdherenceLogRow): string =>
    d.label || fallbackFrom?.dayLabel || `Day ${d.dayNumber}`;

  const loggedDays: AdherenceDay[] = [];
  const missingDays: AdherenceDay[] = [];
  for (const day of programDays) {
    const date = firstDateByDay.get(day.dayNumber);
    const sourceLog = qualifying.find((l) => l.dayNumber === day.dayNumber);
    const entry = { dayNumber: day.dayNumber, label: labelFor(day, sourceLog), date: date ?? null };
    if (date) loggedDays.push(entry);
    else missingDays.push(entry);
  }

  return {
    windowStart: start,
    windowEnd: end,
    plannedSessions,
    // Distinct program days trained, capped by what the program actually
    // prescribes - a log for a dayNumber the program no longer has (e.g. the
    // program shrank mid-week) shows up in extraSessions instead.
    loggedSessions: loggedDays.length,
    loggedDays,
    missingDays,
    extraSessions: extraSessions + (firstDateByDay.size - loggedDays.length),
  };
}

// One compact block for the AI prompt. Says "logged", never "completed", and
// spells out how to read a "forgot to log" answer so the model can't quietly
// treat a logging gap as non-adherence.
export function formatAdherence(a: SessionAdherence, missedReason: string | null): string {
  const lines = [
    `- Sessions logged: ${a.loggedSessions} of ${a.plannedSessions} program days (7-day window ${a.windowStart} to ${a.windowEnd})`,
    `    logged:  ${a.loggedDays.length ? a.loggedDays.map((d) => `${d.label} (${d.date})`).join(", ") : "none"}`,
  ];
  if (a.missingDays.length) {
    lines.push(`    missing: ${a.missingDays.map((d) => d.label).join(", ")}`);
  }
  if (a.extraSessions > 0) {
    lines.push(`    plus ${a.extraSessions} extra session(s) beyond the prescribed days`);
  }
  if (missedReason) {
    lines.push(`    client says: ${MISSED_REASON_TEXT[missedReason] ?? missedReason}`);
    if (missedReason === "forgot_to_log") {
      lines.push(
        `    => treat the missing session(s) as TRAINED; the gap is in logging, not training.` +
          ` Do not cut volume for it, but note that session's performance data is absent.`,
      );
    }
  }
  return lines.join("\n");
}

export const MISSED_REASON_TEXT: Record<string, string> = {
  forgot_to_log: "trained it but forgot to log it",
  time: "skipped - time or life got in the way",
  fatigue: "skipped - felt too beat up",
  injury: "skipped - injury or pain",
  other: "skipped - other reason",
};
