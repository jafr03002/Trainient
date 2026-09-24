import { useState, type ReactNode, type RefObject } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import {
  useGetCalendarColors,
  type DailyLogsWeekResult,
  type Program,
  type WorkoutLog,
} from "@workspace/api-client-react";
import { buildDayColorOrder, dayColorHex } from "@/lib/dayColors";
import { WEEKDAY_LABELS, resolveDayForDate, todayDateString, type StoredSchedule } from "@/lib/programSchedule";
import { parseLocalDateString } from "@/lib/calibration";
import { DayDetailSheet, type PlannedSession } from "@/components/dashboard/DayDetailSheet";

type WeekStripProps = {
  program: Program | undefined;
  weekLogs: DailyLogsWeekResult | undefined;
  workouts: WorkoutLog[];
  weekStartStr: string;
  todayStr: string;
  weightUnit: string;
  isIndependent: boolean;
  isLoading: boolean;
  // The "Full month" link, which the calendar leg of the first-run tour points
  // at when the nav no longer carries a Calendar tab.
  calendarLinkRef?: RefObject<HTMLAnchorElement | null>;
  // Shown on the left of the strip's top row, opposite "Full month".
  header?: ReactNode;
};

// A session name has about 45px at 390px wide, so a long label is shortened
// rather than dropped: Jakob asked for names, not dots. Multi-word labels
// become their initials ("Upper Body" -> "UB"), a single long word is clipped.
export function abbreviateLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 6) return trimmed;
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return `${trimmed.slice(0, 5)}…`;
}

function addDays(from: string, days: number): string {
  const d = parseLocalDateString(from);
  d.setDate(d.getDate() + days);
  return todayDateString(d);
}

/**
 * The tappable week at the top of the dashboard: seven days, Monday-first, on a
 * shallow arc over the Sessions wash, each carrying the session it belongs to.
 * A logged session fills its circle, a planned one is outlined, a rest day is
 * dashed, and today wears a white ring. Tapping any day opens its detail - the numbers the old "This
 * week" table used to spread across four columns.
 *
 * `programs.schedule` may be `rotating`, which the backend doesn't fully
 * implement yet. Rather than pinning a rotation to weekdays it can't know, this
 * shows what was actually logged on each day and lists the cycle underneath as
 * a sequence.
 */
