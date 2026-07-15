import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarColorsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { UpsertCalendarColorBody } from "@workspace/api-zod";

const router = Router();

router.get("/calendar/colors", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const colors = await db.query.calendarColorsTable.findMany({
    where: eq(calendarColorsTable.userId, userId),
  });
  res.json(colors);
});

router.post("/calendar/colors", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = UpsertCalendarColorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { dayLabel, hexColor } = parsed.data;

  const existing = await db.query.calendarColorsTable.findFirst({
    where: and(
      eq(calendarColorsTable.userId, userId),
      eq(calendarColorsTable.dayLabel, dayLabel),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(calendarColorsTable)
      .set({ hexColor, updatedAt: new Date() })
      .where(eq(calendarColorsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(calendarColorsTable)
      .values({ userId, dayLabel, hexColor })
      .returning();
    res.json(created);
  }
});

export default router;
