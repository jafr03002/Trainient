import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { CalendarCheck, Trophy, ArrowRight, ChevronRight, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWorkoutStats,
  useGetCurrentProgram,
  useGetLatestCheckin,
  useGetPersonalRecords,
  useGetProfile,
  useGetDailyLogsWeek,
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
import { phaseSolid, phaseSoft } from "@/lib/phaseColors";
import { buildPhaseRanges, buildCalibrationGroups, findCalibrationGroup, shouldShowCalibrationWalkthrough, isPreCalibrationLocked, parseLocalDateString } from "@/lib/calibration";
import { CalibrationWalkthrough } from "@/components/calibration/CalibrationWalkthrough";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
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

// Rotates daily rather than on every render/refresh, so it feels like a
// deliberate rotation instead of random flicker.
const START_WORKOUT_LINES = [
  "Ready to start your workout?",
  "Let's get moving.",
  "Time to put in the work.",
  "Your workout is waiting.",
  "Show up. Get stronger.",
];

function startWorkoutLine(): string {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  return START_WORKOUT_LINES[dayOfYear % START_WORKOUT_LINES.length];
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
  const updateProfile = useUpdateProfile();
  const tourDailyCheckinRef = useRef<HTMLDivElement>(null);
  const tourStartWorkoutRef = useRef<HTMLButtonElement>(null);
  const tourProgressRef = useRef<HTMLDivElement>(null);
  const programNavTarget = useNavTourTarget("/program");

  function finishDashboardTour() {
    updateProfile.mutate(
      { data: { dashboardTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
  }

  const profile = profileQuery.data;
  const isIndependent = profile?.mode === "independent";

  const showDashboardTour = !!profile && !profile.dashboardTourSeenAt && !!program.data?.days?.[0];
  useNavTourClick("/program", showDashboardTour ? finishDashboardTour : null);

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

  async function handleSaveDailyCheckin() {
    const weight = weightInput ? parseFloat(weightInput) : undefined;
    const calories = caloriesInput ? parseInt(caloriesInput, 10) : undefined;
    const steps = stepsInput ? parseInt(stepsInput, 10) : undefined;
    const cardioMinutes = cardioMinutesInput ? parseInt(cardioMinutesInput, 10) : undefined;

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
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-2xl font-bold text-foreground">
            {greet()}, {profile?.name || user?.firstName || "Coach"}.
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="p-5 rounded-xl bg-card border border-border space-y-4"
          data-testid="card-pre-calibration-lock"
        >
          <p className="text-foreground">
            You chose to start on {format(parseLocalDateString(program.data!.startDate!), "EEE, MMM d")} but you can start today.
          </p>
          <button
            onClick={handleStartToday}
            disabled={setProgramStartDate.isPending}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="button-start-today"
          >
            {setProgramStartDate.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Start today
          </button>
        </motion.div>
      </div>
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
    if (!profile?.onboardingCompletedAt) return false;

    const daysSinceOnboarding = daysSince(profile.onboardingCompletedAt);
    if (daysSinceOnboarding < 6) return false;

    if (!latestCheckin.data) return true;

    const daysSinceCheckin = daysSince(latestCheckin.data.submittedAt);
    return daysSinceCheckin >= 7;
  })();

  const recentPrCount = (personalRecords.data ?? []).filter((pr) => daysSince(pr.date) <= 7).length;
  const progressionMessage = recentPrCount > 0
    ? `New PR${recentPrCount > 1 ? "s" : ""} this week - keep it up!`
    : "No new PRs yet this week";

  const nextDay = program.data?.days?.[0] as any;
  const dashboardTourSteps: CoachmarkStep[] = [
    { target: tourDailyCheckinRef, text: "This is your daily check-in that you need to do every day." },
    { target: tourStartWorkoutRef, text: "Tap here to log today's workout." },
    { target: tourProgressRef, text: "And down here you can track your progress." },
    { kind: "navClick", target: programNavTarget, text: "This is where you'll find your programs — tap it to continue." },
  ];

  // No program has been generated yet (e.g. "Generate program later" during
  // onboarding) - daily targets don't exist yet, so today's check-in is
  // locked until a program exists.
  const dailyCheckinLocked = !program.isLoading && !program.data;

  const weightUnit = profile?.weightUnit ?? "kg";
  const goal = goalProgress.data;
  const kgToGo = goal?.goalWeight != null ? Math.abs(goal.currentTrendWeight - goal.goalWeight) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold text-foreground">
          {greet()}, {profile?.name || user?.firstName || "Coach"}.
        </h1>
        {stats.data && (
          <p className="text-muted-foreground mt-1">
            Week {stats.data.currentWeek} of your program.
          </p>
        )}
      </motion.div>

      {/* Check-in banner - AI mode only, after day 6 */}
      {showCheckinBanner && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20"
          data-testid="checkin-banner"
        >
          <div>
            <p className="font-semibold text-foreground text-sm">Time for your weekly check-in</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your AI coach will adjust next week's program based on your answers</p>
          </div>
          <Link
            href="/checkin"
            className="flex items-center gap-1.5 text-primary text-sm font-semibold shrink-0 ml-4 hover:text-primary/80 transition-colors"
            data-testid="link-checkin"
          >
            Start <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-card border border-border"
          data-testid="stat-current-week"
        >
          <CalendarCheck className="w-5 h-5 mb-3 text-primary" />
          <div className="text-2xl font-bold text-foreground">{stats.isLoading ? "-" : stats.data?.currentWeek ?? "-"}</div>
          <div className="text-xs text-muted-foreground mt-1">Current week</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="p-4 rounded-xl bg-card border border-border"
          data-testid="card-progression"
        >
          <Trophy className="w-5 h-5 mb-3 text-amber-400" />
          <div className="text-2xl font-bold text-foreground">{personalRecords.isLoading ? "-" : recentPrCount}</div>
          <div className="text-xs text-muted-foreground mt-1">{progressionMessage}</div>
        </motion.div>
      </div>

      {/* This week's program */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.09 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="card-todays-session"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">This week's program</h2>
        {program.isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !program.data ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm mb-3">
              {isIndependent ? "No program built yet" : "No program yet"}
            </p>
            <Link href="/program" className="text-primary text-sm font-semibold hover:underline">
              {isIndependent ? "Build your program" : "Generate one"}
            </Link>
          </div>
        ) : nextDay ? (
          <div>
            <p className="text-lg font-bold text-foreground mb-4">{startWorkoutLine()}</p>
            <Link href="/log">
              <button
                ref={tourStartWorkoutRef}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                data-testid="button-start-workout"
              >
                Start workout
                <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        ) : null}
      </motion.div>

      {/* Weekly table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="card-week-table"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">This week</h2>
        {weekLogs.isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-semibold py-2 pl-1">Day</th>
                  <th className="text-right font-semibold py-2">Calories</th>
                  <th className="text-right font-semibold py-2">Steps</th>
                  <th className="text-center font-semibold py-2">Cardio</th>
                  <th className="text-right font-semibold py-2 pr-1">Phase</th>
                </tr>
              </thead>
              <tbody>
                {weekLogs.data?.days.map((day) => {
                  const isToday = day.date === todayStr;
                  const parsed = parseLocalDateString(day.date);
                  const shortTermPhase = weekLogs.data!.shortTermPhase;
                  return (
                    <tr
                      key={day.date}
                      className={`border-b border-border/50 last:border-0 ${isToday ? "bg-primary/5" : ""}`}
                      data-testid={`week-row-${day.date}`}
                    >
                      <td className={`py-2 pl-1 font-medium ${isToday ? "text-primary" : "text-foreground"}`}>
                        {format(parsed, "EEE d")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {day.calories != null ? day.calories.toLocaleString() : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {day.steps != null ? day.steps.toLocaleString() : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2 text-center">
                        {day.cardioType ? (
                          <Check className="w-3.5 h-3.5 inline text-chart-2" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-1 text-right">
                        {shortTermPhase && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap capitalize"
                            style={{ background: phaseSoft(shortTermPhase), color: phaseSolid(shortTermPhase) }}
                          >
                            {shortTermPhase.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* This week narrative */}
      {program.data?.aiGenerated && (program.data?.shortTermPhase || program.data?.dailyCalorieTarget != null || program.data?.dailyStepTarget != null) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-5 rounded-xl bg-card border-l-4 border border-border"
          style={program.data.shortTermPhase ? { borderLeftColor: phaseSolid(program.data.shortTermPhase) } : undefined}
          data-testid="card-week-narrative"
        >
          <div className="flex items-center gap-1.5 mb-3">
            {program.data.shortTermPhase && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phaseSolid(program.data.shortTermPhase) }} />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">
              {program.data.shortTermPhase?.replace(/_/g, " ") ?? "This week"}
              {program.data.weekInPhase != null &&
                ` - week ${program.data.weekInPhase}${program.data.phaseTotalWeeks != null ? ` of ${program.data.phaseTotalWeeks}` : ""}`}
            </span>
          </div>
          <dl className="space-y-2">
            {program.data.dailyCalorieTarget != null && (
              <div className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                <dt className="text-muted-foreground">Calorie target</dt>
                <dd className="font-semibold text-foreground">{program.data.dailyCalorieTarget.toLocaleString()} kcal / day</dd>
              </div>
            )}
            {program.data.dailyStepTarget != null && (
              <div className="flex items-center justify-between text-sm py-1">
                <dt className="text-muted-foreground">Step target</dt>
                <dd className="font-semibold text-foreground">{program.data.dailyStepTarget.toLocaleString()} steps / day</dd>
              </div>
            )}
          </dl>
        </motion.div>
      )}

      {/* Daily check-in */}
      <motion.div
        ref={tourDailyCheckinRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="card-daily-checkin"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today's check-in</h2>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
              loggedCount === 4
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {loggedCount}/4 logged
          </span>
        </div>
        {dailyCheckinLocked && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-checkin-locked">
            Generate a program to start logging your daily check-in.
          </p>
        )}
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 ${dailyCheckinLocked ? "opacity-50" : ""}`}>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weight</label>
            <div className="mt-1.5 flex items-center gap-1.5 h-12 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
              <input
                type="number"
                step="0.1"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="0.0"
                disabled={dailyCheckinLocked}
                className="flex-1 min-w-0 bg-transparent text-lg font-bold tabular-nums focus:outline-none disabled:cursor-not-allowed"
                data-testid="input-checkin-weight"
              />
              <span className="text-xs text-muted-foreground shrink-0">{weightUnit}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calories</label>
            <div className="mt-1.5 flex items-center gap-1.5 h-12 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
              <input
                type="number"
                value={caloriesInput}
                onChange={(e) => setCaloriesInput(e.target.value)}
                placeholder="0"
                disabled={dailyCheckinLocked}
                className="flex-1 min-w-0 bg-transparent text-lg font-bold tabular-nums focus:outline-none disabled:cursor-not-allowed"
                data-testid="input-checkin-calories"
              />
              <span className="text-xs text-muted-foreground shrink-0">kcal</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps</label>
            <div className="mt-1.5 flex items-center gap-1.5 h-12 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
              <input
                type="number"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                placeholder="0"
                disabled={dailyCheckinLocked}
                className="flex-1 min-w-0 bg-transparent text-lg font-bold tabular-nums focus:outline-none disabled:cursor-not-allowed"
                data-testid="input-checkin-steps"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cardio</label>
            <div className="mt-1.5 flex items-center gap-1 h-12 rounded-xl border border-border bg-secondary/30 px-2 focus-within:border-primary">
              <select
                value={cardioTypeInput}
                onChange={(e) => setCardioTypeInput(e.target.value)}
                disabled={dailyCheckinLocked}
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none disabled:cursor-not-allowed"
                data-testid="select-checkin-cardio-type"
              >
                <option value="">None</option>
                {CARDIO_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                value={cardioMinutesInput}
                onChange={(e) => setCardioMinutesInput(e.target.value)}
                placeholder="min"
                disabled={dailyCheckinLocked}
                className="w-12 shrink-0 bg-transparent text-sm text-right focus:outline-none disabled:cursor-not-allowed"
                data-testid="input-checkin-cardio-minutes"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSaveDailyCheckin}
            disabled={submitDailyCheckin.isPending || dailyCheckinLocked}
            className="h-9 px-5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-save-checkin"
          >
            {submitDailyCheckin.isPending ? "Saving..." : "Save today's check-in"}
          </button>
        </div>
      </motion.div>

      {/* Progress toward goal */}
      <motion.div
        ref={tourProgressRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="card-progress"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Progress toward goal</h2>
        {goalProgress.isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !goal ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Log your bodyweight to start tracking progress</div>
        ) : (
          <>
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-3xl font-bold text-foreground">
                  {goal.currentTrendWeight.toFixed(1)}
                  <span className="text-base font-medium text-muted-foreground"> {weightUnit}</span>
                </div>
              </div>
              {goal.goalWeight != null && kgToGo != null && (
                <div className="text-right">
                  <div className="text-lg font-bold text-chart-2">
                    {kgToGo.toFixed(1)} {weightUnit} to go
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">goal {goal.goalWeight} {weightUnit}</div>
                </div>
              )}
            </div>

            {goal.goalWeight != null && goal.percentToGoal != null && (
              <>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-chart-2" style={{ width: `${goal.percentToGoal}%` }} />
                </div>
                <div className="flex items-start justify-between text-[10px] text-muted-foreground">
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{goal.startWeight} {weightUnit}</span>
                    <span>started {format(parseLocalDateString(goal.startDate), "MMM d")}</span>
                  </span>
                  <span className="self-center">{Math.round(goal.percentToGoal)}% there</span>
                  <span className="flex flex-col items-end">
                    <span className="font-medium text-foreground">{goal.goalWeight} {weightUnit}</span>
                    <span>{goal.targetDate ? `~${format(parseLocalDateString(goal.targetDate), "MMM d")} at this rate` : "still calibrating"}</span>
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </motion.div>

      {showDashboardTour && (
        <CoachmarkTour
          steps={dashboardTourSteps}
          onDone={finishDashboardTour}
          testIdPrefix="dashboard-tour"
          intro={{ text: "We're starting a quick tour to show you how the app works." }}
        />
      )}
    </div>
  );
}
