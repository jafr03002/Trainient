import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  format,
  getDate,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfToday,
} from "date-fns";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import type { Program } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { phaseSolid, phaseSoft } from "@/lib/phaseColors";

type Cell = { date: Date | null };

// Mon-first month grid, padded to full weeks - same layout convention as
// pages/calendar.tsx, but each cell here is a real button (this calendar is
// a date picker, not a read-only display).
function monthCells(month: Date): Cell[] {
  const monthStart = startOfMonth(month);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const startPadding = (getDay(monthStart) + 6) % 7;
  const totalCells = Math.ceil((startPadding + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startPadding + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return { date: null };
    return { date: new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNum) };
  });
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CommitmentScreen({
  program,
  onConfirm,
}: {
  program: Program;
  onConfirm: (startDate: Date) => void;
}) {
  const today = useMemo(() => startOfToday(), []);
  const rangeEnd = useMemo(() => addDays(today, 30), [today]);
  const firstMonth = useMemo(() => startOfMonth(today), [today]);
  const lastMonth = useMemo(() => startOfMonth(rangeEnd), [rangeEnd]);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMonth, setViewMonth] = useState<Date>(firstMonth);

  const firstSession = program.days[0];
  const isToday = isSameDay(selectedDate, today);
  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);
  const canGoPrev = !isSameMonth(viewMonth, firstMonth);
  const canGoNext = !isSameMonth(viewMonth, lastMonth);

  return (
    <div className="w-full max-w-lg mx-auto" data-testid="commitment-screen">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div
          className="text-xs font-semibold tracking-wider uppercase mb-2"
          style={{ color: phaseSolid("calibration") }}
        >
          Starting phase
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-6">Time to put in the work</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="p-4 rounded-xl border mb-3"
        style={{ backgroundColor: phaseSoft("calibration"), borderColor: phaseSoft("calibration") }}
      >
        <div className="flex items-start gap-2.5">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: phaseSolid("calibration") }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Calibration phase</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              First, the calibration phase — taking it slow while we dial in your training and see how you respond. Everything after builds from what we learn here.
            </p>
          </div>
        </div>
      </motion.div>

      {firstSession && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-xl bg-primary/5 border border-primary/15 mb-8"
        >
          <div className="flex items-start gap-2.5">
            <Dumbbell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Your first session</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {firstSession.label}: {firstSession.focus}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <p className="text-sm font-medium text-foreground mb-1">When do you want to start?</p>
        <p className="text-xs text-muted-foreground mb-4">Tap a day below to set your start date.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-4 rounded-xl bg-card border border-border mb-2"
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-sm font-semibold text-foreground">{format(viewMonth, "MMMM yyyy")}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-muted-foreground/70 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map(({ date }, i) => {
            if (!date) return <div key={i} />;

            const disabled = isBefore(date, today) || isAfter(date, rangeEnd);
            const selected = isSameDay(date, selectedDate);
            const isTodayCell = isSameDay(date, today);

            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "min-h-13 rounded-xl border text-sm flex flex-col items-center justify-center gap-0.5 transition-colors",
                  disabled && "border-transparent text-muted-foreground/30 cursor-not-allowed",
                  !disabled && selected && "bg-primary border-primary text-primary-foreground font-semibold",
                  !disabled && !selected && isTodayCell && "border-primary/60 bg-primary/10 text-primary font-medium",
                  !disabled && !selected && !isTodayCell && "border-border/40 bg-card/50 text-foreground hover:bg-secondary/60",
                )}
              >
                <span className="leading-none">{getDate(date)}</span>
                {isTodayCell && (
                  <span className="text-[8px] font-semibold uppercase leading-none opacity-70">today</span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      <p className="text-xs text-muted-foreground text-center mb-6">
        Any highlighted day is fair game — up to 30 days out.
      </p>

      <Button
        className="w-full h-12 text-sm font-semibold"
        onClick={() => onConfirm(selectedDate)}
        data-testid="button-commitment-confirm"
      >
        {isToday ? "Start today" : `Start on ${format(selectedDate, "EEE, MMM d")}`}
      </Button>
    </div>
  );
}
