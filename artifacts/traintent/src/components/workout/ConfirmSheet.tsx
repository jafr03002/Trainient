import { motion, AnimatePresence } from "framer-motion";

type ConfirmSheetProps = {
  open: boolean;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  // The confirm button's fill - primary for "finish", destructive for "discard".
  confirmClassName: string;
  cancelTestId: string;
  confirmTestId: string;
  onCancel: () => void;
  onConfirm: () => void;
};

// The logger's two-button confirmation: a bottom sheet on a phone, a centred
// card from md up. Tapping the scrim is the same as the cancel button.
export function ConfirmSheet({
  open,
  title,
  body,
  cancelLabel,
  confirmLabel,
  confirmClassName,
  cancelTestId,
  confirmTestId,
  onCancel,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22 }}
            className="relative z-10 w-full max-w-sm bg-card border border-border rounded-t-2xl md:rounded-2xl p-5 space-y-4"
          >
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{body}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl border border-border text-foreground font-medium hover:bg-secondary/30 transition-colors"
                data-testid={cancelTestId}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 h-11 rounded-xl font-semibold transition-colors ${confirmClassName}`}
                data-testid={confirmTestId}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
