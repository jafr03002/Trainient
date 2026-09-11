import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { LOGGED_SET_BOUNDS } from "@/lib/fieldLimits";
import type { LoggedSet } from "@/lib/workoutSession";
import type { SetTarget } from "@/lib/trainingTargets";

export type SetField = "weight" | "reps" | "repsLeft" | "repsRight";

type SetRowProps = {
  set: LoggedSet;
  exIdx: number;
  setIdx: number;
  isUnilateral: boolean;
  gridCols: string;
  weightUnit: string;
  // The hint under the row - "Last time: 80 kg × 8". Null hides it.
  prevStr: string | null;
  // AI mode's forward-looking target, worked out from that same previous set.
  // When present it replaces the "last time" line: the number to beat is more
  // use mid-set than the number already beaten, and last time's figures are
  // still one tap (or hover) away on the line's title.
  target: SetTarget | null;
  onChange: (field: SetField, value: number) => void;
};

// One set's inputs. Sets are saved implicitly by typing - there is no confirm
// step - so this is only inputs and the PR trophy; the parent owns the maths.
export function SetRow({ set, exIdx, setIdx, isUnilateral, gridCols, weightUnit, prevStr, target, onChange }: SetRowProps) {
  return (
    <div>
      <motion.div
        layout
        className={`grid ${gridCols} gap-2 items-center py-1 rounded-lg transition-all ${
          set.isNewPr ? "bg-chart-3/10 -mx-1 px-1" : set.completed ? "opacity-55" : ""
        }`}
        data-testid={`set-row-${exIdx}-${setIdx}`}
      >
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground font-medium">{set.setNumber}</span>
          {set.isNewPr && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
              <Trophy className="w-3 h-3 text-chart-3" />
            </motion.div>
          )}
        </div>
        <input
          type="number"
          // Decimal keypad rather than the full keyboard: 82.5 kg between sets
          // has to be one-handed.
          inputMode="decimal"
          min={LOGGED_SET_BOUNDS.weight.min}
          max={LOGGED_SET_BOUNDS.weight.max}
          value={set.weight || ""}
          onChange={(e) => onChange("weight", parseFloat(e.target.value) || 0)}
          placeholder="0"
          className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none transition-colors ${
            set.isNewPr ? "border-chart-3/40 focus:border-chart-3" : "border-border focus:border-primary"
          }`}
          data-testid={`input-weight-${exIdx}-${setIdx}`}
        />
        {isUnilateral ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={LOGGED_SET_BOUNDS.reps.min}
              max={LOGGED_SET_BOUNDS.reps.max}
              value={set.repsLeft || ""}
              onChange={(e) => onChange("repsLeft", parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
              data-testid={`input-reps-left-${exIdx}-${setIdx}`}
            />
            <input
              type="number"
              inputMode="numeric"
              min={LOGGED_SET_BOUNDS.reps.min}
              max={LOGGED_SET_BOUNDS.reps.max}
              value={set.repsRight || ""}
              onChange={(e) => onChange("repsRight", parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
              data-testid={`input-reps-right-${exIdx}-${setIdx}`}
            />
          </>
        ) : (
          <input
            type="number"
            inputMode="numeric"
            min={LOGGED_SET_BOUNDS.reps.min}
            max={LOGGED_SET_BOUNDS.reps.max}
            value={set.reps || ""}
            onChange={(e) => onChange("reps", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-2 py-1.5 rounded-lg border border-border bg-secondary/20 text-foreground text-sm text-center focus:outline-none focus:border-primary"
            data-testid={`input-reps-${exIdx}-${setIdx}`}
          />
        )}
      </motion.div>
      {target ? (
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] pl-8 mt-0.5"
          title={prevStr ? `Last time: ${prevStr}` : undefined}
          data-testid={`set-target-${exIdx}-${setIdx}`}
        >
          <span className="text-muted-foreground/60">Target</span>
          <span className="font-display font-semibold text-foreground tabular-nums">
            {target.weight} {weightUnit} × {target.reps}
            {isUnilateral ? " / side" : ""}
          </span>
          {/* What moved since last time, so the number reads as reasoning
              rather than as a figure the app made up. */}
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
            {target.delta}
          </span>
        </p>
      ) : prevStr ? (
        <p className="text-[11px] text-muted-foreground/60 pl-8 mt-0.5" data-testid={`last-set-${exIdx}-${setIdx}`}>
          Last time: {prevStr}
        </p>
      ) : null}
    </div>
  );
}
