import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { CalibrationReviewStep } from "@/components/calibration/CalibrationReviewStep";

// Shown once, full-screen, the first time a client is living in an active
// calibration window (see lib/calibration.ts's shouldShowCalibrationWalkthrough).
// Visually mirrors PresentationDeck.tsx's deck chrome (progress dots, h-11
// rounded-xl nav buttons) but is a standalone flow, not a deck card - it shows
// later in the client's lifecycle, not right after program generation.
export function CalibrationWalkthrough({ calibrationStart }: { calibrationStart: Date }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(0);

  const steps = ["intro", "review"] as const;
  const total = steps.length;
  const isLast = step === total - 1;

  async function finish() {
    await updateProfile.mutateAsync({ data: { calibrationWalkthroughSeenAt: new Date().toISOString() } });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setLocation("/program");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-secondary"}`}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
            {step + 1} / {total}
          </span>
        </div>

        <div className="space-y-5">
          {steps[step] === "intro" && (
            <>
              <div className="text-xs font-semibold tracking-wider uppercase text-primary">Calibration</div>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-1">You're in calibration</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This first stretch is where we learn how your body responds to training, before
                  the real program locks in.
                </p>
              </div>
            </>
          )}

          {steps[step] === "review" && (
            <CalibrationReviewStep calibrationStart={calibrationStart} today={new Date()} />
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
            data-testid="calibration-walkthrough-back"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => (isLast ? finish() : setStep((s) => Math.min(total - 1, s + 1)))}
            disabled={updateProfile.isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            data-testid="calibration-walkthrough-next"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
