import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trophy, Dumbbell, Clock } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useCreateWorkout, useGetPersonalRecords, useListWorkouts, useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { isPreCalibrationLocked } from "@/lib/calibration";
import { LOGGED_SET_BOUNDS, clampToBounds } from "@/lib/fieldLimits";
import { formatClock } from "@/lib/sessionDuration";
import type { LoggedExercise } from "@/lib/workoutSession";
import { buildLastSessionLookup } from "@/lib/sessionLogs";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { usePrDetection } from "@/hooks/usePrDetection";
import { useSessionTimers } from "@/hooks/useSessionTimers";
import { WorkoutLogLockDialog } from "@/components/workout/WorkoutLogLockDialog";
import { ExerciseCard } from "@/components/workout/ExerciseCard";
import { ChecklistItemCard } from "@/components/workout/ChecklistItemCard";
import { ConfirmSheet } from "@/components/workout/ConfirmSheet";
import type { SetField } from "@/components/workout/SetRow";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
import { toast } from "@/hooks/use-toast";

export default function Log() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { data: program, isLoading: isProgramLoading } = useGetCurrentProgram();
  const { data: profile } = useGetProfile();
  const isIndependent = profile?.mode === "independent";
  const weightUnit = profile?.weightUnit ?? "kg";
  const { data: personalRecords } = useGetPersonalRecords();
  const { data: history } = useListWorkouts({ limit: 200 });
  // A target is a comparison, and someone who has never logged has nothing to
  // compare against: a prescribed "3 x 8" on a card they've never filled in
  // reads as a rule to hit rather than the starting point it is. So every
  // target on this page stays hidden until there is at least one saved session.
  // History is undefined while it loads, which is what we want here - the
  // first-timer case never flashes a target before it resolves. Independent
  // mode is exempt: those numbers are the user's own, typed into their program.
  const showTargets = isIndependent || (history != null && history.length > 0);
  const createWorkout = useCreateWorkout();
  const { logs, setLogs, activeDay, hasSession, startFailed, resumedElsewhere, startedAt, endSession } =
    useWorkoutSession({ program, userId: user?.id, setLocation });
  const { prFlashes, judgeSet } = usePrDetection(history as any[] | undefined, personalRecords);
  const { elapsedSeconds, startTimer, pauseTimer, resetTimer } = useSessionTimers(logs, setLogs, startedAt);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  // The sets block (column headers + rows) is what the first tour step rings;
  // the exercise header is what the "?" step spotlights around its button.
  const tourSetsBlockRef = useRef<HTMLDivElement>(null);
  const tourExerciseHeadRef = useRef<HTMLDivElement>(null);
  const tourHelpRef = useRef<HTMLButtonElement>(null);
  const tourFinishRef = useRef<HTMLButtonElement>(null);

  function finishLogTour() {
    updateProfile.mutate(
      { data: { weightLoggingTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
    // After the tour ends (skipped or finished), send the user back to the
    // dashboard.
    setLocation("/dashboard");
  }

  const { lastSetsByExercise, lastNoteByExercise } = buildLastSessionLookup(history as any[] | undefined);

  // Sets are saved implicitly by typing - no separate "confirm" step. Weight
  // and reps together mark a set as logged, and PR detection runs inline.
  function updateSet(exIdx: number, setIdx: number, field: SetField, value: number) {
    const ex = logs[exIdx];
    const set = ex.sets[setIdx];
    // Clamped to the bands the API accepts, so a stray minus sign or a held-down
    // key can't produce a session that silently fails to save (and can't poison
    // the PR / volume maths that reads these numbers back).
    const bounded = clampToBounds(value, field === "weight" ? LOGGED_SET_BOUNDS.weight : LOGGED_SET_BOUNDS.reps);
    const merged = { ...set, [field]: bounded };

    const hasReps = ex.isUnilateral ? merged.repsLeft > 0 && merged.repsRight > 0 : merged.reps > 0;
    const completed = merged.weight > 0 && hasReps;
    const isNewPr = completed ? judgeSet(ex.name, ex.isUnilateral, merged, set.isNewPr) : false;

    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s, si) => (si === setIdx ? { ...merged, completed, isNewPr } : s)),
      };
      return next;
    });
  }

  // Checklist items get their own completion path. They must NOT go through
  // updateSet, whose `completed = weight > 0 && hasReps` can never be true for
  // something with no weight and no reps.
  function patchItem(exIdx: number, patch: Partial<LoggedExercise>) {
    setLogs((prev) => prev.map((ex, i) => (i === exIdx ? { ...ex, ...patch } : ex)));
  }

  /**
   * Completes the current round of a timed item and rolls straight on to the
   * next one - clearing the timer resets it to the full hold, ready to start
   * again. Unlike toggleChecklistRound this only ever moves forward: a swipe is
   * a one-way gesture, so it must not un-tick a finished item by accident.
   *
   * Undo comes for free at the end: once the last round lands the item is done,
   * the filling card gives way to the ordinary checklist row, and that row's
   * tick clears it.
   */
  function completeChecklistRound(exIdx: number) {
    const ex = logs[exIdx];
    patchItem(exIdx, {
      completedRounds: Math.min(ex.targetRounds, ex.completedRounds + 1),
      timerEndsAt: null,
      timerPausedRemaining: null,
    });
  }

  /** Tick the next round, or untick everything once all rounds are done. */
  function toggleChecklistRound(exIdx: number) {
    const ex = logs[exIdx];
    const done = ex.completedRounds >= ex.targetRounds;
    patchItem(exIdx, {
      completedRounds: done ? 0 : ex.completedRounds + 1,
      // Ticking by hand cancels any running countdown for that round.
      timerEndsAt: null,
      timerPausedRemaining: null,
    });
  }

  function updateNotes(exIdx: number, notes: string) {
    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], notes };
      return next;
    });
  }

  function toggleNotes(exIdx: number) {
    setLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], showNotes: !next[exIdx].showNotes };
      return next;
    });
  }

  async function finishWorkout() {
    try {
      await createWorkout.mutateAsync({
        data: {
          date: new Date().toISOString().split("T")[0],
          dayNumber: activeDay?.dayNumber ?? 1,
          weekNumber: program?.weekNumber ?? 1,
          dayLabel: activeDay?.label ?? null,
          // Sent exactly as recorded, however implausible - an overnight session
          // is stored honestly and simply fails the plausibility band when
          // averages are computed. The user is never asked about the clock.
          startedAt: startedAt ? new Date(startedAt).toISOString() : null,
          durationSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
          exercisesLogged: logs.filter((ex) => ex.name.trim()).map((ex) => {
            if (ex.kind === "checklist") {
              return {
                name: ex.name,
                muscle: "",
                // No sets, ever. An empty array is what keeps this row out of the
                // volume, e1RM and PR maths on the way back in.
                sets: [],
                kind: "checklist" as const,
                completedRounds: ex.completedRounds,
                targetSeconds: ex.targetSeconds,
                category: ex.category,
                notes: ex.notes || undefined,
              };
            }
            return {
              name: ex.name,
              muscle: ex.muscle,
              kind: "lift" as const,
              sets: ex.sets.map((s) =>
                ex.isUnilateral
                  ? { setNumber: s.setNumber, weight: s.weight, reps: null, repsLeft: s.repsLeft, repsRight: s.repsRight, completed: s.completed, isNewPr: s.isNewPr }
                  : { setNumber: s.setNumber, weight: s.weight, reps: s.reps, completed: s.completed, isNewPr: s.isNewPr }
              ),
              notes: ex.notes || undefined,
            };
          }),
          notes: null,
        },
      });
    } catch {
      // Leave the draft and the user on the page - losing a finished session to a
      // failed request would be far worse than an extra tap on Finish.
      toast({
        title: "Couldn't save your workout",
        description: "Your session is still here. Please try again.",
        variant: "destructive",
      });
      return;
    }
    endSession();
    const loggedCount = logs.filter((ex) => ex.name.trim()).length;
    toast({
      title: "Workout saved 🎉",
      description:
        sessionPrCount > 0
          ? `${sessionPrCount} new PR${sessionPrCount > 1 ? "s" : ""}! Nice work.`
          : `${loggedCount} exercise${loggedCount === 1 ? "" : "s"} logged.`,
    });
    setLocation("/dashboard");
  }

  function handleFinishClick() {
    // Checklist items count toward the gate exactly like sets do. Nothing is
    // blocked either way - an unticked item only means Finish warns first, and
    // the confirm sheet still lets the session through.
    const allSetsComplete = logs.every((ex) => {
      if (ex.kind === "checklist") {
        return ex.completedRounds >= ex.targetRounds;
      }
      return ex.sets.every((s) => s.completed);
    });
    if (allSetsComplete) {
      finishWorkout();
    } else {
      setShowIncompleteConfirm(true);
    }
  }

  function cancelWorkout() {
    endSession();
    setShowCancelConfirm(false);
    setLocation("/program");
  }

  if (program && isPreCalibrationLocked(program, new Date())) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <WorkoutLogLockDialog
          open
          programId={program.id}
          onCancel={() => setLocation("/dashboard")}
        />
      </div>
    );
  }

  // The active mode's lineage has no program to log against - the manual
  // lineage in Independent mode, the AI lineage in AI mode. Once the query has
  // settled (and the profile is known, so the copy/CTA match the mode), send
  // the user to their program page to create/generate one instead of spinning
  // on "Loading..." forever.
  if (!isProgramLoading && !program && profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-20">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No program to log yet</h2>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            {isIndependent
              ? "You haven't built a program yet. Create one to start logging your workouts."
              : "You don't have a program yet. Generate one with your AI coach to start logging your workouts."}
          </p>
          <Link href={isIndependent ? "/program/my" : "/program/ai"}>
            <button
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-log-no-program-cta"
            >
              {isIndependent ? "Create your program" : "Generate my program"}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Nothing in progress. This is what the page looks like both before a session
  // and after one has been finished or discarded - logging starts on a Start
  // workout press and nowhere else, so the only thing offered here is the way
  // to that button. The one case that gets different words is a press that DID
  // reach here and still couldn't open a session: sending that client back to
  // the button would just repeat the failure.
  if (hasSession === false) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-20" data-testid="log-no-session">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            {startFailed ? "Couldn't start your workout" : "No logging ongoing"}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            {startFailed
              ? "This browser won't let the app store your session on this device, so there's nowhere to log to. Turn on site data (or leave private browsing) and try again."
              : "Head to your program page and hit Start workout on the day you're training - your session opens here."}
          </p>
          <Link href="/program">
            <button
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-log-no-session-cta"
            >
              Go to my program
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (!program || !activeDay) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading workout...</div>
      </div>
    );
  }

  const day = activeDay;
  const sessionPrCount = logs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.isNewPr).length, 0);
  // Which card carries the first two steps' targets - see the note in the logger
  // map below. -1 when the day is checklist items only, which is why those steps
  // are dropped rather than left pointing at nothing.
  const firstLiftIdx = logs.findIndex((ex) => ex.kind !== "checklist");
  const showLogTour = !!profile && !profile.weightLoggingTourSeenAt && logs.length > 0;
  const logTourSteps: CoachmarkStep[] = [
    // Ring the whole sets block, not one row: the "Weight" / "Reps" column
    // headers sit above the rows, and without them the step points at unlabelled
    // number boxes. Anchoring on the block also puts the bubble under it rather
    // than over the remaining sets.
    ...(firstLiftIdx >= 0
      ? [{ target: tourSetsBlockRef, text: "Here you can track your weight and reps." } as CoachmarkStep]
      : []),
    // Same idea for the help button - "this exercise" only means something with
    // the exercise's own header lit next to the "?".
    ...(!isIndependent && firstLiftIdx >= 0
      ? [
          {
            target: tourHelpRef,
            spotlight: tourExerciseHeadRef,
            text: "Not sure how to perform this exercise? Tap the ? whenever you need it.",
          } as CoachmarkStep,
        ]
      : []),
    { target: tourFinishRef, text: "This is where you save your workout." },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto pb-12">
      {/* PR Toast Stack */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {prFlashes.map((flash) => (
            <motion.div
              key={flash.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 bg-amber-500/90 backdrop-blur-sm text-black font-semibold text-sm px-4 py-3 rounded-xl shadow-xl"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-medium opacity-80">New personal record!</div>
                <div>{flash.exercise} - {flash.weight} {weightUnit}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{day?.label ?? "Workout"}</h1>
            {/* Ambient information, not an achievement - deliberately not given
                the PR pill's treatment, and kept out of the corner the PR badge
                and "Cancel workout" already share. */}
            {elapsedSeconds != null && (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5"
                data-testid="text-session-duration"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium tabular-nums">{formatClock(elapsedSeconds)}</span>
              </div>
            )}
            {resumedElsewhere && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-2 inline-block">
                Resuming your in-progress session - finish it before starting a new one.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sessionPrCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold"
              >
                <Trophy className="w-4 h-4" />
                {sessionPrCount} PR{sessionPrCount > 1 ? "s" : ""}
              </motion.div>
            )}
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-muted-foreground hover:text-red-400 transition-colors px-2 py-1.5"
              data-testid="button-cancel-workout"
            >
              Cancel workout
            </button>
          </div>
        </div>
      </motion.div>

      {/* No day picker here on purpose: the page logs exactly the one day named
          above. Switching days happens on the program page, which prompts to
          discard this session first (see DiscardSessionDialog). */}

      <div className="mt-6 space-y-6">
        {logs.map((ex, exIdx) => {
          if (ex.kind === "checklist") {
            return (
              <ChecklistItemCard
                key={`${ex.name}-${exIdx}`}
                ex={ex}
                exIdx={exIdx}
                showTargets={showTargets}
                onCompleteRound={() => completeChecklistRound(exIdx)}
                onToggleRound={() => toggleChecklistRound(exIdx)}
                onStart={() => startTimer(exIdx)}
                onPause={() => pauseTimer(exIdx)}
                onReset={() => resetTimer(exIdx)}
              />
            );
          }

          const nameKey = ex.name.toLowerCase();
          return (
            <ExerciseCard
              key={ex.name}
              ex={ex}
              exIdx={exIdx}
              weightUnit={weightUnit}
              showTargets={showTargets}
              showHelp={!isIndependent}
              // AI mode's forward-looking targets. Gated on showTargets for the
              // same reason the prescription is: a target is a comparison, and
              // a first-ever session has nothing to compare against.
              showProgressionTargets={!isIndependent && showTargets}
              prevSets={lastSetsByExercise[nameKey]}
              prevNote={lastNoteByExercise[nameKey]}
              // The tour's first two steps are about weights, reps and how to
              // perform a lift, so they hang off the first *lift* card rather
              // than the first card: a day that opens with a checklist item (a
              // warmup sits above the first lift) would otherwise leave their
              // targets unmounted and the steps with nothing to point at.
              tourRefs={
                exIdx === firstLiftIdx
                  ? { head: tourExerciseHeadRef, help: tourHelpRef, setsBlock: tourSetsBlockRef }
                  : undefined
              }
              onHelp={() => setLocation(`/exercises/how-to?name=${encodeURIComponent(ex.name)}`)}
              onUpdateSet={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
              onUpdateNotes={(notes) => updateNotes(exIdx, notes)}
              onToggleNotes={() => toggleNotes(exIdx)}
            />
          );
        })}
      </div>

      {/* Finishing lives at the end of the list, in normal flow - not in a bar
          pinned to the bottom. On a phone that bar sat above the tab nav, and
          the keyboard pushed both up over the set rows the user was typing
          into; a full-width primary button in the scrolling thumb's path also
          made ending the session an easy mis-tap. Scrolling past the last
          exercise is the natural end of a session, so the button waits there.
          The tour scrolls this into view for its final step (CoachmarkTour
          calls scrollIntoView on each anchored target). */}
      <button
        ref={tourFinishRef}
        onClick={handleFinishClick}
        disabled={createWorkout.isPending}
        className="w-full h-12 mt-8 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        data-testid="button-finish-workout"
      >
        {createWorkout.isPending ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
        ) : sessionPrCount > 0 ? (
          <><Trophy className="w-5 h-5 text-amber-300" /> Finish - {sessionPrCount} new PR{sessionPrCount > 1 ? "s" : ""}!</>
        ) : (
          "Finish workout"
        )}
      </button>

      {showLogTour && <CoachmarkTour steps={logTourSteps} onDone={finishLogTour} testIdPrefix="log-tour" />}

      <ConfirmSheet
        open={showIncompleteConfirm}
        title="Not every set is logged"
        body="Looks like some sets are still missing a weight or rep count. Finish anyway, or go back and fill them in?"
        cancelLabel="Keep logging"
        confirmLabel="Finish anyway"
        confirmClassName="bg-primary text-primary-foreground hover:bg-primary/90"
        cancelTestId="button-keep-logging"
        confirmTestId="button-finish-anyway"
        onCancel={() => setShowIncompleteConfirm(false)}
        onConfirm={() => { setShowIncompleteConfirm(false); finishWorkout(); }}
      />

      <ConfirmSheet
        open={showCancelConfirm}
        title="Discard this workout?"
        body="Everything you've logged in this session will be lost - it won't be saved."
        cancelLabel="Keep logging"
        confirmLabel="Discard workout"
        confirmClassName="bg-red-500/90 text-white hover:bg-red-500"
        cancelTestId="button-keep-workout"
        confirmTestId="button-discard-workout"
        onCancel={() => setShowCancelConfirm(false)}
        onConfirm={cancelWorkout}
      />
    </div>
  );
}
