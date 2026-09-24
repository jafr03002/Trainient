import type { RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, ChevronDown, HelpCircle } from "lucide-react";
import type { LoggedExercise } from "@/lib/workoutSession";
import { formatPrevSet, formatShortDate, type LastNote } from "@/lib/sessionLogs";
import { targetFromPreviousSet } from "@/lib/trainingTargets";
import { SetRow, type SetField } from "@/components/workout/SetRow";

// Refs the log page's coachmark tour hangs off. Only the first lift card gets
// them - see the note on `firstLiftIdx` in log.tsx.
export type ExerciseCardTourRefs = {
  head: RefObject<HTMLDivElement | null>;
  help: RefObject<HTMLButtonElement | null>;
  setsBlock: RefObject<HTMLDivElement | null>;
};

type ExerciseCardProps = {
  ex: LoggedExercise;
  exIdx: number;
  weightUnit: string;
  showTargets: boolean;
  // Independent mode hides the "how to perform" help - the program is the
  // user's own, not the coach's.
  showHelp: boolean;
  // AI mode only: turn each "last time" hint into the target to beat. In
  // Independent mode nobody asked the app to program for them, so the plain
  // "last time" line stays.
  showProgressionTargets: boolean;
  prevSets: any[] | undefined;
  prevNote: LastNote | undefined;
  tourRefs?: ExerciseCardTourRefs;
  onHelp: () => void;
  onUpdateSet: (setIdx: number, field: SetField, value: number) => void;
  onUpdateNotes: (notes: string) => void;
  onToggleNotes: () => void;
};

// A lift's card in the logger: header, the set rows, last session's note and
// this session's note. Sessions style - one soft card, the sets split by
// hairlines (see TrainientAppDesign.md).
export function ExerciseCard({
  ex,
  exIdx,
  weightUnit,
  showTargets,
  showHelp,
  showProgressionTargets,
  prevSets,
  prevNote,
  tourRefs,
  onHelp,
  onUpdateSet,
  onUpdateNotes,
  onToggleNotes,
}: ExerciseCardProps) {
  const prevNoteDate = formatShortDate(prevNote?.date ?? null);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: exIdx * 0.06 }}
      className="overflow-hidden rounded-[26px] bg-card"
      data-testid={`log-exercise-${exIdx}`}
    >
      <div ref={tourRefs?.head} className="px-5 pb-3.5 pt-[18px]">
        <div className="flex items-center justify-between gap-2.5">
          <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {ex.muscle}
            {ex.isUnilateral && " · Unilateral"}
            {showTargets && ` · ${ex.targetSets} × ${ex.targetReps}`}
          </span>
          {showHelp && (
            <button
              ref={tourRefs?.help}
              onClick={onHelp}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="How to perform this exercise"
              aria-label={`How to perform ${ex.name}`}
              data-testid={`button-exercise-help-${exIdx}`}
            >
              <HelpCircle className="h-3 w-3" strokeWidth={1.6} />
              How to
            </button>
          )}
        </div>
        <h3 className="mt-1 truncate text-[22px] font-light tracking-[-0.015em] text-foreground">{ex.name}</h3>
      </div>

      {/* Each set labels its own columns, so there is no header row - the
          tour's "weight and reps" step rings this whole block. */}
      <div ref={tourRefs?.setsBlock}>
        <div>
          {ex.sets.map((set, setIdx) => (
            <SetRow
              key={set.setNumber}
              set={set}
              exIdx={exIdx}
              setIdx={setIdx}
              isUnilateral={ex.isUnilateral}
              weightUnit={weightUnit}
              prevStr={formatPrevSet(prevSets?.[setIdx], weightUnit, ex.isUnilateral)}
              target={
                showProgressionTargets
                  ? targetFromPreviousSet(prevSets?.[setIdx], {
                      name: ex.name,
                      targetReps: ex.targetReps,
                      weightUnit,
                    })
                  : null
              }
              onChange={(field, value) => onUpdateSet(setIdx, field, value)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border px-5 pb-3.5 pt-3">
        {/* The note left on this exercise last time, carried forward and
            parked directly under the set rows. Deliberately quiet - it is
            a reminder, not a heading - and dated so it never reads as
            something typed in this session. It does NOT depend on a
            matching "Last time" line: when the program's set count has
            since changed there is no hint on the final row, and the note
            used to vanish with it. */}
        {prevNote && (
          <p
            className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground"
            data-testid={`last-note-${exIdx}`}
          >
            <span className="text-muted-foreground/60">
              Last session{prevNoteDate ? ` · ${prevNoteDate}` : ""}:{" "}
            </span>
            {prevNote.text}
          </p>
        )}

        <div className="flex items-center">
          <button
            onClick={onToggleNotes}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[12.5px] transition-colors hover:bg-accent ${
              ex.notes || ex.showNotes ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-toggle-notes-${exIdx}`}
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.6} />
            {/* With last session's note sitting right above, a bare "Add
                note" reads as if that one were already the entry for
                today. "Add a new note" says the old one is history. */}
            {ex.notes ? "Note saved" : prevNote ? "Add a new note" : "Add note"}
            <ChevronDown className={`w-3 h-3 transition-transform ${ex.showNotes ? "rotate-180" : ""}`} strokeWidth={1.6} />
          </button>
        </div>

        {/* Notes textarea */}
        <AnimatePresence>
          {ex.showNotes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <textarea
                value={ex.notes}
                onChange={(e) => onUpdateNotes(e.target.value)}
                placeholder="How did this feel? e.g. felt strong, elbow pain, grip gave out..."
                rows={2}
                autoFocus
                className="mt-2.5 w-full resize-none rounded-[20px] border border-transparent bg-secondary px-3.5 py-3 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/35 focus:outline-none"
                data-testid={`textarea-notes-${exIdx}`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
