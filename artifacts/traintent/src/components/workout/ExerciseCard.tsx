import type { RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, ChevronDown, HelpCircle } from "lucide-react";
import type { LoggedExercise } from "@/lib/workoutSession";
import { formatPrevSet, formatShortDate, type LastNote } from "@/lib/sessionLogs";
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
  prevSets: any[] | undefined;
  prevNote: LastNote | undefined;
  tourRefs?: ExerciseCardTourRefs;
  onHelp: () => void;
  onUpdateSet: (setIdx: number, field: SetField, value: number) => void;
  onUpdateNotes: (notes: string) => void;
  onToggleNotes: () => void;
};

// A lift's card in the logger: header, the set rows, last session's note and
// this session's note.
export function ExerciseCard({
  ex,
  exIdx,
  weightUnit,
  showTargets,
  showHelp,
  prevSets,
  prevNote,
  tourRefs,
  onHelp,
  onUpdateSet,
  onUpdateNotes,
  onToggleNotes,
}: ExerciseCardProps) {
  const prevNoteDate = formatShortDate(prevNote?.date ?? null);
  const gridCols = ex.isUnilateral ? "grid-cols-[2rem_1fr_1fr_1fr]" : "grid-cols-[2rem_1fr_1fr]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: exIdx * 0.06 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
      data-testid={`log-exercise-${exIdx}`}
    >
      <div
        ref={tourRefs?.head}
        className="p-4 border-b border-border/50 flex items-start justify-between gap-2"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
              {ex.muscle}
            </span>
            {ex.isUnilateral && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Unilateral</span>
            )}
          </div>
          <h3 className="font-semibold text-foreground mt-1">{ex.name}</h3>
          {showTargets && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Target: {ex.targetSets} × {ex.targetReps}
            </p>
          )}
        </div>
        {showHelp && (
          <button
            ref={tourRefs?.help}
            onClick={onHelp}
            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            title="How to perform this exercise"
            data-testid={`button-exercise-help-${exIdx}`}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-4" ref={tourRefs?.setsBlock}>
        {/* Column headers */}
        {ex.isUnilateral ? (
          <div className={`grid ${gridCols} gap-2 mb-2 text-xs text-muted-foreground font-medium`}>
            <span>Set</span>
            <span>Weight</span>
            <span>Reps (L)</span>
            <span>Reps (R)</span>
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-2 mb-2 text-xs text-muted-foreground font-medium`}>
            <span>Set</span>
            <span>Weight</span>
            <span>Reps</span>
          </div>
        )}

        <div className="space-y-2">
          {ex.sets.map((set, setIdx) => (
            <SetRow
              key={set.setNumber}
              set={set}
              exIdx={exIdx}
              setIdx={setIdx}
              isUnilateral={ex.isUnilateral}
              gridCols={gridCols}
              prevStr={formatPrevSet(prevSets?.[setIdx], weightUnit, ex.isUnilateral)}
              onChange={(field, value) => onUpdateSet(setIdx, field, value)}
            />
          ))}
        </div>

        {/* The note left on this exercise last time, carried forward and
            parked directly under the set rows. Deliberately quiet - it is
            a reminder, not a heading - and dated so it never reads as
            something typed in this session. It does NOT depend on a
            matching "Last time" line: when the program's set count has
            since changed there is no hint on the final row, and the note
            used to vanish with it. */}
        {prevNote && (
          <p
            className="mt-2 pl-8 text-[11px] leading-snug text-muted-foreground/70"
            data-testid={`last-note-${exIdx}`}
          >
            <span className="text-muted-foreground/50">
              Last session{prevNoteDate ? ` · ${prevNoteDate}` : ""}:{" "}
            </span>
            {prevNote.text}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center justify-end mt-3">
          <button
            onClick={onToggleNotes}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              ex.notes
                ? "text-primary"
                : ex.showNotes
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-toggle-notes-${exIdx}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {/* With last session's note sitting right above, a bare "Add
                note" reads as if that one were already the entry for
                today. "Add a new note" says the old one is history. */}
            {ex.notes ? "Note saved" : prevNote ? "Add a new note" : "Add note"}
            <ChevronDown className={`w-3 h-3 transition-transform ${ex.showNotes ? "rotate-180" : ""}`} />
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
                className="w-full mt-3 px-3 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                data-testid={`textarea-notes-${exIdx}`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
