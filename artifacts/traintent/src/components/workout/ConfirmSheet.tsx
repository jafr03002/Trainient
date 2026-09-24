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
            className="relative z-10 w-full max-w-sm space-y-5 rounded-t-[30px] bg-card px-5 pb-8 pt-3 md:rounded-[30px] md:pb-5"
          >
            <div aria-hidden className="mx-auto h-[5px] w-9 rounded-full bg-accent md:hidden" />
            <div>
              <h3 className="text-2xl font-light tracking-[-0.01em] text-foreground">{title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                className="h-12 flex-1 rounded-full bg-secondary text-sm font-medium text-foreground transition-colors hover:bg-accent"
                data-testid={cancelTestId}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`h-12 flex-1 rounded-full text-sm font-semibold transition-colors ${confirmClassName}`}
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
