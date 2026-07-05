import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, workoutLogsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { GetStrengthProgressQueryParams } from "@workspace/api-zod";

const router = Router();

type LoggedSet = {
  weight: number;
  reps?: number | null;
  repsLeft?: number | null;
  repsRight?: number | null;
  completed?: boolean;
};
type LoggedExercise = { name: string; muscle: string; sets: LoggedSet[] };

// A set counts once it has any logged data — we do NOT require the user to have
// pressed the "complete" check, since most sets are logged without it.
function isPerformed(s: LoggedSet): boolean {
  return (s.weight || 0) > 0 || (s.reps || 0) > 0 || (s.repsLeft || 0) > 0 || (s.repsRight || 0) > 0;
}

function setReps(s: LoggedSet): number {
  if (s.reps != null) return s.reps || 0;
  // Unilateral: use the lower side for a conservative rep count.
  if (s.repsLeft != null || s.repsRight != null) return Math.min(s.repsLeft || 0, s.repsRight || 0);
  return 0;
}

function maxWeight(sets: LoggedSet[]): number {
  const ws = sets.filter(isPerformed).map((s) => s.weight || 0);
  return ws.length ? Math.max(0, ...ws) : 0;
}

// Estimated one-rep max (Epley-style) — PRs are judged on this, not raw
// weight, so a heavier low-rep set and a lighter high-rep set can be compared.
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Maps the program's muscle options to the MuscleVolumeWeek keys.
const MUSCLE_KEY: Record<string, string> = {
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
};

// Loose fallback for legacy/free-text muscle values from older logs.
function muscleKeyOf(muscle: string): string | null {
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
  return null;
}

router.get("/progress/volume", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const weekMap: Record<number, { totalSets: number; totalReps: number }> = {};
  for (const log of logs) {
    const week = log.weekNumber;
    if (!weekMap[week]) weekMap[week] = { totalSets: 0, totalReps: 0 };
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      const performed = ex.sets.filter(isPerformed);
      weekMap[week].totalSets += performed.length;
      weekMap[week].totalReps += performed.reduce((acc, s) => acc + setReps(s), 0);
    }
  }

  const result = Object.entries(weekMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([week, data]) => ({ week: Number(week), ...data }));

  res.json(result);
});

router.get("/progress/strength", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = GetStrengthProgressQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "exercise query param required" });
    return;
  }
  const exerciseName = parsed.data.exercise.toLowerCase();

  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const points: { date: string; maxWeight: number; exercise: string }[] = [];
  for (const log of logs) {
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      if (ex.name.toLowerCase().includes(exerciseName)) {
        const maxW = maxWeight(ex.sets);
        if (maxW > 0) {
          points.push({ date: log.date, maxWeight: maxW, exercise: ex.name });
        }
      }
    }
  }

  res.json(points.sort((a, b) => a.date.localeCompare(b.date)));
});

router.get("/progress/prs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const prMap: Record<string, { maxWeight: number; reps: number; date: string; score: number }> = {};
  for (const log of logs) {
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      // Best performed set for this exercise in this session, judged by
      // estimated one-rep max rather than raw weight (keeps its reps).
      let best: LoggedSet | null = null;
      let bestScore = 0;
      for (const s of ex.sets) {
        if (!isPerformed(s)) continue;
        const score = estimatedOneRepMax(s.weight || 0, setReps(s));
        if (score > bestScore) {
          best = s;
          bestScore = score;
        }
      }
      if (best && bestScore > 0 && (!prMap[ex.name] || bestScore > prMap[ex.name].score)) {
        prMap[ex.name] = { maxWeight: best.weight || 0, reps: setReps(best), date: log.date, score: bestScore };
      }
    }
  }

  res.json(
    Object.entries(prMap).map(([exercise, { maxWeight, reps, date }]) => ({ exercise, maxWeight, reps, date }))
  );
});

router.get("/progress/muscle-volume", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const emptyWeek = () => ({
    chest: 0, shoulders: 0, biceps: 0, triceps: 0, upperBack: 0,
    lats: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0,
  });

  const weekMap: Record<number, ReturnType<typeof emptyWeek>> = {};
  for (const log of logs) {
    const week = log.weekNumber;
    if (!weekMap[week]) weekMap[week] = emptyWeek();
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      const performed = ex.sets.filter(isPerformed).length;
      if (performed === 0) continue;
      const key = muscleKeyOf(ex.muscle);
      if (key && key in weekMap[week]) {
        (weekMap[week] as Record<string, number>)[key] += performed;
      }
    }
  }

  const result = Object.entries(weekMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([week, data]) => ({ week: Number(week), ...data }));

  res.json(result);
});

router.get("/progress/exercises", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const names = new Set<string>();
  for (const log of logs) {
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      names.add(ex.name);
    }
  }

  res.json([...names].sort());
});

export default router;
