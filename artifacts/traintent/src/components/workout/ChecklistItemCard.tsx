import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { CHECKLIST_ACCENT, categoryMeta, describeTarget } from "@/lib/checklistItems";
import type { LoggedExercise } from "@/lib/workoutSession";
import { ChecklistLogCard } from "@/components/ChecklistLogCard";

type ChecklistItemCardProps = {
  ex: LoggedExercise;
  exIdx: number;
  showTargets: boolean;
  onCompleteRound: () => void;
  onToggleRound: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
};

// A checklist item in the logger. Checklist items render in program order,
// inline among the exercise cards - a warmup item appears above the first lift
// because that is where it sits in the day.
export function ChecklistItemCard({
  ex,
  exIdx,
  showTargets,
  onCompleteRound,
  onToggleRound,
  onStart,
  onPause,
  onReset,
}: ChecklistItemCardProps) {
  const meta = categoryMeta(ex.category);
  const accent = meta?.token ?? CHECKLIST_ACCENT;
  const allDone = ex.completedRounds >= ex.targetRounds;
  const isRunning = ex.timerEndsAt != null;
  const timed = (ex.targetSeconds ?? 0) > 0 && ex.targetType === "duration";
  const remaining = isRunning
    ? Math.max(0, Math.ceil((ex.timerEndsAt! - Date.now()) / 1000))
    : ex.timerPausedRemaining ?? ex.targetSeconds ?? 0;
  const total = ex.targetSeconds ?? 0;
  // The countdown on a timed card is the control itself, not a target,
  // so it stays; this is only the "2:30" / "x 20" written next to the
  // item's name.
  const target = showTargets ? describeTarget(ex) : null;

  // A timed item gets the filling card with swipe-to-complete. Every
  // other checklist item keeps the tick, which is still the right
  // control when there is no duration to visualise.
  if (timed && !allDone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: exIdx * 0.06 }}
        data-testid={`log-checklist-${exIdx}`}
      >
        <ChecklistLogCard
          name={ex.name}
          accent={accent}
          label={meta ? meta.label : "Checklist"}
          completedRounds={ex.completedRounds}
          targetRounds={ex.targetRounds}
          remaining={remaining}
          total={total}
          isRunning={isRunning}
          isPaused={ex.timerPausedRemaining != null}
          onCompleteRound={onCompleteRound}
          onStart={onStart}
          onPause={onPause}
          onReset={onReset}
          testId={`checklist-${exIdx}`}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: exIdx * 0.06 }}
      // Same neutral card fill as an exercise card; the accent border,
      // icon and timer carry the distinction without a colour wash.
      className="rounded-xl overflow-hidden border bg-card"
      style={{ borderColor: `color-mix(in srgb, ${accent} 32%, transparent)` }}
      data-testid={`log-checklist-${exIdx}`}
    >
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={onToggleRound}
          aria-pressed={allDone}
          // An untouched tick renders no text, so without an explicit
          // label this button reaches a screen reader unnamed.
          aria-label={
            allDone
              ? `${ex.name} — done, tap to clear`
              : `${ex.name} — mark round ${Math.min(ex.completedRounds + 1, ex.targetRounds)} of ${ex.targetRounds} done`
          }
          className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
            allDone
              ? "bg-chart-2/15 border-chart-2/50 text-chart-2"
              : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
          title={allDone ? "Mark as not done" : "Mark a round done"}
          data-testid={`checklist-tick-${exIdx}`}
        >
          {allDone ? (
            <Check className="w-4 h-4" />
          ) : ex.completedRounds > 0 ? (
            <span className="text-[11px] font-display font-bold tabular-nums">
              {ex.completedRounds}/{ex.targetRounds}
            </span>
          ) : null}
        </button>

        <div className="flex-1 min-w-0">
          <h3
            className={`font-semibold text-foreground truncate ${allDone ? "opacity-55 line-through" : ""}`}
          >
            {ex.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            <span className="font-medium" style={{ color: accent }}>
              {meta ? meta.label : "Checklist"}
            </span>
            {ex.targetRounds > 1 && (
              <> · round {Math.min(ex.completedRounds + 1, ex.targetRounds)} of {ex.targetRounds}</>
            )}
            {target && ex.targetRounds === 1 && <> · {target}</>}
          </p>
        </div>

        {!timed && target && (
          <span className="font-display font-semibold text-[15px] text-foreground whitespace-nowrap shrink-0">
            {target}
          </span>
        )}
      </div>
    </motion.div>
  );
}
