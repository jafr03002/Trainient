// The dashboard greeting's second line, and the day its CTA starts.
//
// The line used to be one of five generic rotating slogans, which said the same
// thing to someone mid-programme as to someone who has never trained. It now
// names the session the client is actually up to - the one after whatever they
// last finished - so the greeting card knows where they are in their week.

export type NamedDay = { dayNumber: number; label: string };

// Rotates daily rather than on every render/refresh, so it feels like a
// deliberate rotation instead of random flicker.
function dayOfYear(at: Date = new Date()): number {
  const start = new Date(at.getFullYear(), 0, 0);
  return Math.floor((at.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// Five ways of asking for the same session, keyed to its real name.
const SESSION_LINES: ((day: string) => string)[] = [
  (day) => `Ready for ${day}?`,
  (day) => `${day} is up next - let's make it count.`,
  (day) => `${day} is waiting. Time to put in the work.`,
  (day) => `Nothing logs ${day} for you. Show up and get stronger.`,
  (day) => `${day} today - go and beat last time.`,
];

// Nothing to name yet: no program, or no day the client has reached.
const GENERIC_LINES = [
  "Ready to start your workout?",
  "Let's get moving.",
  "Time to put in the work.",
  "Your workout is waiting.",
  "Show up. Get stronger.",
];

export function greetingLine(dayLabel: string | null | undefined, at: Date = new Date()): string {
  const i = dayOfYear(at);
  if (!dayLabel) return GENERIC_LINES[i % GENERIC_LINES.length];
  return SESSION_LINES[i % SESSION_LINES.length](dayLabel);
}

/**
 * The session the client is up to: the one that follows whatever they last
 * finished, wrapping back to the first day at the end of the rotation. With
 * nothing logged yet - or a last session logged against a day this program no
 * longer has - that is simply day one.
 *
 * Deliberately driven by the last COMPLETED session rather than by the calendar:
 * a client who trained Day 1 yesterday is up to Day 2 today whether or not
 * today is the weekday their schedule pencilled it in on, and rotating
 * schedules have no weekday to read anyway.
 */
export function nextSessionDay<T extends NamedDay>(days: T[], lastCompletedDayNumber: number | null | undefined): T | null {
  if (days.length === 0) return null;
  if (lastCompletedDayNumber == null) return days[0];
  const lastIdx = days.findIndex((d) => d.dayNumber === lastCompletedDayNumber);
  if (lastIdx < 0) return days[0];
  return days[(lastIdx + 1) % days.length];
}
