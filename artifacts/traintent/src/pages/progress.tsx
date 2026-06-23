import { useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  useGetVolumeProgress,
  useGetStrengthProgress,
  useGetPersonalRecords,
  useGetMuscleVolumeBreakdown,
  useListTrackedExercises,
  getGetStrengthProgressQueryKey,
} from "@workspace/api-client-react";
import { Trophy } from "lucide-react";

// Keys match the MuscleVolumeWeek schema; labels/colours for the 10 muscle options.
const MUSCLE_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "chest", label: "Chest", color: "hsl(217, 91%, 60%)" },
  { key: "shoulders", label: "Shoulders", color: "hsl(280, 68%, 60%)" },
  { key: "biceps", label: "Biceps", color: "hsl(38, 92%, 50%)" },
  { key: "triceps", label: "Triceps", color: "hsl(24, 90%, 55%)" },
  { key: "upperBack", label: "Upper Back", color: "hsl(142, 71%, 45%)" },
  { key: "lats", label: "Lats", color: "hsl(160, 84%, 39%)" },
  { key: "quads", label: "Quads", color: "hsl(0, 72%, 51%)" },
  { key: "hamstrings", label: "Hamstrings", color: "hsl(350, 75%, 55%)" },
  { key: "glutes", label: "Glutes", color: "hsl(316, 73%, 52%)" },
  { key: "calves", label: "Calves", color: "hsl(199, 89%, 48%)" },
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

  const recentPrCount = (personalRecords.data ?? []).filter((pr) => isRecent(pr.date, 7)).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Progress</h1>
            <p className="text-muted-foreground mt-1">Track your strength, volume, and personal records.</p>
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
                domain={[
                  // Lower bound ≈ 75% of the lowest logged weight, rounded to nearest 5.
                  (dataMin: number) => Math.max(0, Math.round((dataMin * 0.75) / 5) * 5),
                  "auto",
                ]}
                allowDecimals={false}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} kg`, "Max weight"]} />
              <Line type="monotone" dataKey="maxWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
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
            Log some workouts to see your personal records
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
