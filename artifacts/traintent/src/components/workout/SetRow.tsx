import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { LOGGED_SET_BOUNDS } from "@/lib/fieldLimits";
import type { LoggedSet } from "@/lib/workoutSession";

export type SetField = "weight" | "reps" | "repsLeft" | "repsRight";

type SetRowProps = {
  set: LoggedSet;
  exIdx: number;
  setIdx: number;
  isUnilateral: boolean;
  gridCols: string;
  // The hint under the row - "Last time: 80 kg × 8". Null hides it.
  prevStr: string | null;
  onChange: (field: SetField, value: number) => void;
};

// One set's inputs. Sets are saved implicitly by typing - there is no confirm
// step - so this is only inputs and the PR trophy; the parent owns the maths.
export function SetRow({ set, exIdx, setIdx, isUnilateral, gridCols, prevStr, onChange }: SetRowProps) {
  return (
    <div>
      <motion.div
        layout
        className={`grid ${gridCols} gap-2 items-center py-1 rounded-lg transition-all ${
          set.isNewPr ? "bg-amber-500/8 -mx-1 px-1" : set.completed ? "opacity-55" : ""
        }`}
        data-testid={`set-row-${exIdx}-${setIdx}`}
      >
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground font-medium">{set.setNumber}</span>
          {set.isNewPr && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
              <Trophy className="w-3 h-3 text-amber-400" />
            </motion.div>
          )}
        </div>
        <input
          type="number"
          min={LOGGED_SET_BOUNDS.weight.min}
          max={LOGGED_SET_BOUNDS.weight.max}
          value={set.weight || ""}
          onChange={(e) => onChange("weight", parseFloat(e.target.value) || 0)}
          placeholder="0"
          className={`w-full px-2 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm text-center focus:outline-none transition-colors ${
            set.isNewPr ? "border-amber-500/40 focus:border-amber-400" : "border-border focus:border-primary"
          }`}
          data-testid={`input-weight-${exIdx}-${setIdx}`}
        />
        {isUnilateral ? (
          <>
            <input
              type="number"
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
      {prevStr && (
        <p className="text-[11px] text-muted-foreground/60 pl-8 mt-0.5" data-testid={`last-set-${exIdx}-${setIdx}`}>
          Last time: {prevStr}
        </p>
      )}
    </div>
  );
}
