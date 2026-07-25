// Date-string window helpers shared by the weekly check-in's evidence builder
// (lib/checkinData.ts) and its session-adherence calculation
// (lib/sessionAdherence.ts). Both must describe the SAME seven days - if they
// drifted, the client would be told they logged 3 of 4 sessions while the model
// was told something else.
//
// Dates are `YYYY-MM-DD` strings throughout (workout_logs.date, daily_logs.date
// and bodyweight_logs.date are all text columns), which compare correctly
// lexicographically, so no Date objects are needed for the comparisons.

// The date `n` days before `today`, still as YYYY-MM-DD.
export function daysAgoStr(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! - n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// [start, end] inclusive.
export function inWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

// "This week" everywhere in the check-in: the 7 days ending today, inclusive.
export function weekWindow(today: string): { start: string; end: string } {
  return { start: daysAgoStr(today, 6), end: today };
}

// Today as YYYY-MM-DD, server local. Every route that needs a "now" to compare a
// client-supplied log date against uses this one, so they can't disagree.
export function todayDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// A real day on the calendar, not just something shaped like one. The zod schemas
// already reject anything that fails the YYYY-MM-DD pattern, but the pattern alone
// still admits 2026-02-31 - and `new Date(2026, 1, 31)` silently rolls that over to
// March 3rd rather than failing, which would store a date the user never picked.
// Re-serializing and comparing is what catches it.
export function isCalendarDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.getFullYear() === y && dt.getMonth() === m! - 1 && dt.getDate() === d!;
}

// Logs are a record of what already happened, so a date in the future is a typo or
// a bad client. One day of slack is deliberate: the server runs UTC in production
// while the client sends its own local date, so a user far enough east genuinely
// posts what is still "tomorrow" here.
export function isTooFarInFuture(date: string, today: string): boolean {
  return date > daysAgoStr(today, -1);
}

// The two guards above as one check, returning the message to 400 with, or null when
// the date is fine. Shared by every route that accepts a client-supplied log date so
// they all reject the same things with the same wording.
export function logDateError(date: string, today = todayDateString()): string | null {
  if (!isCalendarDateString(date)) {
    return `"${date}" is not a valid date. Expected YYYY-MM-DD.`;
  }
  if (isTooFarInFuture(date, today)) {
    return `Cannot log for ${date} - that date is in the future.`;
  }
  return null;
}
