import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, workoutLogsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CreateWorkoutBody, ListWorkoutsQueryParams } from "@workspace/api-zod";
import { trainingWeekNumber } from "../lib/trainingWeek";

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
  // Compute the week ourselves rather than trusting the client-submitted
  // value — it may be stale (e.g. a page left open across a week boundary).
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  const weekNumber = trainingWeekNumber(profile?.onboardingCompletedAt);
  const [log] = await db
    .insert(workoutLogsTable)
    .values({ userId, ...parsed.data, weekNumber })
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
  const [logs, profile] = await Promise.all([
    db.query.workoutLogsTable.findMany({
      where: eq(workoutLogsTable.userId, userId),
      orderBy: [desc(workoutLogsTable.createdAt)],
    }),
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
  ]);

  const totalLogged = logs.length;
  const lastSessionDate = logs[0]?.date ?? null;

  // Live calendar week since onboarding — not "the highest week number we've
  // ever logged", which stalls forever once a program stops being regenerated.
  const currentWeek = trainingWeekNumber(profile?.onboardingCompletedAt);

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

router.delete("/workouts/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = parseInt(String(req.params["id"] ?? "0"));
  if (Number.isNaN(id)) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  // Scoped to id + userId in the WHERE itself so this can never delete
  // another user's row. PRs/stats are all computed from workout_logs at
  // read time, so no manual cascade cleanup is needed here.
  const [deleted] = await db
    .delete(workoutLogsTable)
    .where(and(eq(workoutLogsTable.id, id), eq(workoutLogsTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  res.status(204).end();
});

export default router;
