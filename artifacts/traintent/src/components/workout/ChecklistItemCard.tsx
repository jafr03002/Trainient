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
      // Same card as an exercise. The category colour only tints the small
      // label below the name - Sessions keeps colour to small signals.
      className="overflow-hidden rounded-[26px] bg-card"
      data-testid={`log-checklist-${exIdx}`}
    >
      <div className="flex items-center gap-3 py-3.5 pl-4 pr-5">
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
          // Done is white with a black tick - the Sessions "selected" state.
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            allDone ? "bg-white text-black" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title={allDone ? "Mark as not done" : "Mark a round done"}
          data-testid={`checklist-tick-${exIdx}`}
        >
          {allDone ? (
            <Check className="w-4 h-4" strokeWidth={2} />
          ) : ex.completedRounds > 0 ? (
            <span className="text-[11px] font-medium tabular-nums">
              {ex.completedRounds}/{ex.targetRounds}
            </span>
          ) : null}
        </button>

        <div className="flex-1 min-w-0">
          <h3
            className={`truncate text-[15px] font-normal ${allDone ? "text-muted-foreground line-through" : "text-foreground"}`}
          >
            {ex.name}
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
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
          <span className="shrink-0 whitespace-nowrap text-[15px] text-muted-foreground">
            {target}
          </span>
        )}
      </div>
    </motion.div>
  );
}
