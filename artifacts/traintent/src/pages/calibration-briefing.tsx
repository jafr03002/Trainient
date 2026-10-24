import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { isCalibrationProgram, isPreCalibrationLocked } from "@/lib/calibration";
import { startSession } from "@/lib/workoutSession";
import { LetterDock, LetterWash, PageDots } from "@/components/onboarding/letter";
import intentSun from "@/assets/intent-sun.png";

// Jakob's six calibration-session rules (docs/flow_trees, calibration subtree),
// lightly tidied. One per card, all read before the session can start.
const POINTS = [
  {
    title: "No logging this week",
    body: "Your main focus is finding the machines and giving honest feedback on whatever happens during your sessions.",
  },
  {
    title: "Don't train at max effort",
    body: "Leave a few reps in the tank and focus on execution. Going all in during the first week isn't the goal - once you're ready after the review, we go all in.",
  },
  {
    title: "The order isn't strict",
    body: "Follow the exercise order as well as you can, but it isn't the end of the world if an exercise gets swapped for another.",
  },
  {
    title: "Leave a note if something gets in the way",
    body: "Add a note on that exercise. Your coach will read it and make adjustments if needed.",
  },
  {
    title: "Afterwards, write anything that comes to mind",
    body: "When you finish, you'll get a box for anything about the session. It all goes to your coach for the review.",
  },
] as const;

// The bridge between a Start press and the logger during calibration. Start
// buttons send the client here instead of starting the session, so the session
// clock doesn't run while they read and backing out leaves nothing behind;
// "Start session" on the last card is what actually starts it.
export default function CalibrationBriefing() {
  const [, setLocation] = useLocation();
  const dayNumber = Number(new URLSearchParams(useSearch()).get("day"));
  const { user } = useUser();
  const { data: program } = useGetCurrentProgram();
  const { data: profile } = useGetProfile();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(0);

  const total = POINTS.length + 1; // the five rules, then "Good luck!"
  const isLast = step === total - 1;
  const day = (program?.days as { dayNumber: number; label?: string | null }[] | undefined)?.find(
    (d) => d.dayNumber === dayNumber
  );
  // Once read through to the end, later sessions may skip straight in.
  const canSkip = !!profile?.calibrationBriefingSeenAt;

  function start() {
    if (user?.id && program) startSession(user.id, program.id, dayNumber);
    // `start=1` carries the press across, as every Start button does, so the
    // logger still opens the day if the write above didn't land.
    setLocation(`/log?day=${dayNumber}&start=1`, { replace: true });
  }

  function startFromLastCard() {
    if (!profile?.calibrationBriefingSeenAt) {
      updateProfile.mutate(
        { data: { calibrationBriefingSeenAt: new Date().toISOString() } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
      );
    }
    start();
  }

  // Not (or no longer) a calibration session - a check-in moved the phase on,
  // or the URL was opened by hand. The briefing has nothing to say then, so
  // start the session the ordinary way. A start date still in the future goes
  // to the logger too, which shows the lock.
  const notCalibration = !!program && (!isCalibrationProgram(program) || isPreCalibrationLocked(program, new Date()));
  useEffect(() => {
    if (notCalibration) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notCalibration]);

  function close() {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  }

  function next() {
    if (isLast) startFromLastCard();
    else setStep((s) => Math.min(total - 1, s + 1));
  }

  if (!program || notCalibration) return null;

  return (
    // Full screen over the tab bar: this is a step in starting a session, not a
    // page to navigate away from.
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background text-foreground" data-testid="calibration-briefing">
      <LetterWash bookend={step === 0 || isLast} />

      <div className="relative mx-auto flex max-w-lg items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={close}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground"
          data-testid="calibration-briefing-close"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </button>
        <PageDots count={total} index={step} />
      </div>

      {/* Tapping anywhere on the card moves on, like turning a page. */}
      <div
        className="relative mx-auto min-h-[70dvh] max-w-lg cursor-pointer px-6 pb-44 pt-8"
        onClick={() => {
          if (!isLast) next();
        }}
        data-testid="calibration-briefing-card"
      >
        <span className="text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--sessions-cyan))]">
          Calibration{day?.label ? ` · ${day.label}` : ""}
        </span>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
          >
            {isLast ? (
              <div className="pt-24 text-center">
                <img src={intentSun} alt="" className="mx-auto h-14 w-14 object-contain" />
                <h2 className="mt-6 text-[34px] font-light leading-[1.08] tracking-[-0.025em]">Good luck!</h2>
                <p className="mt-3 text-[15px] text-muted-foreground">Tick each set off as you go.</p>
              </div>
            ) : (
              <>
                {step === 0 && (
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    Great, you're starting a session. Since you're in calibration, keep these things in mind:
                  </p>
                )}
                <h2 className="mt-14 text-[30px] font-light leading-[1.12] tracking-[-0.025em]">{POINTS[step].title}</h2>
                <p className="mt-4 text-[17px] font-light leading-[1.45] text-muted-foreground">{POINTS[step].body}</p>
                <p className="mt-16 text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70">Tap to continue</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <LetterDock
        label={isLast ? "Start session" : "Next"}
        onNext={next}
        onBack={step > 0 ? () => setStep((s) => Math.max(0, s - 1)) : undefined}
        nextTestId="calibration-briefing-next"
        backTestId="calibration-briefing-back"
      >
        {canSkip && !isLast && (
          <button
            onClick={start}
            className="mt-3 w-full text-center text-[13px] text-muted-foreground"
            data-testid="calibration-briefing-skip"
          >
            Skip to the session
          </button>
        )}
      </LetterDock>
    </div>
  );
}
