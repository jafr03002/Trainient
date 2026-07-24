import { useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  useGetVolumeProgress,
  useGetStrengthProgress,
  useGetPersonalRecords,
  useGetMuscleVolumeBreakdown,
  useListTrackedExercises,
  useGetBodyweightProgress,
  useGetProfile,
  getGetStrengthProgressQueryKey,
} from "@workspace/api-client-react";
import { Trophy } from "lucide-react";
import { MUSCLE_COLORS } from "@/lib/muscles";

// Keys match the MuscleVolumeWeek schema; colours come from the shared
// MUSCLE_COLORS map (keyed by label) so this can't drift out of sync with it.
const MUSCLE_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "chest", label: "Chest", color: MUSCLE_COLORS.Chest },
  { key: "shoulders", label: "Shoulders", color: MUSCLE_COLORS.Shoulders },
  { key: "biceps", label: "Biceps", color: MUSCLE_COLORS.Biceps },
  { key: "triceps", label: "Triceps", color: MUSCLE_COLORS.Triceps },
  { key: "upperBack", label: "Upper Back", color: MUSCLE_COLORS["Upper Back"] },
  { key: "lats", label: "Lats", color: MUSCLE_COLORS.Lats },
  { key: "quads", label: "Quads", color: MUSCLE_COLORS.Quads },
  { key: "hamstrings", label: "Hamstrings", color: MUSCLE_COLORS.Hamstrings },
  { key: "glutes", label: "Glutes", color: MUSCLE_COLORS.Glutes },
  { key: "calves", label: "Calves", color: MUSCLE_COLORS.Calves },
  { key: "core", label: "Core", color: MUSCLE_COLORS.Core },
];

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: 12,
  },
};

function isRecent(dateStr: string, days = 7): boolean {
  const then = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24) <= days;
}

export default function Progress() {
  const [selectedExercise, setSelectedExercise] = useState("");

  const exercises = useListTrackedExercises();
  const volumeProgress = useGetVolumeProgress();
  const strengthProgress = useGetStrengthProgress(
    { exercise: selectedExercise },
    { query: { enabled: !!selectedExercise, queryKey: getGetStrengthProgressQueryKey({ exercise: selectedExercise }) } }
  );
  const personalRecords = useGetPersonalRecords();
  const muscleVolume = useGetMuscleVolumeBreakdown();
  const bodyweightProgress = useGetBodyweightProgress();
  const profileQuery = useGetProfile();
  const weightUnit = profileQuery.data?.weightUnit ?? "kg";
  const goalWeight = profileQuery.data?.goalWeight ?? null;

  const recentPrCount = (personalRecords.data ?? []).filter((pr) => isRecent(pr.date, 7)).length;

  // Strength Y-axis: lower ≈ 75% of the lowest weight, upper at the top weight,
  // both snapped to multiples of 5, with a tick at every 5 in between.
  const strengthBounds = (() => {
    const data = strengthProgress.data ?? [];
    if (!data.length) return null;
    const weights = data.map((p) => p.maxWeight);
    const lower = Math.max(0, Math.round((Math.min(...weights) * 0.75) / 5) * 5);
    const upper = Math.ceil(Math.max(...weights) / 5) * 5;
    const ticks: number[] = [];
    for (let t = lower; t <= upper; t += 5) ticks.push(t);
    return { lower, upper, ticks };
  })();

  // Same lower/upper snapping as the strength chart, just on the bodyweight
  // data's own scale - bodyweight moves in much smaller increments. The goal
  // weight is folded into the range too so its reference line is always drawn
  // inside the frame, even when the goal sits beyond every logged point.
  const bodyweightBounds = (() => {
    const data = bodyweightProgress.data ?? [];
    if (!data.length) return null;
    const weights = data.map((p) => p.weight);
    if (goalWeight != null) weights.push(goalWeight);
    const lower = Math.max(0, Math.round((Math.min(...weights) * 0.95) / 5) * 5);
    const upper = Math.ceil((Math.max(...weights) * 1.05) / 5) * 5;
    const ticks: number[] = [];
    for (let t = lower; t <= upper; t += 5) ticks.push(t);
    return { lower, upper, ticks };
  })();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Progress</h1>
            <p className="text-muted-foreground mt-1">Track your strength, volume, bodyweight, and personal records.</p>
          </div>
          {recentPrCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold">
              <Trophy className="w-4 h-4" />
              {recentPrCount} new PR{recentPrCount > 1 ? "s" : ""} this week
            </div>
          )}
        </div>
      </motion.div>

      {/* Strength chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="chart-strength"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Strength over time</h2>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-secondary/30 text-foreground text-sm focus:outline-none focus:border-primary"
            data-testid="select-exercise"
          >
            <option value="">Select exercise...</option>
            {(exercises.data ?? []).map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </div>

        {!selectedExercise ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            Select an exercise to see strength progress
          </div>
        ) : strengthProgress.isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !strengthProgress.data?.length ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={strengthProgress.data}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                domain={[strengthBounds?.lower ?? 0, strengthBounds?.upper ?? "auto"]}
                ticks={strengthBounds?.ticks}
                allowDecimals={false}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} kg`, "Max weight"]} />
              <Line type="monotone" dataKey="maxWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Bodyweight over time */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.11 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="chart-bodyweight"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">Bodyweight over time</h2>
        {bodyweightProgress.isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !bodyweightProgress.data?.length ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            Log today's bodyweight from the dashboard to start tracking
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={bodyweightProgress.data}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                domain={[bodyweightBounds?.lower ?? 0, bodyweightBounds?.upper ?? "auto"]}
                ticks={bodyweightBounds?.ticks}
                allowDecimals={false}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} ${weightUnit}`, "Bodyweight"]} />
              {goalWeight != null && (
                <ReferenceLine
                  y={goalWeight}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  label={{
                    value: `Goal ${goalWeight} ${weightUnit}`,
                    position: "insideTopRight",
                    fill: "hsl(var(--chart-2))",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              )}
              <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Muscle volume breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="chart-muscle-volume"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">Volume by muscle group</h2>
        {!muscleVolume.data?.length ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={muscleVolume.data}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="week" tickFormatter={(v) => `Wk ${v}`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {MUSCLE_GROUPS.map(({ key, label, color }) => (
                <Bar key={key} dataKey={key} name={label} stackId="a" fill={color} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Personal records */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-5 rounded-xl bg-card border border-border"
        data-testid="table-prs"
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Personal records</h2>
        {!personalRecords.data?.length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Beat a set from an earlier session to earn your first personal record
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">Exercise</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">PR</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {[...(personalRecords.data ?? [])]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((pr) => {
                    const recent = isRecent(pr.date, 7);
                    return (
                      <tr
                        key={pr.exercise}
                        className={`border-b border-border/40 last:border-0 transition-colors ${recent ? "bg-amber-500/5" : ""}`}
                        data-testid={`pr-${pr.exercise.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <td className="py-3 text-sm font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {recent && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 300 }}
                              >
                                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              </motion.div>
                            )}
                            {pr.exercise}
                            {recent && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                                New
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-sm text-right font-bold text-primary">
                          {pr.maxWeight} kg{pr.reps ? <span className="text-muted-foreground font-medium"> × {pr.reps}</span> : null}
                        </td>
                        <td className="py-3 text-sm text-right text-muted-foreground">
                          {new Date(pr.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
