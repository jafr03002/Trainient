import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Check, ChevronRight, Loader2, Play } from "lucide-react";
import intentSun from "@/assets/intent-sun.png";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWorkoutStats,
  useGetCurrentProgram,
  useGetLatestCheckin,
  useGetPersonalRecords,
  useGetProfile,
  useGetDailyLogsWeek,
  useListWorkouts,
  useSubmitDailyCheckin,
  useGetGoalProgress,
  useListPrograms,
  useSetProgramStartDate,
  useUpdateProfile,
  getGetDailyLogsWeekQueryKey,
  getGetGoalProgressQueryKey,
  getGetProfileQueryKey,
  getGetCurrentProgramQueryKey,
} from "@workspace/api-client-react";
import { phaseSolid } from "@/lib/phaseColors";
import { FIELD_LIMITS, rangeError } from "@/lib/fieldLimits";
import { buildPhaseRanges, buildCalibrationGroups, findCalibrationGroup, shouldShowCalibrationWalkthrough, isPreCalibrationLocked, parseLocalDateString } from "@/lib/calibration";
import { CalibrationWalkthrough } from "@/components/calibration/CalibrationWalkthrough";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
import { IndependentTargetsCard } from "@/components/dashboard/IndependentTargetsCard";
import { WeekStrip } from "@/components/dashboard/WeekStrip";
import { greetingLine, nextSessionDay } from "@/lib/greetingLines";
import { useTourSteps } from "@/hooks/useResolvedTourSteps";
import { useNavTourTarget, useNavTourClick } from "@/components/layout";
import { toast } from "@/hooks/use-toast";

