import { motion } from "framer-motion";
import { MUSCLE_COLORS } from "@/lib/muscles";

type Exercise = { sets: number; muscle: string };
type ProgramDay = { exercises: Exercise[] };

function computeWeeklyVolume(days: ProgramDay[]): { muscle: string; sets: number }[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      totals.set(ex.muscle, (totals.get(ex.muscle) ?? 0) + ex.sets);
    }
  }
  return Array.from(totals.entries())
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export function MuscleVolumeChart({ days }: { days: ProgramDay[] }) {
  const volumes = computeWeeklyVolume(days);
  if (!volumes.length) return null;

  const max = Math.max(...volumes.map((v) => v.sets));

  return (
    <div className="space-y-2.5" data-testid="chart-muscle-volume-onboarding">
      {volumes.map(({ muscle, sets }, i) => (
        <motion.div
          key={muscle}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3"
        >
          <span className="w-24 shrink-0 text-sm text-muted-foreground truncate">{muscle}</span>
          <div className="flex-1 h-2.5 rounded-full bg-secondary/30 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(sets / max) * 100}%`,
                backgroundColor: MUSCLE_COLORS[muscle] ?? "hsl(var(--primary))",
              }}
            />
          </div>
          <span className="w-16 shrink-0 text-sm font-semibold text-foreground text-right">
            {sets} set{sets === 1 ? "" : "s"}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
