import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";
import type { DailyLogWeekEntry, WorkoutLog } from "@workspace/api-client-react";
import { phaseSolid, phaseSoft } from "@/lib/phaseColors";
import { parseLocalDateString } from "@/lib/calibration";

export type PlannedSession = { label: string; color: string };

type DayDetailSheetProps = {
  date: string;
  // Sessions actually logged on this date, newest first.
  sessions: WorkoutLog[];
  // What the program has pencilled in for this date, when nothing was logged.
  planned: PlannedSession | null;
  entry: DailyLogWeekEntry | undefined;
  // AI mode only - the phase column the old weekly table used to carry.
  phase: string | null;
  weightUnit: string;
  colorFor: (label: string) => string;
  onClose: () => void;
};

function exerciseCount(session: WorkoutLog): number {
  return ((session.exercisesLogged as any[]) ?? []).filter(
    (ex) => ex?.kind === "checklist" || (Array.isArray(ex?.sets) && ex.sets.some((s: any) => s?.weight || s?.reps || s?.repsLeft || s?.repsRight)),
  ).length;
}

// A day's detail, opened by tapping it in the week strip. This is where the
// numbers from the old "This week" table live now - a table of four columns
// never fit a phone, and the week strip answers "what am I training" far more
// often than "how many steps did I take on Tuesday".
//
// A bottom sheet with a grab handle, following the calendar's DayAgendaSheet,
// except that it stays a sheet on a phone and becomes a centred card from md up
// (the dashboard has no wider surface to fall back to).
export function DayDetailSheet({
  date,
  sessions,
  planned,
  entry,
  phase,
  weightUnit,
  colorFor,
  onClose,
}: DayDetailSheetProps) {
  const parsed = parseLocalDateString(date);
  const dateLabel = parsed.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const stats: { label: string; value: string }[] = [
    { label: "Calories", value: entry?.calories != null ? entry.calories.toLocaleString() : "-" },
    { label: "Steps", value: entry?.steps != null ? entry.steps.toLocaleString() : "-" },
    {
      label: "Cardio",
      value: entry?.cardioType
        ? `${entry.cardioType}${entry.cardioMinutes != null ? ` · ${entry.cardioMinutes} min` : ""}`
        : "-",
    },
    { label: "Weight", value: entry?.weight != null ? `${entry.weight} ${weightUnit}` : "-" },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[55] flex items-end md:items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 w-full max-w-lg bg-card border border-border rounded-t-2xl md:rounded-2xl overflow-hidden"
          data-testid="week-day-sheet"
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0 md:hidden">
            <div className="w-10 h-1.5 rounded-full bg-border" />
          </div>
          <div className="px-5 pb-4 pt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-foreground text-base">{dateLabel}</span>
              <p className="text-sm text-muted-foreground mt-0.5">
                {sessions.length > 0
                  ? `${sessions.length} session${sessions.length === 1 ? "" : "s"} logged`
                  : planned
                  ? "Planned - not logged yet"
                  : "Rest day"}
              </p>
            </div>
            {phase && (
              <span
                className="text-[10px] px-2 py-1 rounded-full whitespace-nowrap capitalize shrink-0 font-medium"
                style={{ background: phaseSoft(phase), color: phaseSolid(phase) }}
              >
                {phase.replace(/_/g, " ")}
              </span>
            )}
          </div>

          <div className="px-5 space-y-2">
            {sessions.map((session) => {
              const label = session.dayLabel ?? "Workout";
              return (
                <Link
                  key={session.id}
                  href="/calendar"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-chart-2/30 bg-chart-2/5 text-left hover:bg-chart-2/10 transition-colors"
                  data-testid={`week-day-session-${session.id}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorFor(label) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground truncate">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {exerciseCount(session)} exercise{exerciseCount(session) === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Check className="w-4 h-4 text-chart-2 shrink-0" />
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
            {sessions.length === 0 && planned && (
              <div
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-border bg-secondary/20"
                data-testid="week-day-planned"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 opacity-60" style={{ background: planned.color }} />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground/80 truncate">{planned.label}</span>
                  <span className="block text-xs text-muted-foreground">On your program for this day</span>
                </span>
              </div>
            )}
          </div>

          <dl className="px-5 pb-6 pt-4 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-secondary/20 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
                <dd className="font-display font-semibold text-foreground tabular-nums mt-0.5 truncate">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
