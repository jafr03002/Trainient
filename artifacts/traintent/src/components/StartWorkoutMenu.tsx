import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

type MenuDay = {
  dayNumber: number;
  label: string;
  focus: string;
  exercises: { kind?: string | null; sets?: number | null }[];
};

/**
 * The tab bar's workout picker: what Start opens when no session is running.
 * A Sessions inset grouped list that springs up out of the Start disc, over a
 * scrim that dims the page but stops under the tab bar (the bar sits at z-50,
 * the scrim at z-40), so the bar stays sharp and Start - now a close button -
 * stays usable. It lists the program's days and nothing else; picking one is
 * the deliberate press that starts a session (the caller runs startSession).
 */
export function StartWorkoutMenu({
  days,
  onPick,
  onClose,
}: {
  days: MenuDay[];
  onPick: (dayNumber: number) => void;
  onClose: () => void;
}) {
  const firstRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRowRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        aria-hidden
        className="md:hidden fixed inset-0 z-40 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <div className="md:hidden pointer-events-none fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Start a workout"
          className="pointer-events-auto w-full max-w-[18rem] max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-[26px] bg-card"
          style={{ transformOrigin: "bottom center" }}
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 12 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="px-5 pb-2.5 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Start a workout
          </p>
          {days.map((day, i) => {
            // Lifting volume only, as on the program page: a checklist item's
            // `sets` is a round count (a stretch hold), not a set.
            const lifts = day.exercises.filter((ex) => ex.kind !== "checklist");
            const sets = lifts.reduce((sum, ex) => sum + (ex.sets || 0), 0);
            return (
              <button
                key={day.dayNumber}
                ref={i === 0 ? firstRowRef : undefined}
                type="button"
                onClick={() => onPick(day.dayNumber)}
                className="flex w-full items-center pl-5 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none active:bg-secondary"
                data-testid={`start-menu-day-${day.dayNumber}`}
              >
                <span className="min-w-0 flex-1 border-t border-border py-[13px] pr-5">
                  {/* The label ("Upper A") names the workout; `focus` is a
                      muscle list that two days can share, so it can't. */}
                  <span className="block truncate text-[15px] font-normal text-foreground">{day.label || day.focus}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {lifts.length} {lifts.length === 1 ? "exercise" : "exercises"} · {sets} {sets === 1 ? "set" : "sets"}
                  </span>
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>
    </>
  );
}
