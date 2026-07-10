import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, bodyweightLogsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { LogBodyweightBody, GetTodaysBodyweightQueryParams } from "@workspace/api-zod";

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

  // Keeps user_profiles.weight - the field program generation reads - in
  // sync with the latest log, so AI mode always reasons from current weight.
  if (profile) {
    await db.update(userProfilesTable).set({ weight, weightUnit }).where(eq(userProfilesTable.userId, userId));
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
