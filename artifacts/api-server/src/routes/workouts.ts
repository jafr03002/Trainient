import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, workoutLogsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CreateWorkoutBody, ListWorkoutsQueryParams } from "@workspace/api-zod";
import { trainingWeekNumber } from "../lib/trainingWeek";
import { logDateError } from "../lib/dateWindow";
import {
  AVERAGE_WINDOW,
  MAX_STORABLE_SECONDS,
  countsTowardAverage,
} from "../lib/sessionDuration";

const router = Router();

function serializeLog(w: typeof workoutLogsTable.$inferSelect) {
  return {
    ...w,
    exercisesLogged: w.exercisesLogged as object[],
    createdAt: w.createdAt.toISOString(),
    startedAt: w.startedAt?.toISOString() ?? null,
  };
}

/**
 * The session clock runs on the user's device, so the submitted elapsed time is
 * only as honest as their system clock. When we also have a start timestamp,
 * prefer the span it implies and treat the client's number as a cross-check -
 * the same reason weekNumber and mode are recomputed server-side below.
 *
 * Implausible values are deliberately NOT rejected or clamped to a "nice"
 * number: a session that ran overnight is stored as it happened and simply
 * fails the plausibility band when averages are computed.
 */
function resolveDurationSeconds(startedAt: Date | null, submitted: number | null): number | null {
  const fromTimestamps = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : null;
  const chosen =
    fromTimestamps != null && (submitted == null || Math.abs(fromTimestamps - submitted) > 60)
      ? fromTimestamps
      : submitted;
  if (chosen == null || !Number.isFinite(chosen)) return null;
  return Math.min(Math.max(Math.round(chosen), 0), MAX_STORABLE_SECONDS);
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
  // Same guard as the other routes that take a client-supplied log date: the zod
  // pattern only checks the shape, this rejects non-days and the future.
  const dateError = logDateError(parsed.data.date);
  if (dateError) {
    res.status(400).json({ error: dateError });
    return;
  }
  // Compute the week ourselves rather than trusting the client-submitted
  // value - it may be stale (e.g. a page left open across a week boundary).
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  const weekNumber = trainingWeekNumber(profile?.onboardingCompletedAt);
  // Mode is stamped from the profile at logging time, not the client, so a
  // session's recorded mode reflects what the user was actually in.
  const mode = profile?.mode ?? "ai";
  const durationSeconds = resolveDurationSeconds(parsed.data.startedAt ?? null, parsed.data.durationSeconds ?? null);
  const [log] = await db
    .insert(workoutLogsTable)
    .values({ userId, ...parsed.data, durationSeconds, weekNumber, mode })
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

  // Live calendar week since onboarding - not "the highest week number we've
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

// Average session length per session type, for the program page's day hero.
// "Session type" is the day label (falling back to the day number when a log has
// none), matching how /workouts/by-day-label already groups a day's history -
// dayNumber alone isn't stable identity once a program is edited.
router.get("/workouts/duration-stats", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const logs = await db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
    orderBy: [desc(workoutLogsTable.date), desc(workoutLogsTable.createdAt)],
  });

  const groups = new Map<string, { dayLabel: string | null; dayNumber: number; seconds: number[] }>();
  for (const log of logs) {
    if (!countsTowardAverage(log)) continue;
    const key = log.dayLabel ?? `#${log.dayNumber}`;
    let group = groups.get(key);
    if (!group) {
      group = { dayLabel: log.dayLabel, dayNumber: log.dayNumber, seconds: [] };
      groups.set(key, group);
    }
    // Logs arrive newest-first, so this keeps the most recent N per group.
    if (group.seconds.length < AVERAGE_WINDOW) group.seconds.push(log.durationSeconds!);
  }

  const stats = [...groups.values()].map((g) => ({
    dayLabel: g.dayLabel,
    dayNumber: g.dayNumber,
    averageSeconds: Math.round(g.seconds.reduce((a, b) => a + b, 0) / g.seconds.length),
    sampleCount: g.seconds.length,
  }));
  res.json({ stats });
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
