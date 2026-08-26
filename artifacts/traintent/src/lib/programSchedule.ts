// Reading a program's schedule on the client.
//
// Deliberately a hand-written mirror of the read half of
// api-server/src/lib/programSchedule.ts rather than a shared import: traintent
// and api-server are separate workspace packages, and the same split already
// exists for the phase template (see the note above timelineFor in
// PresentationDeck.tsx). The server owns what gets written; this file only
// answers "which day falls on this date".
//
// Read-only on purpose. Nothing in the client builds a schedule any more -
// scheduling belongs to AI mode, where the server derives it at generation and
// carries it forward through each weekly check-in. Independent mode's manual
// builder used to place days itself; that step is gone and its placement
// helpers went with it.
//
// Every non-null slot names a training day; null is a rest slot.

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type ScheduleMode = "fixed" | "rotating";

// The stored shape: slots hold dayNumbers. `rotating` is a shape readers must
// handle rather than one anything currently produces - generation and check-ins
// only ever emit `fixed`.
export type StoredSchedule = { mode: ScheduleMode; slots: (number | null)[] };

// Monday-based weekday index for a YYYY-MM-DD string. Parsed by hand because
// `new Date("2026-08-03")` is treated as UTC midnight, which lands on the
// previous day west of Greenwich and would shift the whole week by one.
export function mondayIndexOf(date: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return null;
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  if (Number.isNaN(d.getTime())) return null;
  return (d.getDay() + 6) % 7; // JS weeks start Sunday; ours start Monday.
}

export function daysBetween(from: string, to: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!a || !b) return null;
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

export function todayDateString(at: Date = new Date()): string {
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const dd = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${mm}-${dd}`;
}

// Which dayNumber (if any) falls on `date`. A rotating cycle with no startDate
// has nothing to count from and reports "unscheduled" rather than guessing an
// anchor, which would quietly put the user on the wrong day of their cycle.
export function resolveDayForDate(
  schedule: StoredSchedule | null | undefined,
  startDate: string | null | undefined,
  date: string,
): number | null {
  if (!schedule || !schedule.slots?.length) return null;

  if (schedule.mode === "fixed") {
    const index = mondayIndexOf(date);
    if (index === null) return null;
    return schedule.slots[index] ?? null;
  }

  if (!startDate) return null;
  const elapsed = daysBetween(startDate, date);
  if (elapsed === null || elapsed < 0) return null;
  return schedule.slots[elapsed % schedule.slots.length] ?? null;
}

// The next `count` days as { date, dayId }, for the program page's strip.
export function upcomingSlots(
  schedule: StoredSchedule | null | undefined,
  startDate: string | null | undefined,
  from: string,
  count: number,
): { date: string; dayId: number | null }[] {
  const out: { date: string; dayId: number | null }[] = [];
  if (!schedule || !schedule.slots.length) return out;

  const [y, m, d] = from.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const at = new Date(y!, m! - 1, d! + i);
    const date = todayDateString(at);
    out.push({ date, dayId: resolveDayForDate(schedule, startDate, date) });
  }
  return out;
}
