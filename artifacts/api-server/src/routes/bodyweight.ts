import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, bodyweightLogsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { LogBodyweightBody, GetTodaysBodyweightQueryParams } from "@workspace/api-zod";
import { logDateError } from "../lib/dateWindow";
import { syncProfileWeightToLatestLog } from "../lib/profileWeight";

const router = Router();

function serialize(entry: typeof bodyweightLogsTable.$inferSelect) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

router.post("/bodyweight", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = LogBodyweightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, weight } = parsed.data;

  // Shape is already checked by the zod pattern; this rejects dates that are the
  // right shape but not real days, and days that haven't happened yet.
  const dateError = logDateError(date);
  if (dateError) {
    res.status(400).json({ error: dateError });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  const weightUnit = profile?.weightUnit ?? "kg";

  const [entry] = await db
    .insert(bodyweightLogsTable)
    .values({ userId, date, weight, weightUnit })
    .onConflictDoUpdate({
      target: [bodyweightLogsTable.userId, bodyweightLogsTable.date],
      set: { weight, weightUnit, updatedAt: new Date() },
    })
    .returning();

  // Keeps user_profiles.weight - the field program generation reads - in sync with
  // the newest log (not necessarily this one, which may be a backfill), so AI mode
  // always reasons from the actual current weight.
  if (profile) {
    await syncProfileWeightToLatestLog(userId);
  }

  res.json(serialize(entry));
});

router.get("/bodyweight/today", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = GetTodaysBodyweightQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "date query param required" });
    return;
  }

  const entry = await db.query.bodyweightLogsTable.findFirst({
    where: and(eq(bodyweightLogsTable.userId, userId), eq(bodyweightLogsTable.date, parsed.data.date)),
  });
  if (!entry) {
    res.status(404).json({ error: "Not logged yet" });
    return;
  }
  res.json(serialize(entry));
});

export default router;