export function WeekStrip({
  program,
  weekLogs,
  workouts,
  weekStartStr,
  todayStr,
  weightUnit,
  isIndependent,
  isLoading,
  calendarLinkRef,
  header,
}: WeekStripProps) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const colorsQuery = useGetCalendarColors();
  const colorMap: Record<string, string> = {};
  (colorsQuery.data ?? []).forEach((c) => { colorMap[c.dayLabel] = c.hexColor; });

  const days = (program?.days ?? []) as Program["days"];
  // Same positional order the program page and calendar use, so a day is the
  // same colour here as it is everywhere else.
  const colorOrder = buildDayColorOrder(
    days.map((d) => d.label),
    workouts.map((w) => w.dayLabel),
  );
  const colorFor = (label: string) => dayColorHex(label, colorOrder, colorMap);

  const schedule = (program?.schedule ?? null) as StoredSchedule | null;
  const isFixed = schedule?.mode === "fixed";

  const sessionsByDate: Record<string, WorkoutLog[]> = {};
  for (const w of workouts) {
    (sessionsByDate[w.date] ??= []).push(w);
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStartStr, i);
    const logged = sessionsByDate[date] ?? [];
    // Only a fixed schedule can say what a future day holds. A logged session
    // is a fact either way, so it shows on a rotating program too.
    const plannedDayNumber = isFixed ? resolveDayForDate(schedule, program?.startDate ?? null, date) : null;
    const plannedDay = plannedDayNumber != null ? days.find((d) => d.dayNumber === plannedDayNumber) : undefined;
    const planned: PlannedSession | null = plannedDay
      ? { label: plannedDay.label, color: colorFor(plannedDay.label) }
      : null;
    return {
      date,
      weekday: WEEKDAY_LABELS[i],
      dayOfMonth: parseLocalDateString(date).getDate(),
      isToday: date === todayStr,
      logged,
      planned,
      label: logged[0]?.dayLabel ?? planned?.label ?? null,
      done: logged.length > 0,
    };
  });

  const openDay = openDate ? week.find((d) => d.date === openDate) : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative"
      data-testid="card-week-strip"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{header}</div>
        <Link
          href="/calendar"
          ref={calendarLinkRef}
          className="flex shrink-0 items-center gap-1 rounded-full bg-black/30 px-3 py-1.5 text-[12px] text-white/85 backdrop-blur-sm transition-colors hover:text-white"
          data-testid="link-week-strip-calendar"
        >
          Full month <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
        </Link>
      </div>

      {isLoading ? (
        <div className="h-[128px]" aria-hidden />
      ) : (
        <>
          {/* The week on a shallow arc, as in the reference: today is the
              ringed circle, a logged session fills its day, a planned one is
              outlined and a rest day is dashed. The edges sink and fade a
              little so the middle of the week reads as the front. */}
          <div className="relative mx-auto mt-4 h-[128px] max-w-[440px]" role="group" aria-label="This week">
            {week.map((day, i) => {
              const offset = i - 3;
              return (
                <button
                  key={day.date}
                  onClick={() => setOpenDate(day.date)}
                  // Said out loud for a screen reader: the fills and rings can't be heard.
                  aria-label={`${day.weekday} ${day.dayOfMonth}${day.label ? ` - ${day.label}${day.done ? ", done" : ""}` : " - rest day"}, open details`}
                  title={day.label ?? undefined}
                  className="absolute flex w-[52px] -translate-x-1/2 flex-col items-center gap-1.5"
                  style={{
                    left: `${((i + 0.5) / 7) * 100}%`,
                    top: 6 + 1.5 * offset * offset + (day.isToday ? 0 : 4),
                    opacity: 1 - 0.07 * Math.abs(offset),
                  }}
                  data-testid={`week-strip-day-${day.date}`}
                >
                  <span
                    className={`grid place-items-center rounded-full tabular-nums backdrop-blur-sm transition-colors ${
                      day.isToday
                        ? "h-12 w-12 bg-black/30 text-[15px] font-medium text-white outline outline-[1.5px] outline-offset-[3px] outline-white"
                        : "h-10 w-10 text-[13px]"
                    } ${
                      day.isToday
                        ? ""
                        : day.done
                        ? "border border-white/35 bg-white/[0.16] text-white"
                        : day.label
                        ? "border border-white/25 bg-white/[0.06] text-white/85"
                        : "border border-dashed border-white/20 text-white/50"
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                  <span className={`text-[12.5px] ${day.isToday ? "font-semibold text-white" : "text-white/60"}`}>
                    {day.weekday}
                  </span>
                  <span
                    className={`flex max-w-full items-center gap-0.5 truncate text-[10px] leading-none ${
                      day.done ? "text-white/80" : day.label ? "text-white/45" : "text-white/30"
                    }`}
                  >
                    {day.done && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />}
                    {day.label ? abbreviateLabel(day.label) : "Rest"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* A rotating cycle isn't pinned to weekdays, and the backend doesn't
              carry it forward yet, so name the sequence instead of guessing
              dates for it. */}
          {!isFixed && days.length > 0 && (
            <p className="mt-1 truncate text-center text-[11px] text-white/55" data-testid="week-strip-rotation">
              <span className="text-white/40">In order: </span>
              {days.map((d) => d.label).join(" → ")}
            </p>
          )}
        </>
      )}

      {openDay && (
        <DayDetailSheet
          date={openDay.date}
          sessions={openDay.logged}
          planned={openDay.planned}
          entry={weekLogs?.days.find((d) => d.date === openDay.date)}
          phase={isIndependent ? null : weekLogs?.shortTermPhase ?? null}
          weightUnit={weightUnit}
          colorFor={colorFor}
          onClose={() => setOpenDate(null)}
        />
      )}
    </motion.section>
  );
}
