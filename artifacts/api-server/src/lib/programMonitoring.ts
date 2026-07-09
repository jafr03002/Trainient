// Shared by /programs/generate and /checkins — the "server-computed" half of
// the program monitoring parameters (the rest come from Claude's structured
// output, see programSchema.ts). Kept out of the AI's hands because they're
// either a trivial deterministic mapping or arithmetic Claude doesn't need to
// be asked to get right.

export function longTermPhaseFor(goal: string): "gain_weight" | "lose_weight" | "maintain" {
  if (goal === "gain_weight" || goal === "lose_weight") return goal;
  return "maintain";
}

export function trainingWorkloadFor(days: { exercises: { sets: number }[] }[]) {
  return {
    daysTrained: days.length,
    totalVolumeSets: days.reduce((sum, d) => sum + d.exercises.reduce((s, e) => s + e.sets, 0), 0),
  };
}

export function cardioIntensityFrom(raw: { bpm_min: number; bpm_max: number; level: string } | null | undefined) {
  if (!raw) return null;
  return { bpmMin: raw.bpm_min, bpmMax: raw.bpm_max, level: raw.level };
}