// Local calendar date, not UTC - so logging just after midnight lands on the
// day the user actually sees, not a day that already rolled over server-side.
function todayDateString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Monday of the current local week - the weekly table always starts there
// regardless of what day "today" is.
function startOfWeekDateString(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

const CARDIO_TYPES = ["Run", "Bike", "Row", "Swim", "Walk", "Other"];

export default function Dashboard() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const stats = useGetWorkoutStats();
  const program = useGetCurrentProgram();
  const latestCheckin = useGetLatestCheckin();
  const personalRecords = useGetPersonalRecords();
  const profileQuery = useGetProfile();
  const programsQuery = useListPrograms();
  // Newest-first. The week strip paints the sessions actually logged this week,
  // and the greeting reads the most recent one to know where the client is up to.
  const workoutsQuery = useListWorkouts({ limit: 200 });
  const updateProfile = useUpdateProfile();
  const tourDailyCheckinRef = useRef<HTMLDivElement>(null);
  const tourStartWorkoutRef = useRef<HTMLButtonElement>(null);
  const tourBuildProgramRef = useRef<HTMLAnchorElement>(null);
  const tourProgressRef = useRef<HTMLDivElement>(null);
  // The week strip's "Full month" link - the calendar nudge's target for when
  // the nav no longer carries a Calendar tab.
  const tourCalendarLinkRef = useRef<HTMLAnchorElement>(null);
  const programNavTarget = useNavTourTarget("/program");
  const calendarNavTarget = useNavTourTarget("/calendar");
  const resolveTourSteps = useTourSteps();
  // Whether the first-run tour is open, held here rather than read back off the
  // profile: the seen flag is now written when the tour OPENS (see below), and
  // a tour that disappeared the moment that write landed would never reach its
  // second step.
  const [dashboardTourState, setDashboardTourState] = useState<"idle" | "running" | "done">("idle");

  function finishDashboardTour() {
    setDashboardTourState("done");
  }

  // Skipping out of the calendar prompt retires the whole calendar leg - it's a
  // single nudge, and re-offering it on every dashboard visit would nag. Tapping
  // the link instead leaves the flag alone: the calendar page's own tour finishes
  // the leg (and sets it) once the user has opened a session.
  function skipCalendarLeg() {
    updateProfile.mutate(
      { data: { calendarTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
  }

  const profile = profileQuery.data;
  const isIndependent = profile?.mode === "independent";

  // The dashboard is the first leg of the first-run walkthrough (dashboard ->
  // program -> log workout), so it must fire the moment the user lands here
  // after onboarding. It deliberately does NOT wait for a program to exist:
  // Independent mode has none yet at that point, and gating on one used to
  // push the whole tour back to after the user had already built a program.
  // Only the program query settling matters - the hero's tour target depends
  // on whether a program came back (see dashboardTourSteps).
  const tourReady = !!profile && !profile.dashboardTourSeenAt && !program.isLoading;
  useEffect(() => {
    if (!tourReady || dashboardTourState !== "idle") return;
    setDashboardTourState("running");
    // Marked seen as the tour OPENS, not as it finishes. It used to be written
    // only when the client tapped Program on the final step, so leaving the
    // dashboard any other way - the back button, another nav item, a reload -
    // brought the whole tour back on the next visit.
    updateProfile.mutate(
      { data: { dashboardTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourReady, dashboardTourState]);
  const showDashboardTour = dashboardTourState === "running";
  useNavTourClick("/program", showDashboardTour ? finishDashboardTour : null);

  // Second leg of the walkthrough, deliberately held back until the user has
  // actually saved a workout: the calendar is only worth showing once there's a
  // session on it to look back at. It picks up where the first-run tour left
  // off, so it waits for that one to be done rather than stacking on top of it.
  const showCalendarPrompt =
    !!profile &&
    !!profile.dashboardTourSeenAt &&
    !profile.calendarTourSeenAt &&
    // The dashboard leg now marks itself seen as it opens, so this has to check
    // the tour isn't still running - otherwise both would be on screen at once.
    dashboardTourState !== "running" &&
    (stats.data?.totalLogged ?? 0) > 0;
  // Prefer the real nav link; when Calendar isn't in the bar, hand the client
  // the week strip's "Full month" link instead - same destination, and the step
  // still ends with them tapping something real.
  const calendarPromptSteps: CoachmarkStep[] = [
    {
      kind: "navClick",
      target: calendarNavTarget.current ? calendarNavTarget : tourCalendarLinkRef,
      text: "Your first session is in the books - open up your calendar.",
    },
  ];

  const todayStr = todayDateString();
  const weekStartStr = startOfWeekDateString();
  const weekLogs = useGetDailyLogsWeek({ startDate: weekStartStr });
  const goalProgress = useGetGoalProgress();
  const submitDailyCheckin = useSubmitDailyCheckin();

  const todayEntry = weekLogs.data?.days.find((d) => d.date === todayStr);

  const [weightInput, setWeightInput] = useState("");
  const [caloriesInput, setCaloriesInput] = useState("");
  const [stepsInput, setStepsInput] = useState("");
  const [cardioTypeInput, setCardioTypeInput] = useState("");
  const [cardioMinutesInput, setCardioMinutesInput] = useState("");

  // Pre-fill the check-in form from today's already-saved entry once it
  // loads - only on load, so it doesn't clobber what the user is mid-typing
  // if the query refetches in the background.
  useEffect(() => {
    if (!todayEntry) return;
    setWeightInput(todayEntry.weight != null ? String(todayEntry.weight) : "");
    setCaloriesInput(todayEntry.calories != null ? String(todayEntry.calories) : "");
    setStepsInput(todayEntry.steps != null ? String(todayEntry.steps) : "");
    setCardioTypeInput(todayEntry.cardioType ?? "");
    setCardioMinutesInput(todayEntry.cardioMinutes != null ? String(todayEntry.cardioMinutes) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekLogs.dataUpdatedAt]);

  const loggedCount = [
    todayEntry?.weight != null,
    todayEntry?.calories != null,
    todayEntry?.steps != null,
    todayEntry?.cardioType != null,
  ].filter(Boolean).length;

  // The API enforces these bands too; checking here means a fat-fingered entry is
  // flagged under the field rather than silently failing to save. Blank stays
  // valid - a check-in that only logs steps is normal.
  const checkinWeightError = rangeError(weightInput, FIELD_LIMITS.weight);
  const checkinCaloriesError = rangeError(caloriesInput, FIELD_LIMITS.calories);
  const checkinStepsError = rangeError(stepsInput, FIELD_LIMITS.steps);
  const checkinCardioMinutesError = rangeError(cardioMinutesInput, FIELD_LIMITS.cardioMinutes);
  const checkinHasError =
    !!checkinWeightError || !!checkinCaloriesError || !!checkinStepsError || !!checkinCardioMinutesError;

  async function handleSaveDailyCheckin() {
    if (checkinHasError) return;
    const weight = weightInput ? parseFloat(weightInput) : undefined;
    const calories = caloriesInput ? parseInt(caloriesInput, 10) : undefined;
    const steps = stepsInput ? parseInt(stepsInput, 10) : undefined;
    const cardioMinutes = cardioMinutesInput ? parseInt(cardioMinutesInput, 10) : undefined;

    try {
      await submitDailyCheckin.mutateAsync({
        data: {
          date: todayStr,
          weight: weight != null && Number.isFinite(weight) ? weight : undefined,
          calories: calories != null && Number.isFinite(calories) ? calories : undefined,
          steps: steps != null && Number.isFinite(steps) ? steps : undefined,
          cardioType: cardioTypeInput || undefined,
          cardioMinutes: cardioMinutes != null && Number.isFinite(cardioMinutes) ? cardioMinutes : undefined,
        },
      });
    } catch {
      toast({
        title: "Couldn't save your check-in",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getGetDailyLogsWeekQueryKey({ startDate: weekStartStr }) });
    queryClient.invalidateQueries({ queryKey: getGetGoalProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
  }

  const setProgramStartDate = useSetProgramStartDate();

  async function handleStartToday() {
    if (!program.data) return;
    try {
      await setProgramStartDate.mutateAsync({
        id: program.data.id,
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

  // preCalibrationPhase: an AI-generated program committed to a future start
  // date. Full-screen takeover like the calibration walkthrough below, but
  // this one takes precedence - the walkthrough gate is only reachable once
  // today >= startDate, so the two can never both fire on the same render.
  if (!program.isLoading && isPreCalibrationLocked(program.data, new Date())) {
    return (
      <DashboardShell>
        <BrandMark />
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/65">{greet()}</p>
          <h1 className={`${DASHBOARD_TITLE_CLASS} mt-1`}>{profile?.name || user?.firstName || "Coach"}</h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-[26px] bg-card p-5 space-y-4"
          data-testid="card-pre-calibration-lock"
        >
          <p className="text-sm leading-relaxed text-foreground">
            You chose to start on {format(parseLocalDateString(program.data!.startDate!), "EEE, MMM d")} but you can start today.
          </p>
          <button
            onClick={handleStartToday}
            disabled={setProgramStartDate.isPending}
            className="h-[52px] px-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm uppercase tracking-[0.06em] hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="button-start-today"
          >
            {setProgramStartDate.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Start today
          </button>
        </motion.div>
      </DashboardShell>
    );
  }

  // One-time, full-screen: shows in place of the dashboard the first time a
  // client is living in an active calibration window (see lib/calibration.ts).
  if (
    profile &&
    !isIndependent &&
    shouldShowCalibrationWalkthrough(programsQuery.data ?? [], profile.onboardingCompletedAt, profile.calibrationWalkthroughSeenAt, new Date())
  ) {
    const groups = buildCalibrationGroups(buildPhaseRanges(programsQuery.data ?? [], profile.onboardingCompletedAt));
    const activeGroup = findCalibrationGroup(groups, new Date())!;
    return <CalibrationWalkthrough calibrationStart={activeGroup.start} />;
  }

  const showCheckinBanner = (() => {
    if (isIndependent) return false;
    if (profileQuery.isLoading || latestCheckin.isLoading) return false;
    // No AI program means AI coaching was never set up (e.g. the user switched
    // over from Independent mode without generating one). The weekly check-in
    // has nothing to adjust and its submit would 400, so don't invite them in.
    if (program.isLoading || !program.data) return false;
    if (!profile?.onboardingCompletedAt) return false;

    const daysSinceOnboarding = daysSince(profile.onboardingCompletedAt);
    if (daysSinceOnboarding < 6) return false;

    if (!latestCheckin.data) return true;

    const daysSinceCheckin = daysSince(latestCheckin.data.submittedAt);
    return daysSinceCheckin >= 7;
  })();

  const recentPrCount = (personalRecords.data ?? []).filter((pr) => daysSince(pr.date) <= 7).length;

  // The session the client is up to: the one after whatever they last finished,
  // not simply day one. Drives the greeting line and the CTA alike.
  const nextDay = nextSessionDay(
    (program.data?.days ?? []) as any[],
    workoutsQuery.data?.[0]?.dayNumber,
  ) as any;

  // The hero renders one of three things - Start workout, the build/generate
  // link, or nothing - so the second step points at whichever is actually
  // there. Anchoring it at a ref that never gets attached would stall the
  // tour on a step it can't measure.
  const heroTourStep: CoachmarkStep | null = nextDay
    ? { target: tourStartWorkoutRef, text: "Tap here to log today's workout." }
    : !program.data
    ? {
        target: tourBuildProgramRef,
        text: isIndependent
          ? "You don't have a program yet - this is your shortcut to build one."
          : "You don't have a program yet - this is your shortcut to generate one.",
      }
    : null;

  const dashboardTourSteps: CoachmarkStep[] = [
    { target: tourDailyCheckinRef, text: "This is your daily check-in that you need to do every day." },
    ...(heroTourStep ? [heroTourStep] : []),
    { target: tourProgressRef, text: "And down here you can track your progress." },
    // A clear end rather than the tour simply vanishing on the last tap: it
    // says the dashboard leg is over and names what comes next, so the hand-off
    // to the program page reads as the end of something.
    {
      kind: "center",
      text: "That's your dashboard - check in daily, and your week fills itself in as you log. One last stop: your program.",
    },
    { kind: "navClick", target: programNavTarget, text: "This is where you'll find your programs — tap it to continue." },
  ];
  const resolvedDashboardSteps = resolveTourSteps("dashboard", dashboardTourSteps, showDashboardTour);
  const resolvedCalendarSteps = resolveTourSteps("calendar", calendarPromptSteps, showCalendarPrompt);

  // No program has been generated yet (e.g. "Generate program later" during
  // onboarding) - daily targets don't exist yet, so today's check-in is
  // locked until a program exists.
  const dailyCheckinLocked = !program.isLoading && !program.data;

  const weightUnit = profile?.weightUnit ?? "kg";
  const goal = goalProgress.data;
  const kgToGo = goal?.goalWeight != null ? Math.abs(goal.currentTrendWeight - goal.goalWeight) : null;

  const displayName = profile?.name || user?.firstName || "Coach";
  // Phases (calibration, bulk, ...) only exist in the AI lineage - never label
  // an independent-mode dashboard with one, even if a stale AI program is still
  // resolvable for this user.
  const heroPhase = !isIndependent ? program.data?.shortTermPhase ?? null : null;

  return (
    <DashboardShell>
      {/* The week on an arc at the very top, with the brand opposite "Full
          month" - the calendar row from the reference. Tapping a day opens
          its numbers, as before. */}
      <WeekStrip
        program={program.data}
        weekLogs={weekLogs.data}
        workouts={workoutsQuery.data ?? []}
        weekStartStr={weekStartStr}
        todayStr={todayStr}
        weightUnit={weightUnit}
        isIndependent={isIndependent}
        isLoading={weekLogs.isLoading || program.isLoading}
        calendarLinkRef={tourCalendarLinkRef}
        header={<BrandMark />}
      />

      {/* Greeting, straight on the wash - no card of its own */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-end justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/65">{greet()}</p>
          <h1 className={`${DASHBOARD_TITLE_CLASS} mt-1 truncate`} data-testid="text-greeting">
            {displayName}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1.5" data-testid="text-greeting-line">
            {program.data && nextDay
              ? greetingLine(nextDay.label)
              : stats.data
              ? `Week ${stats.data.currentWeek} of your program.`
              : "Start logging your workouts here and get to work."}
          </p>
        </div>
        {heroPhase && (
          <span className="mb-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
            {/* The phase colour survives as a small signal only. */}
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: phaseSolid(heroPhase) }} />
            {heroPhase.replace(/_/g, " ")}
          </span>
        )}
      </motion.div>

      {/* Hero: the week's numbers, then the primary action as a bottom-sheet row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.04 }}
        className="rounded-[30px] bg-card overflow-hidden"
        data-testid="card-todays-session"
      >
        <div className="flex py-4">
          <div className="flex-1 min-w-0 px-2 text-center" data-testid="stat-current-week">
            <div className="text-2xl font-light tracking-[-0.02em] text-foreground tabular-nums">
              {stats.isLoading ? "-" : stats.data?.currentWeek ?? "-"}
            </div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">Current week</div>
          </div>
          <div className="flex-1 min-w-0 px-2 text-center border-l border-border" data-testid="card-progression">
            <div className="text-2xl font-light tracking-[-0.02em] text-foreground tabular-nums">
              {personalRecords.isLoading ? "-" : recentPrCount}
            </div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">PRs this week</div>
          </div>
        </div>

        {program.isLoading ? (
          <div className="mx-2 mb-2 h-[76px] rounded-3xl bg-secondary" aria-hidden />
        ) : !program.data ? (
          <Link
            href="/program"
            ref={tourBuildProgramRef}
            className={HERO_ACTION_CLASS}
            data-testid="link-build-program"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {isIndependent ? "Build your program" : "Generate a program"}
              </span>
              <span className="block text-[12.5px] text-muted-foreground mt-0.5 truncate">
                {isIndependent ? "Set up your training days" : "Your coach writes it from your answers"}
              </span>
            </span>
            <span className={HERO_ACTION_CIRCLE_CLASS}>
              <ChevronRight className="w-5 h-5" strokeWidth={1.8} />
            </span>
          </Link>
        ) : nextDay ? (
          // To the program page, not straight to /log: a session only starts
          // from the day's Start workout button there, so linking into the
          // logger would land on its "nothing in progress" idle screen.
          <Link href="/program">
            <button ref={tourStartWorkoutRef} className={HERO_ACTION_CLASS} data-testid="button-start-workout">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground">
                  Start workout
                </span>
                {/* Named, so the row says which session it opens; a long label
                    truncates rather than pushing the play button off the card. */}
                <span className="block text-[12.5px] text-muted-foreground mt-0.5 truncate">{nextDay.label}</span>
              </span>
              <span className={HERO_ACTION_CIRCLE_CLASS}>
                <Play className="w-5 h-5 fill-current" strokeWidth={1.6} />
              </span>
            </button>
          </Link>
        ) : null}
      </motion.div>

      {/* Check-in banner - AI mode only, after day 6 */}
      {showCheckinBanner && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-[22px] bg-card py-3.5 pl-5 pr-3.5"
          data-testid="checkin-banner"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Time for your weekly check-in</p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground mt-0.5">
              Your AI coach will adjust next week's program based on your answers
            </p>
          </div>
          <Link
            href="/checkin"
            className="h-9 shrink-0 inline-flex items-center rounded-full bg-primary px-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="link-checkin"
          >
            Start
          </Link>
        </motion.div>
      )}

      {/* This week narrative */}
      {!isIndependent && program.data?.aiGenerated && (program.data?.shortTermPhase || program.data?.dailyCalorieTarget != null || program.data?.dailyStepTarget != null) && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          data-testid="card-week-narrative"
        >
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className={`${SECTION_TITLE_CLASS} capitalize flex items-center gap-2 min-w-0`}>
              {program.data.shortTermPhase && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: phaseSolid(program.data.shortTermPhase) }} />
              )}
              <span className="truncate">{program.data.shortTermPhase?.replace(/_/g, " ") ?? "This week"}</span>
            </h2>
            {program.data.weekInPhase != null && (
              <span className="text-[12.5px] text-muted-foreground whitespace-nowrap">
                Week {program.data.weekInPhase}
                {program.data.phaseTotalWeeks != null ? ` of ${program.data.phaseTotalWeeks}` : ""}
              </span>
            )}
          </div>
          <dl className="rounded-[26px] bg-card overflow-hidden">
            {program.data.dailyCalorieTarget != null && (
              <GroupedRow label="Calorie target" value={`${program.data.dailyCalorieTarget.toLocaleString()} kcal / day`} />
            )}
            {program.data.dailyStepTarget != null && (
              <GroupedRow label="Step target" value={`${program.data.dailyStepTarget.toLocaleString()} steps / day`} />
            )}
          </dl>
        </motion.section>
      )}

      {/* Your targets - Independent mode's editable stand-in for the AI narrative
          above. Phases only exist in the AI lineage, so this is where an
          independent user declares (and edits) their own phase/calorie/step/
          cardio targets. */}
      {isIndependent && profile && <IndependentTargetsCard profile={profile} />}

      {/* Daily check-in */}
      <motion.section
        ref={tourDailyCheckinRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        data-testid="card-daily-checkin"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className={SECTION_TITLE_CLASS}>Today's check-in</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] whitespace-nowrap ${
              loggedCount === 4 ? "bg-white text-black" : "bg-secondary text-muted-foreground"
            }`}
          >
            {loggedCount}/4 logged
          </span>
        </div>
        <div className="rounded-[26px] bg-card p-3">
          {dailyCheckinLocked && (
            <p className="px-2 pt-1 pb-3 text-[12.5px] text-muted-foreground" data-testid="text-checkin-locked">
              Generate a program to start logging your daily check-in.
            </p>
          )}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 ${dailyCheckinLocked ? "opacity-50" : ""}`}>
            <CheckinTile label="Weight" done={todayEntry?.weight != null} error={!!checkinWeightError}>
              <input
                type="number"
                step="0.1"
                // Decimal keypad on a phone: bodyweight is 82.5, not 82.
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="0.0"
                disabled={dailyCheckinLocked}
                className={CHECKIN_INPUT_CLASS}
                data-testid="input-checkin-weight"
              />
              <span className="text-xs text-muted-foreground shrink-0">{weightUnit}</span>
            </CheckinTile>
            <CheckinTile label="Calories" done={todayEntry?.calories != null} error={!!checkinCaloriesError}>
              <input
                type="number"
                inputMode="numeric"
                value={caloriesInput}
                onChange={(e) => setCaloriesInput(e.target.value)}
                placeholder="0"
                disabled={dailyCheckinLocked}
                className={CHECKIN_INPUT_CLASS}
                data-testid="input-checkin-calories"
              />
              <span className="text-xs text-muted-foreground shrink-0">kcal</span>
            </CheckinTile>
            <CheckinTile label="Steps" done={todayEntry?.steps != null} error={!!checkinStepsError}>
              <input
                type="number"
                inputMode="numeric"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                placeholder="0"
                disabled={dailyCheckinLocked}
                className={CHECKIN_INPUT_CLASS}
                data-testid="input-checkin-steps"
              />
            </CheckinTile>
            <CheckinTile label="Cardio" done={todayEntry?.cardioType != null} error={!!checkinCardioMinutesError}>
              <select
                value={cardioTypeInput}
                onChange={(e) => setCardioTypeInput(e.target.value)}
                disabled={dailyCheckinLocked}
                className="flex-1 min-w-0 h-8 bg-transparent text-[15px] focus:outline-none disabled:cursor-not-allowed"
                data-testid="select-checkin-cardio-type"
              >
                <option value="">None</option>
                {CARDIO_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                value={cardioMinutesInput}
                onChange={(e) => setCardioMinutesInput(e.target.value)}
                placeholder="min"
                disabled={dailyCheckinLocked}
                className="w-11 shrink-0 bg-transparent text-[15px] text-right tabular-nums focus:outline-none disabled:cursor-not-allowed"
                data-testid="input-checkin-cardio-minutes"
              />
            </CheckinTile>
          </div>
          {/* One line for the whole row - only ever one field is wrong at a time in
              practice, and four columns have no room for their own error text. */}
          {(checkinWeightError || checkinCaloriesError || checkinStepsError || checkinCardioMinutesError) && (
            <p className="px-2 pt-2.5 text-xs font-medium text-destructive" data-testid="text-checkin-error">
              {checkinWeightError ?? checkinCaloriesError ?? checkinStepsError ?? checkinCardioMinutesError}
            </p>
          )}
          <button
            onClick={handleSaveDailyCheckin}
            disabled={submitDailyCheckin.isPending || dailyCheckinLocked || checkinHasError}
            className="mt-3 h-[52px] w-full rounded-full bg-primary px-8 text-sm font-semibold uppercase tracking-[0.06em] text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-save-checkin"
          >
            {submitDailyCheckin.isPending ? "Saving..." : "Save today's check-in"}
          </button>
        </div>
      </motion.section>

      {/* Progress toward goal */}
      <motion.section
        ref={tourProgressRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        data-testid="card-progress"
      >
        <h2 className={`${SECTION_TITLE_CLASS} mb-3`}>Progress toward goal</h2>
        <div className="rounded-[26px] bg-card p-5">
          {goalProgress.isLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : !goal ? (
            <div className="text-center py-6 text-muted-foreground text-[12.5px]">Log your bodyweight to start tracking progress</div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[40px] font-light leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {goal.currentTrendWeight.toFixed(1)}
                    <span className="ml-1 text-[15px] tracking-normal text-muted-foreground">{weightUnit}</span>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground mt-2">
                    Trend weight
                  </div>
                </div>
                {goal.goalWeight != null && kgToGo != null && (
                  <div className="text-right shrink-0">
                    <div className="text-xl font-light tracking-[-0.01em] text-foreground tabular-nums">
                      {kgToGo.toFixed(1)} {weightUnit}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground mt-1">to go</div>
                  </div>
                )}
              </div>

              {goal.goalWeight != null && goal.percentToGoal != null && (
                <>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden mt-5 mb-2.5">
                    <div className="h-full rounded-full bg-white" style={{ width: `${goal.percentToGoal}%` }} />
                  </div>
                  <div className="flex items-start justify-between gap-2 text-[11.5px] text-muted-foreground">
                    <span className="flex flex-col">
                      <span className="text-[13px] font-medium text-foreground">{goal.startWeight} {weightUnit}</span>
                      <span>started {format(parseLocalDateString(goal.startDate), "MMM d")}</span>
                    </span>
                    <span className="self-center">{Math.round(goal.percentToGoal)}% there</span>
                    <span className="flex flex-col items-end text-right">
                      <span className="text-[13px] font-medium text-foreground">{goal.goalWeight} {weightUnit}</span>
                      <span>{goal.targetDate ? `~${format(parseLocalDateString(goal.targetDate), "MMM d")} at this rate` : "still calibrating"}</span>
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </motion.section>

      {/* Steps whose target isn't on the page (a nav tab that no longer exists)
          are dropped rather than left pointing at nothing - see useTourSteps. */}
      {resolvedDashboardSteps.length > 0 && (
        <CoachmarkTour
          steps={resolvedDashboardSteps}
          onDone={finishDashboardTour}
          testIdPrefix="dashboard-tour"
          intro={{ text: "We're starting a quick tour to show you how the app works." }}
        />
      )}

      {resolvedCalendarSteps.length > 0 && (
        <CoachmarkTour steps={resolvedCalendarSteps} onDone={skipCalendarLeg} testIdPrefix="calendar-prompt" />
      )}
    </DashboardShell>
  );
}

// ---- Sessions pieces (see TrainientAppDesign.md) ----

const DASHBOARD_TITLE_CLASS = "text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground";
const SECTION_TITLE_CLASS = "text-[21px] font-light tracking-[-0.01em] text-foreground";
const HERO_ACTION_CLASS =
  "mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-3xl bg-secondary py-3 pl-5 pr-3 text-left transition-colors hover:bg-accent";
const HERO_ACTION_CIRCLE_CLASS =
  "grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-black";
const CHECKIN_INPUT_CLASS =
  "flex-1 min-w-0 w-full bg-transparent text-2xl font-light tracking-[-0.02em] tabular-nums placeholder:text-muted-foreground/50 focus:outline-none disabled:cursor-not-allowed";

// Every state of the route sits in here so the dashboard never flashes the
// old navy theme. The wash is the grey-to-teal light behind the date arc and
// greeting; it reaches up under the phone's status bar and fades into black.
function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-sessions relative min-h-screen overflow-hidden bg-background text-foreground -mt-[env(safe-area-inset-top)] pt-[env(safe-area-inset-top)]">
      <div className="sessions-wash absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="relative mx-auto max-w-3xl space-y-6 p-6">{children}</div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex items-center gap-[7px]">
      <img src={intentSun} alt="" className="h-5 w-5" />
      <span className="text-base font-normal tracking-[-0.005em] text-white">Intent</span>
    </span>
  );
}

// An inset-grouped row: the hairline starts at the text inset, the last row has none.
function GroupedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="group flex items-center pl-5">
      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[15px] pr-5 group-last:border-b-0">
        <dt className="min-w-0 flex-1 truncate text-[15px] text-foreground">{label}</dt>
        <dd className="whitespace-nowrap text-[15px] text-muted-foreground">{value}</dd>
      </div>
    </div>
  );
}

function CheckinTile({
  label,
  done,
  error,
  children,
}: {
  label: string;
  done: boolean;
  error: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`block min-w-0 rounded-[22px] bg-secondary px-3.5 py-3 ${
        error ? "ring-1 ring-destructive" : "focus-within:ring-1 focus-within:ring-white/40"
      }`}
    >
      <span className="flex items-center gap-1 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
        {done && <Check className="h-3 w-3 text-chart-2" strokeWidth={2} />}
      </span>
      <span className="mt-1.5 flex items-center gap-1.5">{children}</span>
    </label>
  );
}
