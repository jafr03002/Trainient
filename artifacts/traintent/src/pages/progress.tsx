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

const MUSCLE_COLORS: Record<string, string> = {
  chest: "hsl(217, 91%, 60%)",
  back: "hsl(142, 71%, 45%)",
  shoulders: "hsl(280, 68%, 60%)",
  arms: "hsl(38, 92%, 50%)",
  legs: "hsl(0, 72%, 51%)",
  glutes: "hsl(316, 73%, 52%)",
  core: "hsl(199, 89%, 48%)",
};

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: 12,
  },
};

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Progress</h1>
        <p className="text-muted-foreground mt-1">Track your strength, volume, and personal records.</p>
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
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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
              {Object.entries(MUSCLE_COLORS).map(([muscle, color]) => (
                <Bar key={muscle} dataKey={muscle} stackId="a" fill={color} radius={[2, 2, 0, 0]} />
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
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">PR Weight</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {personalRecords.data.map((pr) => (
                  <tr key={pr.exercise} className="border-b border-border/40 last:border-0" data-testid={`pr-${pr.exercise.toLowerCase().replace(/\s+/g, "-")}`}>
                    <td className="py-3 text-sm font-medium text-foreground">{pr.exercise}</td>
                    <td className="py-3 text-sm text-right font-bold text-primary">{pr.maxWeight} kg</td>
                    <td className="py-3 text-sm text-right text-muted-foreground">
                      {new Date(pr.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
