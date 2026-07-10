import { useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CalendarCheck, Trophy, ArrowRight, ChevronRight, Scale } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWorkoutStats,
  useGetCurrentProgram,
  useGetLatestCheckin,
  useGetRecentWorkouts,
  useGetPersonalRecords,
  useGetProfile,
  useGetTodaysBodyweight,
  useLogBodyweight,
  getGetTodaysBodyweightQueryKey,
  getGetBodyweightProgressQueryKey,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Local calendar date, not UTC - so logging just after midnight lands on the
// day the user actually sees, not a day that already rolled over server-side.
function todayDateString(): string {
  const d = new Date();
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

export default function Dashboard() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const stats = useGetWorkoutStats();
  const program = useGetCurrentProgram();
  const latestCheckin = useGetLatestCheckin();
  const recentWorkouts = useGetRecentWorkouts();
  const personalRecords = useGetPersonalRecords();
  const profileQuery = useGetProfile();

  const profile = profileQuery.data;
  const isIndependent = profile?.mode === "independent";

  // Works identically in both modes - bodyweight is a body metric, not a
  // program concern, so it isn't gated by Independent/AI mode like the rest
  // of this page.
  const todayStr = todayDateString();
  const todaysBodyweight = useGetTodaysBodyweight({ date: todayStr });
  const logBodyweight = useLogBodyweight();
  const [bodyweightDialogOpen, setBodyweightDialogOpen] = useState(false);
  const [bodyweightInput, setBodyweightInput] = useState("");

  function openBodyweightDialog() {
    setBodyweightInput(todaysBodyweight.data ? String(todaysBodyweight.data.weight) : "");
    setBodyweightDialogOpen(true);
  }

  async function handleSaveBodyweight() {
    const weight = parseFloat(bodyweightInput);
    if (!Number.isFinite(weight) || weight <= 0) return;
    await logBodyweight.mutateAsync({ data: { date: todayStr, weight } });
    queryClient.invalidateQueries({ queryKey: getGetTodaysBodyweightQueryKey({ date: todayStr }) });
    queryClient.invalidateQueries({ queryKey: getGetBodyweightProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setBodyweightDialogOpen(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold text-foreground">
          {greet()}, {user?.firstName ?? "Coach"}.
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

      {/* Current phase */}
      {program.data?.aiGenerated && (program.data?.shortTermPhase || program.data?.energyBalance) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09 }}
          className="p-4 rounded-xl bg-card border border-border flex items-center justify-between"
          data-testid="card-program-phase"
        >
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Current phase</div>
            <div className="text-lg font-bold text-foreground capitalize">
              {program.data.shortTermPhase?.replace(/_/g, " ") ?? "-"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Energy balance</div>
            <div className="text-sm font-semibold text-foreground capitalize">
              {program.data.energyBalance?.replace(/_/g, " ") ?? "-"}
            </div>
          </div>
        </motion.div>
      )}

      {/* Bodyweight */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="card-bodyweight"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today's bodyweight</h2>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
              todaysBodyweight.data
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {todaysBodyweight.data ? "Logged" : "Not logged"}
          </span>
        </div>
        {todaysBodyweight.data ? (
          <div className="flex items-end justify-between mt-3">
            <div>
              <div className="text-2xl font-bold text-foreground">
                {todaysBodyweight.data.weight} <span className="text-sm font-medium text-muted-foreground">{todaysBodyweight.data.weightUnit}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Logged at {new Date(todaysBodyweight.data.updatedAt ?? todaysBodyweight.data.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
            <button
              onClick={openBodyweightDialog}
              className="h-9 px-4 rounded-lg border border-border text-sm font-semibold hover:bg-secondary/60 transition-colors"
              data-testid="button-edit-bodyweight"
            >
              Edit
            </button>
          </div>
        ) : (
          <div>
            <p className="text-lg font-bold text-foreground mt-3 mb-4">Add today's bodyweight</p>
            <button
              onClick={openBodyweightDialog}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              data-testid="button-log-bodyweight"
            >
              <Scale className="w-4 h-4" />
              Log weight
            </button>
          </div>
        )}
      </motion.div>

      <Dialog open={bodyweightDialogOpen} onOpenChange={setBodyweightDialogOpen}>
        <DialogContent data-testid="dialog-bodyweight">
          <DialogHeader>
            <DialogTitle>Log today's bodyweight</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weight</label>
            <div className="mt-1.5 flex items-center gap-2 h-12 rounded-xl border border-border bg-secondary/30 px-4 focus-within:border-primary">
              <input
                type="number"
                step="0.1"
                autoFocus
                value={bodyweightInput}
                onChange={(e) => setBodyweightInput(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-xl font-bold tabular-nums focus:outline-none"
                data-testid="input-bodyweight"
              />
              <span className="text-sm text-muted-foreground">{profile?.weightUnit ?? "kg"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Unit follows your profile setting - change it in Settings.</p>
          </div>
          <DialogFooter>
            <button
              onClick={() => setBodyweightDialogOpen(false)}
              className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold hover:bg-secondary/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBodyweight}
              disabled={logBodyweight.isPending || !bodyweightInput}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="button-save-bodyweight"
            >
              {logBodyweight.isPending ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* This week's session */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
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

        {/* Recent sessions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="p-5 rounded-xl bg-card border border-border"
          data-testid="card-recent-sessions"
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Recent sessions</h2>
          {recentWorkouts.isLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : !recentWorkouts.data?.length ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No sessions logged yet</div>
          ) : (
            <div className="space-y-3">
              {recentWorkouts.data.map((w) => {
                const label = (w as any).dayLabel ?? "Workout";
                return (
                  <div key={w.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0" data-testid={`session-${w.id}`}>
                    <div>
                      <div className="text-sm font-medium text-foreground">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(w.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
