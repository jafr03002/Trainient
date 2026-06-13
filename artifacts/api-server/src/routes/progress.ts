import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, workoutLogsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { GetStrengthProgressQueryParams } from "@workspace/api-zod";

const router = Router();

type LoggedSet = { weight: number; reps: number; completed: boolean };
type LoggedExercise = { name: string; muscle: string; sets: LoggedSet[] };

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
      const completedSets = ex.sets.filter((s) => s.completed);
      weekMap[week].totalSets += completedSets.length;
      weekMap[week].totalReps += completedSets.reduce((acc, s) => acc + (s.reps || 0), 0);
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
        const maxW = Math.max(0, ...ex.sets.filter((s) => s.completed).map((s) => s.weight || 0));
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

  const prMap: Record<string, { maxWeight: number; date: string }> = {};
  for (const log of logs) {
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      const maxW = Math.max(0, ...ex.sets.filter((s) => s.completed).map((s) => s.weight || 0));
      if (maxW > 0) {
        if (!prMap[ex.name] || maxW > prMap[ex.name].maxWeight) {
          prMap[ex.name] = { maxWeight: maxW, date: log.date };
        }
      }
    }
  }

  res.json(
    Object.entries(prMap).map(([exercise, { maxWeight, date }]) => ({ exercise, maxWeight, date }))
  );
});

router.get("/progress/muscle-volume", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
  });

  const muscleMap: Record<string, string> = {
    chest: "chest", pec: "chest",
    back: "back", lat: "back", rhomboid: "back", trap: "back",
    shoulder: "shoulders", delt: "shoulders",
    arm: "arms", bicep: "arms", tricep: "arms",
    leg: "legs", quad: "legs", hamstring: "legs",
    glute: "glutes",
    core: "core", ab: "core",
  };

  const weekMap: Record<number, Record<string, number>> = {};
  for (const log of logs) {
    const week = log.weekNumber;
    if (!weekMap[week]) weekMap[week] = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, glutes: 0, core: 0 };
    for (const ex of log.exercisesLogged as LoggedExercise[]) {
      const completedSets = ex.sets.filter((s) => s.completed).length;
      const muscleLower = (ex.muscle || "").toLowerCase();
      let matched = "back";
      for (const [key, group] of Object.entries(muscleMap)) {
        if (muscleLower.includes(key)) { matched = group; break; }
      }
      if (weekMap[week][matched] !== undefined) weekMap[week][matched] += completedSets;
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
