import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarColorsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";

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
  const { dayLabel, hexColor } = req.body;
  if (!dayLabel || !hexColor) {
    res.status(400).json({ error: "dayLabel and hexColor required" });
    return;
  }

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
