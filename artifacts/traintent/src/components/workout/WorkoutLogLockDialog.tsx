import type { MouseEvent } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetProgramStartDate, getGetCurrentProgramQueryKey } from "@workspace/api-client-react";
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
import { toast } from "@/hooks/use-toast";

// Blocking pop-up shown wherever a client tries to log a workout while still
// in preCalibrationPhase (committed to a future start date). AlertDialog
// (not Dialog) is deliberate: no click-outside-to-dismiss, no free X button -
// the client must explicitly choose Cancel or start today.
export function WorkoutLogLockDialog({
  open,
  programId,
  onCancel,
}: {
  open: boolean;
  programId: number | undefined;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const setProgramStartDate = useSetProgramStartDate();

  async function handleStartToday(event: MouseEvent<HTMLButtonElement>) {
    // AlertDialogAction closes itself on click unless the click is
    // prevented - keep the dialog open through the mutation, then let the
    // caller's `open` prop (re-derived from the freshly-invalidated program
    // query) flip to false on its own.
    event.preventDefault();
    if (!programId) return;
    try {
      await setProgramStartDate.mutateAsync({
        id: programId,
        data: { startDate: new Date().toISOString() },
      });
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
    } catch {
      toast({
        title: "Couldn't update your start date",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent data-testid="dialog-workout-log-lock">
        <AlertDialogHeader>
          <AlertDialogTitle>You can't log workouts yet</AlertDialogTitle>
          <AlertDialogDescription>
            You can't log workouts before committing to training. Click here if you're ready to start today.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} data-testid="button-lock-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStartToday}
            disabled={setProgramStartDate.isPending}
            data-testid="button-lock-start-today"
          >
            {setProgramStartDate.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            I'm ready - start today
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
