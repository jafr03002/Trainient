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
