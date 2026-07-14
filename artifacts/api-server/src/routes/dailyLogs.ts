import { Router } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, dailyLogsTable, bodyweightLogsTable, userProfilesTable, programsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { SubmitDailyCheckinBody, GetDailyLogsWeekQueryParams } from "@workspace/api-zod";

const router = Router();

function serializeDailyLog(entry: typeof dailyLogsTable.$inferSelect) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function serializeBodyweightLog(entry: typeof bodyweightLogsTable.$inferSelect) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// `date` columns are plain "YYYY-MM-DD" text, not a pg date/timestamp type
// (matches bodyweightLogs/workoutLogs), so date-range math happens here in
// JS rather than in the query - lexicographic string comparison already
// sorts these chronologically, so `gte`/`lte` on the raw text column works.
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// One combined upsert for the daily check-in form: calories/steps/cardio
// always go to dailyLogsTable, and if weight was included in the same
// submission it's upserted into bodyweightLogsTable too (same table the
// dedicated bodyweight card already reads/writes), so the "one form, one
// save button" UI maps to one API call touching both tables.
router.post("/daily-checkin", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitDailyCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, weight, calories, steps, cardioType, cardioMinutes } = parsed.data;

  // Only touch columns actually present in this submission - a check-in
  // that only logs steps shouldn't null out calories/cardio from an earlier
  // save the same day.
  const dailyLogValues: Partial<typeof dailyLogsTable.$inferInsert> = {};
  if (calories != null) dailyLogValues.calories = calories;
  if (steps != null) dailyLogValues.steps = steps;
  if (cardioType != null) dailyLogValues.cardioType = cardioType;
  if (cardioMinutes != null) dailyLogValues.cardioMinutes = cardioMinutes;

  const [dailyLog] = await db
    .insert(dailyLogsTable)
    .values({ userId, date, ...dailyLogValues })
    .onConflictDoUpdate({
      target: [dailyLogsTable.userId, dailyLogsTable.date],
      set: { ...dailyLogValues, updatedAt: new Date() },
    })
    .returning();

  let bodyweightLog: typeof bodyweightLogsTable.$inferSelect | null = null;
  if (weight != null) {
    const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
    const weightUnit = profile?.weightUnit ?? "kg";

    [bodyweightLog] = await db
      .insert(bodyweightLogsTable)
      .values({ userId, date, weight, weightUnit })
      .onConflictDoUpdate({
        target: [bodyweightLogsTable.userId, bodyweightLogsTable.date],
        set: { weight, weightUnit, updatedAt: new Date() },
      })
      .returning();

    // Keeps user_profiles.weight in sync with the latest log, same as the
    // dedicated /bodyweight route.
    if (profile) {
      await db.update(userProfilesTable).set({ weight, weightUnit }).where(eq(userProfilesTable.userId, userId));
    }
  }

  res.json({
    dailyLog: serializeDailyLog(dailyLog!),
    bodyweightLog: bodyweightLog ? serializeBodyweightLog(bodyweightLog) : null,
  });
});

router.get("/daily-logs/week", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = GetDailyLogsWeekQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "startDate query param required" });
    return;
  }
  const { startDate } = parsed.data;
  const endDate = addDaysToDateString(startDate, 6);

  const [profile, dailyLogs, bodyweightLogs] = await Promise.all([
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
    db.query.dailyLogsTable.findMany({
      where: and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, startDate), lte(dailyLogsTable.date, endDate)),
    }),
    db.query.bodyweightLogsTable.findMany({
      where: and(
        eq(bodyweightLogsTable.userId, userId),
        gte(bodyweightLogsTable.date, startDate),
        lte(bodyweightLogsTable.date, endDate),
      ),
    }),
  ]);

  // Same "current program" resolution as GET /programs/current - only the
  // phase label is needed here, not the full program payload.
  const wantAiGenerated = profile?.mode !== "independent";
  const currentProgram = await db.query.programsTable.findFirst({
    where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, wantAiGenerated)),
    orderBy: [desc(programsTable.weekNumber), desc(programsTable.generatedAt)],
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysToDateString(startDate, i);
    const dailyLog = dailyLogs.find((l) => l.date === date);
    const bodyweightLog = bodyweightLogs.find((l) => l.date === date);
    return {
      date,
      calories: dailyLog?.calories ?? null,
      steps: dailyLog?.steps ?? null,
      cardioType: dailyLog?.cardioType ?? null,
      cardioMinutes: dailyLog?.cardioMinutes ?? null,
      weight: bodyweightLog?.weight ?? null,
      weightUnit: bodyweightLog?.weightUnit ?? null,
    };
  });

  res.json({ days, shortTermPhase: currentProgram?.shortTermPhase ?? null });
});

export default router;
