// Shared workout-log math used by both the progress charts (routes/progress.ts)
// and the weekly check-in engine (routes/checkins.ts). Kept in one place so the
// e1RM / muscle-mapping definitions can't drift between the two - the check-in
// engine's Training Evaluation (see lib/knowledge/ti-check-in-engine.md) is
// defined in terms of the exact same e1RM and muscle-volume it charts.

export type LoggedSet = {
  weight: number;
  reps?: number | null;
  repsLeft?: number | null;
  repsRight?: number | null;
  completed?: boolean;
};
export type LoggedExercise = { name: string; muscle: string; sets: LoggedSet[] };

// A minimal view of a workout_logs row - enough for all the analysis here.
export type WorkoutLogRow = {
  date: string;
  weekNumber: number;
  createdAt: Date;
  exercisesLogged: unknown;
};

// A set counts once it has any logged data - we do NOT require the user to have
// pressed the "complete" check, since most sets are logged without it.
export function isPerformed(s: LoggedSet): boolean {
  return (s.weight || 0) > 0 || (s.reps || 0) > 0 || (s.repsLeft || 0) > 0 || (s.repsRight || 0) > 0;
}

export function setReps(s: LoggedSet): number {
  if (s.reps != null) return s.reps || 0;
  // Unilateral: use the lower side for a conservative rep count.
  if (s.repsLeft != null || s.repsRight != null) return Math.min(s.repsLeft || 0, s.repsRight || 0);
  return 0;
}

export function maxWeight(sets: LoggedSet[]): number {
  const ws = sets.filter(isPerformed).map((s) => s.weight || 0);
  return ws.length ? Math.max(0, ...ws) : 0;
}

// Estimated one-rep max (Epley-style) - PRs and check-in progression are judged
// on this, not raw weight, so a heavier low-rep set and a lighter high-rep set
// can be compared. Matches the ti-check-in-engine.md glossary: weight × (1 + reps/30).
export function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Best e1RM across an exercise's performed sets in a single session.
export function sessionBestE1rm(sets: LoggedSet[]): number {
  let best = 0;
  for (const s of sets) {
    if (!isPerformed(s)) continue;
    const score = estimatedOneRepMax(s.weight || 0, setReps(s));
    if (score > best) best = score;
  }
  return best;
}

// Maps the program's muscle options to canonical MuscleVolumeWeek keys.
export const MUSCLE_KEY: Record<string, string> = {
  chest: "chest",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  "upper back": "upperBack",
  lats: "lats",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  core: "core",
};

// Loose fallback for legacy/free-text muscle values from older logs.
export function muscleKeyOf(muscle: string): string | null {
  const m = (muscle || "").toLowerCase().trim();
  if (MUSCLE_KEY[m]) return MUSCLE_KEY[m];
  if (m.includes("chest") || m.includes("pec")) return "chest";
  if (m.includes("shoulder") || m.includes("delt")) return "shoulders";
  if (m.includes("bicep")) return "biceps";
  if (m.includes("tricep")) return "triceps";
  if (m.includes("lat")) return "lats";
  if (m.includes("back") || m.includes("trap") || m.includes("rhomboid")) return "upperBack";
  if (m.includes("quad")) return "quads";
  if (m.includes("ham")) return "hamstrings";
  if (m.includes("glute")) return "glutes";
  if (m.includes("calf") || m.includes("calve")) return "calves";
  if (m.includes("core") || m.includes("abs") || m.includes("abdom") || m.includes("oblique")) return "core";
  return null;
}

export type ExerciseProgression = {
  exercise: string;
  muscle: string;
  sessions: number; // performed sessions of this exercise in the window
  latestE1rm: number;
  prevE1rm: number | null;
  // Consecutive trailing sessions where each session's best e1RM beat the one
  // before it (progressedStreak) or failed to (stalledStreak). RULE 1 triggers
  // fire at 4 (see ti-check-in-engine.md).
  progressedStreak: number;
  stalledStreak: number;
};

// Per-exercise e1RM progression across sessions in `logs`, ordered oldest→newest.
// Only sessions where the exercise was actually performed count; the first ever
// session is a baseline (neither progressed nor stalled). One entry per exercise
// name, sorted by strongest active trigger so the prompt can lead with what matters.
export function exerciseProgressions(logs: WorkoutLogRow[]): ExerciseProgression[] {
  type Best = { score: number; date: string; createdAt: number };
  const perExercise: Record<string, { muscle: string; sessions: Best[] }> = {};

  for (const log of logs) {
    for (const ex of (log.exercisesLogged as LoggedExercise[]) ?? []) {
      const score = sessionBestE1rm(ex.sets ?? []);
      if (score <= 0) continue;
      const entry = (perExercise[ex.name] ??= { muscle: ex.muscle, sessions: [] });
      entry.muscle ||= ex.muscle;
      entry.sessions.push({ score, date: log.date, createdAt: log.createdAt.getTime() });
    }
  }

  const result: ExerciseProgression[] = [];
  for (const [exercise, { muscle, sessions }] of Object.entries(perExercise)) {
    sessions.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    let progressedStreak = 0;
    let stalledStreak = 0;
    for (let i = 1; i < sessions.length; i++) {
      if (sessions[i]!.score > sessions[i - 1]!.score) {
        progressedStreak += 1;
        stalledStreak = 0;
      } else {
        stalledStreak += 1;
        progressedStreak = 0;
      }
    }
    const latest = sessions[sessions.length - 1]!;
    const prev = sessions.length > 1 ? sessions[sessions.length - 2]! : null;
    result.push({
      exercise,
      muscle,
      sessions: sessions.length,
      latestE1rm: Math.round(latest.score * 10) / 10,
      prevE1rm: prev ? Math.round(prev.score * 10) / 10 : null,
      progressedStreak,
      stalledStreak,
    });
  }

  // Lead with the exercises carrying an active RULE 1 signal (longest streaks first).
  return result.sort(
    (a, b) => Math.max(b.stalledStreak, b.progressedStreak) - Math.max(a.stalledStreak, a.progressedStreak),
  );
}

// Working-set volume (Σ weight × reps) per muscle for the most recent training
// week present in `logs` - the "muscle volume" term in the engine glossary.
export function muscleVolumeLatestWeek(logs: WorkoutLogRow[]): { weekNumber: number | null; volume: Record<string, number> } {
  if (logs.length === 0) return { weekNumber: null, volume: {} };
  const latestWeek = Math.max(...logs.map((l) => l.weekNumber));
  const volume: Record<string, number> = {};
  for (const log of logs) {
    if (log.weekNumber !== latestWeek) continue;
    for (const ex of (log.exercisesLogged as LoggedExercise[]) ?? []) {
      const key = muscleKeyOf(ex.muscle) ?? (ex.muscle || "other").toLowerCase();
      for (const s of ex.sets ?? []) {
        if (!isPerformed(s)) continue;
        volume[key] = (volume[key] ?? 0) + (s.weight || 0) * setReps(s);
      }
    }
  }
  return { weekNumber: latestWeek, volume };
}
