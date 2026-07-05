import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CalendarCheck, Trophy, ArrowRight, ChevronRight } from "lucide-react";
import {
  useGetWorkoutStats,
  useGetCurrentProgram,
  useGetLatestCheckin,
  useGetRecentWorkouts,
  useGetPersonalRecords,
  useGetProfile,
} from "@workspace/api-client-react";

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

export default function Dashboard() {
  const { user } = useUser();
  const stats = useGetWorkoutStats();
  const program = useGetCurrentProgram();
  const latestCheckin = useGetLatestCheckin();
  const recentWorkouts = useGetRecentWorkouts();
  const personalRecords = useGetPersonalRecords();
  const profileQuery = useGetProfile();

  const profile = profileQuery.data;
  const isIndependent = profile?.mode === "independent";

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
    ? `New PR${recentPrCount > 1 ? "s" : ""} this week — keep it up!`
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

      {/* Check-in banner — AI mode only, after day 6 */}
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
          <div className="text-2xl font-bold text-foreground">{stats.isLoading ? "—" : stats.data?.currentWeek ?? "—"}</div>
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
          <div className="text-2xl font-bold text-foreground">{personalRecords.isLoading ? "—" : recentPrCount}</div>
          <div className="text-xs text-muted-foreground mt-1">{progressionMessage}</div>
        </motion.div>
      </div>

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
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-lg font-bold text-foreground">{nextDay.label}</span>
                <span className="text-sm text-muted-foreground">{nextDay.focus}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {nextDay.exercises?.length ?? 0} exercises
              </p>
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
