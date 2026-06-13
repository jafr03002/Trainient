import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, workoutLogsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CreateWorkoutBody, ListWorkoutsQueryParams } from "@workspace/api-zod";

const router = Router();

function serializeLog(w: typeof workoutLogsTable.$inferSelect) {
  return {
    ...w,
    exercisesLogged: w.exercisesLogged as object[],
    createdAt: w.createdAt.toISOString(),
  };
}

router.get("/workouts", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = ListWorkoutsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
    orderBy: [desc(workoutLogsTable.createdAt)],
    limit,
    offset,
  });
  res.json(logs.map(serializeLog));
});

router.post("/workouts", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateWorkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [log] = await db
    .insert(workoutLogsTable)
    .values({ userId, ...parsed.data })
    .returning();
  res.status(201).json(serializeLog(log));
});

router.get("/workouts/recent", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
    orderBy: [desc(workoutLogsTable.createdAt)],
    limit: 3,
  });
  res.json(logs.map(serializeLog));
});

router.get("/workouts/stats", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
    orderBy: [desc(workoutLogsTable.createdAt)],
  });

  const totalLogged = logs.length;
  const lastSessionDate = logs[0]?.date ?? null;

  const weekNumbers = [...new Set(logs.map((l) => l.weekNumber))].sort((a, b) => b - a);
  const currentWeek = weekNumbers[0] ?? 1;

  let streakDays = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    if (logs.some((l) => l.date === ds)) {
      streakDays++;
    } else if (i > 0) {
      break;
    }
  }

  res.json({ currentWeek, totalLogged, lastSessionDate, streakDays });
});

router.get("/workouts/by-day-label", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const label = req.query["label"] as string;
  if (!label) {
    res.status(400).json({ error: "label query param required" });
    return;
  }
  const logs = await db.query.workoutLogsTable.findMany({
    where: and(eq(workoutLogsTable.userId, userId), eq(workoutLogsTable.dayLabel, label)),
    orderBy: [desc(workoutLogsTable.createdAt)],
  });
  res.json(logs.map(serializeLog));
});

export default router;
