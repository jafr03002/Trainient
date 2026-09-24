import type { ReactNode } from "react";
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

// The number inputs are deliberately boxless - big light digits, like the stats
// band on the program page's hero. An empty one shows a dim dash, and focus
// draws an underline so it is still clear where typing lands.
const INPUT_CLASS =
  "w-full min-w-0 bg-transparent p-0 border-0 border-b border-transparent text-[26px] font-light tracking-[-0.02em] tabular-nums text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/50 transition-colors";

// One column of the band: the input over its caps label, split from the column
// before it by a hairline.
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center border-l border-border pl-3.5">
      {children}
      <span className="mt-px text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
    </div>
  );
}

// One set's inputs. Sets are saved implicitly by typing - there is no confirm
// step - so this is only inputs and the PR trophy; the parent owns the maths.
export function SetRow({ set, exIdx, setIdx, isUnilateral, weightUnit, prevStr, target, onChange }: SetRowProps) {
  return (
    <div
      className={`border-t border-border px-5 pb-3 pt-2.5 ${
        set.isNewPr ? "bg-[linear-gradient(90deg,hsl(var(--sessions-cyan)/0.06),transparent_70%)]" : ""
      }`}
    >
      <motion.div layout className="flex items-stretch" data-testid={`set-row-${exIdx}-${setIdx}`}>
        <div className="flex w-[52px] shrink-0 flex-col justify-center">
          {/* The number goes from muted to white once the set has a weight and
              reps - Sessions marks "done" with white, not with a colour. */}
          <div
            className={`flex items-center gap-1 text-2xl font-light tabular-nums transition-colors ${
              set.completed ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {set.setNumber}
            {set.isNewPr && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <Trophy className="h-3 w-3 text-[hsl(var(--sessions-cyan))]" strokeWidth={1.6} />
              </motion.span>
            )}
          </div>
          <span className="mt-px text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Set</span>
        </div>
        <Cell label={weightUnit}>
          <input
            type="number"
            // Decimal keypad rather than the full keyboard: 82.5 kg between sets
            // has to be one-handed.
            inputMode="decimal"
            min={LOGGED_SET_BOUNDS.weight.min}
            max={LOGGED_SET_BOUNDS.weight.max}
            value={set.weight || ""}
            onChange={(e) => onChange("weight", parseFloat(e.target.value) || 0)}
            placeholder="–"
            aria-label={`Set ${set.setNumber} weight`}
            className={INPUT_CLASS}
            data-testid={`input-weight-${exIdx}-${setIdx}`}
          />
        </Cell>
        {isUnilateral ? (
          <>
            <Cell label="Reps L">
              <input
                type="number"
                inputMode="numeric"
                min={LOGGED_SET_BOUNDS.reps.min}
                max={LOGGED_SET_BOUNDS.reps.max}
                value={set.repsLeft || ""}
                onChange={(e) => onChange("repsLeft", parseInt(e.target.value) || 0)}
                placeholder="–"
                aria-label={`Set ${set.setNumber} reps, left`}
                className={INPUT_CLASS}
                data-testid={`input-reps-left-${exIdx}-${setIdx}`}
              />
            </Cell>
            <Cell label="Reps R">
              <input
                type="number"
                inputMode="numeric"
                min={LOGGED_SET_BOUNDS.reps.min}
                max={LOGGED_SET_BOUNDS.reps.max}
                value={set.repsRight || ""}
                onChange={(e) => onChange("repsRight", parseInt(e.target.value) || 0)}
                placeholder="–"
                aria-label={`Set ${set.setNumber} reps, right`}
                className={INPUT_CLASS}
                data-testid={`input-reps-right-${exIdx}-${setIdx}`}
              />
            </Cell>
          </>
        ) : (
          <Cell label="Reps">
            <input
              type="number"
              inputMode="numeric"
              min={LOGGED_SET_BOUNDS.reps.min}
              max={LOGGED_SET_BOUNDS.reps.max}
              value={set.reps || ""}
              onChange={(e) => onChange("reps", parseInt(e.target.value) || 0)}
              placeholder="–"
              aria-label={`Set ${set.setNumber} reps`}
              className={INPUT_CLASS}
              data-testid={`input-reps-${exIdx}-${setIdx}`}
            />
          </Cell>
        )}
      </motion.div>
      {target ? (
        <p
          className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground"
          title={prevStr ? `Last time: ${prevStr}` : undefined}
          data-testid={`set-target-${exIdx}-${setIdx}`}
        >
          <span>Target</span>
          <span className="font-medium normal-case tracking-[0.02em] text-foreground tabular-nums">
            {target.weight} {weightUnit} × {target.reps}
            {isUnilateral ? " / side" : ""}
          </span>
          {/* What moved since last time, so the number reads as reasoning
              rather than as a figure the app made up. A PR on this set takes
              its place - beating the target is the bigger news. */}
          {set.isNewPr ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--sessions-cyan)/0.1)] px-[7px] py-0.5 font-medium normal-case tracking-normal text-[hsl(var(--sessions-cyan))]">
              <Trophy className="h-3 w-3" strokeWidth={1.6} />
              PR
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-[7px] py-0.5 font-medium normal-case tracking-normal text-foreground">
              {target.delta}
            </span>
          )}
        </p>
      ) : prevStr ? (
        <p
          className="mt-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground"
          data-testid={`last-set-${exIdx}-${setIdx}`}
        >
          Last time <span className="font-medium normal-case tracking-[0.02em] text-foreground">{prevStr}</span>
        </p>
      ) : null}
    </div>
  );
}
