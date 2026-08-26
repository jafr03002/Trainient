// When each program day is actually trained.
//
// Until now nothing persisted a schedule at all: a ProgramDay is
// { dayNumber, label, focus, exercises } with no weekday and no date, so the
// only weekly layout the app ever showed was SCHEDULE_SLOTS in the frontend's
// PresentationDeck - a hardcoded lookup on day COUNT that ignored the rest days
// the user had just been asked for, and was never sent back here.
//
// A schedule is stored beside `days` (programs.schedule) rather than as a field
// on each day, for three reasons:
//   1. a per-day weekday can't say where the REST slots fall in a rotation
//      ("Upper, Rest, Lower, Rest" vs "Upper, Lower, Rest, Rest"),
//   2. it can't express the same day appearing twice in one cycle,
//   3. `days` is rewritten wholesale by every weekly check-in, so anything
//      stored inside it is easy to lose.
//
// This is the WRITE side, and the only side there is: a schedule is derived
// here at AI generation and carried forward here at each weekly check-in.
// Nothing else creates one - Independent mode's manual builder deliberately
// doesn't, so manual programs stay unscheduled. Reading a schedule back out
// ("which day falls on this date") is the client's job, in
// traintent/src/lib/programSchedule.ts.
//
// Every non-null slot is a `dayNumber`; null is a rest slot.

import type { ProgramSchedule } from "@workspace/api-zod";

// Slot 0 is Monday, matching both the calendar grid (calendar.tsx builds its
// month Monday-first) and the lowercase mon..sun values onboarding stores in
// profile.preferredRestDays.
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const FIXED_SLOT_COUNT = 7;

type DayRef = { dayNumber: number };

// A sensible fixed week: training days spread across the weekdays the user did
// NOT ask to keep free. Always `fixed` - a rotating cycle would drift straight
// through the rest days they just picked.
//
// Rest-day preferences are a preference, not a prohibition (ti-program-generation.md:
// "Strong preference to not put training days here. But it is not strictly
// prohibited"), so when someone asks for more rest days than the week can afford
// we place what fits and then spill into the preferred rest days rather than
// dropping training days on the floor.
export function defaultFixedSchedule(
  days: DayRef[],
  preferredRestDays: readonly string[] = [],
): ProgramSchedule {
  const slots: (number | null)[] = Array(FIXED_SLOT_COUNT).fill(null);
  const wanted = days.slice(0, FIXED_SLOT_COUNT);
  if (!wanted.length) return { mode: "fixed", slots };

  const rest = new Set(
    preferredRestDays
      .map((d) => WEEKDAY_KEYS.indexOf(d.trim().toLowerCase() as (typeof WEEKDAY_KEYS)[number]))
      .filter((i) => i >= 0),
  );

  const free = WEEKDAY_KEYS.map((_, i) => i).filter((i) => !rest.has(i));
  // Spill order: the preferred rest days, used only once `free` runs out.
  const spill = WEEKDAY_KEYS.map((_, i) => i).filter((i) => rest.has(i));
  const pool = [...free, ...spill];

  const placements =
    wanted.length > free.length
      ? // More training days than free weekdays: take every free day, then spill
        // into the preferred rest days in weekday order.
        pool.slice(0, wanted.length)
      : rest.size === 0
        ? // No stated preference, so the whole week is in play - and the week is
          // a RING: pinning both Monday and Sunday would butt the last session of
          // one week against the first of the next. Space them around the loop
          // instead, which puts 3 days on Mon/Wed/Sat rather than Mon/Thu/Sun.
          spreadAroundWeek(wanted.length)
        : // Rest days already break the week into a run with a start and an end,
          // so pin the first and last free day and space the rest between them -
          // 3 days with Sat/Sun free becomes Mon/Wed/Fri.
          spreadAcross(free, wanted.length);

  placements.sort((a, b) => a - b);
  placements.forEach((weekday, i) => {
    const day = wanted[i];
    if (day) slots[weekday] = day.dayNumber;
  });

  return { mode: "fixed", slots };
}

// `count` weekdays spaced around the 7-day ring starting from Monday, so the
// gap between Sunday and the following Monday counts like any other.
function spreadAroundWeek(count: number): number[] {
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(Math.round((i * FIXED_SLOT_COUNT) / count) % FIXED_SLOT_COUNT);
  }
  return picked;
}

// `count` entries picked from `pool`, endpoints included, as evenly spaced as
// integer positions allow. Callers guarantee count <= pool.length, which is what
// makes the step at least 1 and so the picks distinct.
function spreadAcross(pool: number[], count: number): number[] {
  if (count <= 0 || !pool.length) return [];
  if (count === 1) return [pool[0]!];
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.round((i * (pool.length - 1)) / (count - 1));
    picked.push(pool[at]!);
  }
  return picked;
}

// Carry a schedule onto a new set of days, dropping references to days that no
// longer exist. Weekly check-ins rewrite `days` wholesale with no stable day
// identity, so without this every user's schedule would silently reset itself
// the moment they checked in.
//
// Returns null when nothing worth keeping survives, which reads downstream as
// "unscheduled" and lets the caller derive a fresh default instead.
export function remapSchedule(
  schedule: ProgramSchedule | null | undefined,
  newDays: DayRef[],
): ProgramSchedule | null {
  if (!schedule || !Array.isArray(schedule.slots)) return null;

  const known = new Set(newDays.map((d) => d.dayNumber));
  const slots = schedule.slots.map((s) => (s != null && known.has(s) ? s : null));
  if (!slots.some((s) => s != null)) return null;

  return { mode: schedule.mode, slots };
}
