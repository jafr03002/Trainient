import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Flag, MapPin, Target } from "lucide-react";
import { useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { addDays } from "@/lib/calibration";
import { LetterDock, LetterWash, PageDots, PageHead } from "@/components/onboarding/letter";

// Source copy: docs/mammanotes.txt, "Calibration step 1" - tightened here.
const INTRO_FOCUS_ITEMS = [
  { icon: Dumbbell, title: "Try the program", detail: "Run through your sessions and get a feel for the plan." },
  { icon: MapPin, title: "Learn your gym", detail: "Find where every exercise lives and get comfortable with the equipment." },
  { icon: Target, title: "Standardise your form", detail: "Settle into consistent technique you can build on." },
] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A review can be requested from the day after the first week (the day-8 rule
// in lib/calibration.ts); it happens on its own later if they never ask. The window
// can run longer, but calibration is presented as about a week, so neither the
// cap nor a week count is shown.
const REVIEW_FROM_DAY = 8;

// Shown once, full-screen, the first time a client is living in an active
// calibration window (see lib/calibration.ts's shouldShowCalibrationWalkthrough).
// It's the last stop before the navigation tour and speaks in the same "coach's
// letter" voice as the presentation deck: the only place calibration is
// explained.
export function CalibrationWalkthrough({ calibrationStart }: { calibrationStart: Date }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(0);

  const steps = ["intro", "review"] as const;
  const isLast = step === steps.length - 1;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayDayNumber = Math.round((todayMidnight.getTime() - calibrationStart.getTime()) / 86_400_000) + 1;
  const reviewDate = addDays(calibrationStart, REVIEW_FROM_DAY - 1);

  async function finish() {
    await updateProfile.mutateAsync({ data: { calibrationWalkthroughSeenAt: new Date().toISOString() } });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setLocation("/dashboard");
  }

  return (
    <div className="relative min-h-page w-full bg-background text-foreground">
      <LetterWash bookend />

      <div className="relative mx-auto flex max-w-lg justify-end px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <PageDots count={steps.length} index={step} />
      </div>

      <div className="relative mx-auto max-w-lg px-6 pb-44 pt-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={steps[step]}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
          >
            {steps[step] === "intro" && (
              <>
                <PageHead title="Calibration">
                  Your first week is about <b>learning the program</b>, not lifting heavy.
                </PageHead>
                <div className="mt-7">
                  {INTRO_FOCUS_ITEMS.map((item) => (
                    <div key={item.title} className="flex items-start gap-3.5 border-b border-border py-4 last:border-b-0">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card">
                        <item.icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[16px] font-normal text-foreground">{item.title}</h3>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                  Everything you notice feeds back to your coach, who fine-tunes your program from it.
                </p>
              </>
            )}

            {steps[step] === "review" && (
              <>
                <PageHead title="Your review">
                  After <b>your first week</b>, ask for your review <b>whenever you're ready</b>.
                </PageHead>

                <div className="mt-8 flex items-start gap-1.5" data-testid="calibration-week">
                  {Array.from({ length: REVIEW_FROM_DAY - 1 }, (_, i) => {
                    const dayNumber = i + 1;
                    const date = addDays(calibrationStart, i);
                    const isToday = dayNumber === todayDayNumber;
                    const past = dayNumber < todayDayNumber;
                    return (
                      <div key={dayNumber} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{WEEKDAY_SHORT[date.getDay()]}</span>
                        <span
                          className={`grid aspect-square w-full max-w-10 place-items-center rounded-full text-[13px] ${
                            isToday ? "bg-white font-medium text-black" : past ? "bg-card text-muted-foreground" : "bg-card text-foreground"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.06em] text-[hsl(var(--sessions-cyan))]">Review</span>
                    <span className="grid aspect-square w-full max-w-10 place-items-center rounded-full border-[1.5px] border-white">
                      <Flag className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-0">
                  <div className="flex items-baseline justify-between gap-3 border-b border-border py-3.5">
                    <span className="text-[15px] text-foreground">Ask for your review</span>
                    <span className="whitespace-nowrap text-[14px] text-muted-foreground">
                      from {WEEKDAY_SHORT[reviewDate.getDay()]} {reviewDate.getDate()}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-3.5">
                    <span className="text-[15px] text-foreground">If you don't ask</span>
                    <span className="whitespace-nowrap text-[14px] text-muted-foreground">it happens on its own</span>
                  </div>
                </div>

                <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                  Your coach looks back at the week, then sets your real targets for what comes next.
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <LetterDock
        label={isLast ? "Show me around" : "Next"}
        onNext={() => (isLast ? finish() : setStep((s) => Math.min(steps.length - 1, s + 1)))}
        onBack={step > 0 ? () => setStep((s) => Math.max(0, s - 1)) : undefined}
        disabled={updateProfile.isPending}
        nextTestId="calibration-walkthrough-next"
        backTestId="calibration-walkthrough-back"
      />
    </div>
  );
}
