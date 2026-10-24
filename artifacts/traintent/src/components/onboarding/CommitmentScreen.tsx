import { useMemo, useState, type ReactNode } from "react";
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
  nextMonday,
  startOfMonth,
  startOfToday,
} from "date-fns";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Program } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { LetterDock, LetterWash, PageHead } from "@/components/onboarding/letter";

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

// Most people start today, tomorrow or at the top of next week, so those are
// one tap. "Another day" opens the month grid for the rest of the 30-day window.
function quickPicks(today: Date) {
  const picks = [
    { key: "today", title: "Today", date: today },
    { key: "tomorrow", title: "Tomorrow", date: addDays(today, 1) },
  ];
  const monday = nextMonday(today);
  if (!picks.some((p) => isSameDay(p.date, monday))) {
    picks.push({ key: "monday", title: "Monday", date: monday });
  }
  return picks;
}

function OptionCard({
  selected,
  title,
  subtitle,
  onClick,
  trailing,
  testId,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
  trailing?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl px-5 py-4 text-left transition-colors",
        selected ? "bg-white text-black" : "bg-card text-foreground",
      )}
      data-testid={testId}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-normal">{title}</span>
        <span className={cn("mt-0.5 block text-[12.5px]", selected ? "text-black/60" : "text-muted-foreground")}>{subtitle}</span>
      </span>
      {selected ? <Check className="h-4 w-4 shrink-0" strokeWidth={2} /> : trailing}
    </button>
  );
}

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
  const picks = useMemo(() => quickPicks(today), [today]);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [pickingOther, setPickingOther] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(firstMonth);

  const firstSession = program.days[0];
  const isToday = isSameDay(selectedDate, today);
  const isQuickPick = picks.some((p) => isSameDay(p.date, selectedDate));
  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);
  const canGoPrev = !isSameMonth(viewMonth, firstMonth);
  const canGoNext = !isSameMonth(viewMonth, lastMonth);

  return (
    <div className="relative min-h-page w-full bg-background text-foreground" data-testid="commitment-screen">
      <LetterWash bookend={false} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mx-auto max-w-lg px-6 pb-44 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))]"
      >
        <PageHead title="Start day">
          {firstSession ? (
            <>Your first session is <b>{firstSession.label}</b>, <b>{firstSession.focus.toLowerCase()}</b>.</>
          ) : (
            <>Pick the day you <b>start training</b>.</>
          )}
        </PageHead>

        <div className="mt-7 space-y-2.5">
          {picks.map((p) => (
            <OptionCard
              key={p.key}
              selected={isSameDay(selectedDate, p.date)}
              title={p.title}
              subtitle={p.key === "monday" ? `${format(p.date, "d MMM")} · the start of a fresh week` : format(p.date, "EEEE d MMM")}
              onClick={() => { setSelectedDate(p.date); setPickingOther(false); }}
              testId={`start-${p.key}`}
            />
          ))}
          <OptionCard
            selected={!isQuickPick}
            title="Another day"
            subtitle={isQuickPick ? "Up to 30 days out" : format(selectedDate, "EEEE d MMM")}
            onClick={() => setPickingOther((o) => !o)}
            trailing={<ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", pickingOther && "rotate-90")} />}
            testId="start-other"
          />
        </div>

        {pickingOther && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[17px] font-light">{format(viewMonth, "MMMM yyyy")}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="pb-1 text-center text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  {d}
                </div>
              ))}
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
                    aria-pressed={selected}
                    aria-label={format(date, "EEEE d MMMM")}
                    className="flex flex-col items-center gap-1 py-0.5 disabled:cursor-not-allowed"
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-full text-[15px] font-light transition-colors",
                        disabled && "text-muted-foreground/30",
                        !disabled && selected && "bg-white font-normal text-black",
                        !disabled && !selected && "text-foreground hover:bg-secondary",
                      )}
                    >
                      {getDate(date)}
                    </span>
                    <span className={cn("h-1 w-1 rounded-full", isTodayCell ? "bg-white" : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>

      <LetterDock
        label={isToday ? "Start today" : `Start ${format(selectedDate, "EEE d MMM")}`}
        onNext={() => onConfirm(selectedDate)}
        nextTestId="button-commitment-confirm"
      />
    </div>
  );
}
