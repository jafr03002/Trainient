import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Dumbbell, MapPin, Target } from "lucide-react";
import { useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { CalibrationReviewStep } from "@/components/calibration/CalibrationReviewStep";

// Source copy: docs/mammanotes.txt, "Calibration step 1" - tightened here, same
// icon-card treatment as ProgramHighlights.tsx for visual consistency with the
// rest of the deck.
const INTRO_FOCUS_ITEMS = [
  { icon: Dumbbell, title: "Try the program", detail: "Run through your sessions and get a feel for the plan." },
  { icon: MapPin, title: "Learn your gym", detail: "Find where every exercise lives and get comfortable with the equipment." },
  { icon: Target, title: "Standardize your form", detail: "Settle into consistent technique you can build on." },
] as const;

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

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  async function finish() {
    await updateProfile.mutateAsync({ data: { calibrationWalkthroughSeenAt: new Date().toISOString() } });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setLocation("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-white" : "w-1.5 bg-secondary"}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground tracking-[0.14em] uppercase">
            {step + 1} / {total}
          </span>
        </div>

        <div className="space-y-5">
          {steps[step] === "intro" && (
            <>
              <div className="text-[11px] tracking-[0.14em] uppercase text-[hsl(var(--sessions-cyan))]">Calibration</div>
              <div>
                <h2 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground mb-2.5">Welcome to calibration</h2>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                  This is your smooth on-ramp into training. Over this first phase you'll try the
                  program, get to know your gym, and lock in solid form on each exercise.
                </p>
              </div>

              <div className="space-y-2.5">
                {INTRO_FOCUS_ITEMS.map((item) => (
                  <div key={item.title} className="px-5 py-4 rounded-3xl bg-card">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
                        <item.icon className="w-4 h-4" strokeWidth={1.6} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-normal text-foreground">{item.title}</h3>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                Everything you notice feeds back to your AI coach, who fine-tunes your program
                before you move toward your goal.
              </p>
            </>
          )}

          {steps[step] === "review" && (
            <CalibrationReviewStep calibrationStart={calibrationStart} today={todayMidnight} />
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex-1 h-[52px] rounded-full border border-foreground/90 text-sm font-medium uppercase tracking-[0.06em] text-foreground hover:bg-secondary transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
            data-testid="calibration-walkthrough-back"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => (isLast ? finish() : setStep((s) => Math.min(total - 1, s + 1)))}
            disabled={updateProfile.isPending}
            className="flex-1 h-[52px] rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase tracking-[0.06em] hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            data-testid="calibration-walkthrough-next"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
