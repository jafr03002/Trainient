import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import intentSun from "@/assets/intent-sun.png";

type CalibrationFinishSheetProps = {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  // The note is null for "Finish without a note". Both paths save the session.
  onFinish: (note: string | null) => void;
};

// "Good job" + a free-form note, shown when a calibration session is finished.
// The note goes into workout_logs.notes, next to the exercise notes - together
// they're what the coach reads at the calibration review. Same sheet chrome as
// ConfirmSheet; tapping the scrim goes back to the session.
export function CalibrationFinishSheet({ open, saving, onCancel, onFinish }: CalibrationFinishSheetProps) {
  const [note, setNote] = useState("");

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={saving ? undefined : onCancel}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22 }}
            className="relative z-10 w-full max-w-sm rounded-t-[30px] bg-card px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 md:rounded-[30px] md:pb-5"
            data-testid="calibration-finish-sheet"
          >
            <div aria-hidden className="mx-auto h-[5px] w-9 rounded-full bg-accent md:hidden" />
            <img src={intentSun} alt="" className="mx-auto mt-5 h-10 w-10 object-contain" />
            <h3 className="mt-4 text-center text-2xl font-light tracking-[-0.01em] text-foreground">Good job</h3>
            <p className="mt-1.5 text-center text-[13.5px] leading-relaxed text-muted-foreground">
              Anything on your mind about this session?
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Write anything: the gym was busy, the session ran long, a machine was missing..."
              className="mt-4 w-full resize-none rounded-[20px] border border-transparent bg-secondary px-3.5 py-3 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/35 focus:outline-none"
              data-testid="textarea-calibration-note"
            />
            <p className="mt-2 text-[11.5px] text-muted-foreground">Your coach reads this at your calibration review.</p>
            <button
              onClick={() => onFinish(note.trim() || null)}
              disabled={saving}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-calibration-save-finish"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save and finish
            </button>
            <button
              onClick={() => onFinish(null)}
              disabled={saving}
              className="mt-2 h-10 w-full text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              data-testid="button-calibration-finish-no-note"
            >
              Finish without a note
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
