import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Shown when a client tries to start a different day while a workout is still
// in progress. Only one session can exist at a time, so the other day can't be
// opened without throwing this one away. AlertDialog (not Dialog) is
// deliberate, same as WorkoutLogLockDialog: no click-outside-to-dismiss and no
// free X, because silently falling back to either day would be a surprise -
// the client must say which session they want.
export function DiscardSessionDialog({
  open,
  inProgressLabel,
  targetLabel,
  onDismiss,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  inProgressLabel: string;
  targetLabel: string;
  // Escape closes the dialog without acting on either session - the client
  // stays where they are, having neither discarded nor left the page.
  onDismiss: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <AlertDialogContent data-testid="dialog-discard-session">
        <AlertDialogHeader>
          <AlertDialogTitle>You're already logging a workout</AlertDialogTitle>
          <AlertDialogDescription>
            You have {inProgressLabel} in progress. Starting {targetLabel} will discard everything
            you logged in that session - it won't be saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* AlertDialogFooter stacks `flex-col-reverse` on mobile, which would put
            the destructive action under the client's thumb first. Force plain
            column order so "Keep logging" leads, as it does in the log page's
            own discard sheet. */}
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          <AlertDialogCancel onClick={onKeep} data-testid="button-keep-active-session">
            Keep logging {inProgressLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onDiscard}
            className="bg-red-500/90 text-white hover:bg-red-500"
            data-testid="button-discard-active-session"
          >
            Discard &amp; start {targetLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
