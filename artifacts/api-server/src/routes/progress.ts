import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, workoutLogsTable, bodyweightLogsTable, userProfilesTable } from "@workspace/db";
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

// A set counts once it has any logged data - we do NOT require the user to have
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

// Estimated one-rep max (Epley-style) - PRs are judged on this, not raw
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
  core: "core",
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
  if (m.includes("core") || m.includes("abs") || m.includes("abdom") || m.includes("oblique")) return "core";
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

  // Best performed set per exercise for each session, judged by estimated
  // one-rep max rather than raw weight (keeps its reps), tagged with when it
  // was logged so we can order sessions chronologically below.
  type SessionBest = { maxWeight: number; reps: number; date: string; createdAt: number; score: number };
  const perExercise: Record<string, SessionBest[]> = {};
  for (const log of logs) {
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
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
      if (best && bestScore > 0) {
        (perExercise[ex.name] ??= []).push({
          maxWeight: best.weight || 0,
          reps: setReps(best),
          date: log.date,
          createdAt: log.createdAt.getTime(),
          score: bestScore,
        });
      }
    }
  }

  // A set is only a PR once it beats a set from an earlier session - the first
  // time an exercise is ever logged just establishes a baseline, it is not a
  // PR. Walk each exercise's sessions oldest-first, tracking the running best;
  // the current PR is the most recent session whose best beat everything
  // before it (also the all-time best). Exercises that never beat their opening
  // session are omitted entirely.
  const prs: { exercise: string; maxWeight: number; reps: number; date: string }[] = [];
  for (const [exercise, sessions] of Object.entries(perExercise)) {
    sessions.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    let runningBest = 0;
    let current: SessionBest | null = null;
    for (const s of sessions) {
      if (runningBest > 0 && s.score > runningBest) current = s;
      if (s.score > runningBest) runningBest = s.score;
    }
    if (current) {
      prs.push({ exercise, maxWeight: current.maxWeight, reps: current.reps, date: current.date });
    }
  }

  res.json(prs);
});

router.get("/progress/muscle-volume", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const emptyWeek = () => ({
    chest: 0, shoulders: 0, biceps: 0, triceps: 0, upperBack: 0,
    lats: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0, core: 0,
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

router.get("/progress/bodyweight", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.bodyweightLogsTable.findMany({
    where: eq(bodyweightLogsTable.userId, userId),
  });

  const points = logs.map((log) => ({ date: log.date, weight: log.weight }));
  res.json(points.sort((a, b) => a.date.localeCompare(b.date)));
});

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// Average of whichever logged weights fall in the `windowDays`-day window
// ending on `endDate` (inclusive) - null if nothing was logged in that span,
// since logging isn't guaranteed to be daily.
function averageInWindow(
  logs: { date: string; weight: number }[],
  endDate: string,
  windowDays: number,
): number | null {
  const end = new Date(endDate).getTime();
  const start = end - (windowDays - 1) * 24 * 60 * 60 * 1000;
  const inWindow = logs.filter((l) => {
    const t = new Date(l.date).getTime();
    return t >= start && t <= end;
  });
  if (!inWindow.length) return null;
  return inWindow.reduce((sum, l) => sum + l.weight, 0) / inWindow.length;
}

router.get("/progress/goal", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const [logs, profile] = await Promise.all([
    db.query.bodyweightLogsTable.findMany({ where: eq(bodyweightLogsTable.userId, userId) }),
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
  ]);
  if (!logs.length) {
    res.status(404).json({ error: "No bodyweight logged yet" });
    return;
  }

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const startWeight = sorted[0]!.weight;
  const startDate = sorted[0]!.date;
  const lastDate = sorted[sorted.length - 1]!.date;
  const currentTrendWeight = averageInWindow(sorted, lastDate, 7) ?? sorted[sorted.length - 1]!.weight;

  const goalWeight = profile?.goalWeight ?? null;

  let percentToGoal: number | null = null;
  if (goalWeight != null && goalWeight !== startWeight) {
    const raw = ((currentTrendWeight - startWeight) / (goalWeight - startWeight)) * 100;
    percentToGoal = Math.max(0, Math.min(100, raw));
  }

  // 14-day trailing rate: two 7-day rolling averages 14 days apart, so the
  // projection reacts to the client's actual recent rate rather than the
  // full-journey average - see the "ETA calc" design discussion. Needs at
  // least 14 days between the first and most recent log to mean anything.
  let targetDate: string | null = null;
  if (goalWeight != null && daysBetween(startDate, lastDate) >= 14) {
    const priorWindowEnd = addDaysToDateString(lastDate, -14);
    const priorTrendWeight = averageInWindow(sorted, priorWindowEnd, 7);
    if (priorTrendWeight != null) {
      const ratePerDay = (priorTrendWeight - currentTrendWeight) / 14; // positive = losing, negative = gaining
      const remaining = currentTrendWeight - goalWeight; // positive = needs to lose more, negative = needs to gain more
      const movingTowardGoal = remaining !== 0 && ratePerDay !== 0 && Math.sign(remaining) === Math.sign(ratePerDay);
      if (movingTowardGoal) {
        const daysNeeded = Math.abs(remaining / ratePerDay);
        if (Number.isFinite(daysNeeded)) {
          targetDate = addDaysToDateString(lastDate, Math.round(daysNeeded));
        }
      }
    }
  }

  res.json({ startWeight, startDate, currentTrendWeight, goalWeight, percentToGoal, targetDate });
});

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (24 * 60 * 60 * 1000));
}

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
