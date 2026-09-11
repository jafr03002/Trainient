import { useState, type RefObject } from "react";
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
 * The tappable week under the dashboard's greeting card: seven days,
 * Monday-first, each carrying the session it belongs to. Completed sessions
 * read in `chart-2` green, the ones still ahead sit dimmed, and today is ringed
 * in `primary`. Tapping any day opens its detail - the numbers the old "This
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-4 rounded-xl bg-card border border-border"
      data-testid="card-week-strip"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">This week</h2>
        <Link
          href="/calendar"
          ref={calendarLinkRef}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          data-testid="link-week-strip-calendar"
        >
          Full month <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1">
            {week.map((day) => (
              <button
                key={day.date}
                onClick={() => setOpenDate(day.date)}
                // Pressable, and said out loud for a screen reader: the visual
                // cues (the press-down, the chevron hint below) can't be heard.
                aria-label={`${day.weekday} ${day.dayOfMonth}${day.label ? ` - ${day.label}` : " - rest day"}, open details`}
                title={day.label ?? undefined}
                className={`flex flex-col items-center gap-1 px-0.5 pt-1.5 pb-2 rounded-lg border transition-all active:scale-[0.96] ${
                  day.done
                    ? "border-chart-2/40 bg-chart-2/10 hover:bg-chart-2/15"
                    : day.label
                    ? "border-border bg-secondary/20 hover:bg-secondary/40"
                    : "border-border/50 bg-transparent hover:bg-secondary/20"
                } ${day.isToday ? "ring-1 ring-primary" : ""}`}
                data-testid={`week-strip-day-${day.date}`}
              >
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {day.weekday}
                </span>
                <span
                  className={`text-xs font-display font-semibold tabular-nums ${
                    day.isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {day.dayOfMonth}
                </span>
                {day.label ? (
                  <span
                    className={`flex items-center gap-0.5 text-[9px] leading-tight font-medium text-center break-words ${
                      day.done
                        ? "text-chart-2"
                        : // Still ahead: present but recessed, so the week reads
                          // as what has been done versus what is coming.
                          "text-muted-foreground/70"
                    }`}
                  >
                    {day.done && <Check className="w-2.5 h-2.5 shrink-0" />}
                    {abbreviateLabel(day.label)}
                  </span>
                ) : (
                  <span className="text-[9px] leading-tight text-muted-foreground/40">Rest</span>
                )}
                {/* The day's own colour, the one it wears on /program and
                    /calendar, kept as a hairline so the tile can still be read
                    as done / to come at a glance. */}
                <span
                  className="w-4 h-0.5 rounded-full"
                  style={{ background: day.label ? colorFor(day.label) : "transparent", opacity: day.done ? 1 : 0.45 }}
                />
              </button>
            ))}
          </div>

          {/* A rotating cycle isn't pinned to weekdays, and the backend doesn't
              carry it forward yet, so name the sequence instead of guessing
              dates for it. */}
          {!isFixed && days.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2.5" data-testid="week-strip-rotation">
              <span className="text-muted-foreground/60">In order: </span>
              {days.map((d) => d.label).join(" → ")}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/60 mt-2.5 text-center">Tap a day for its details</p>
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
    </motion.div>
  );
}
