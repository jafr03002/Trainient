import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateProfileBody,
  UpdateProfileBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/profile", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
  });
});

router.post("/profile", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [profile] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      name: data.name ?? null,
      goal: data.goal,
      experience: data.experience,
      trainingDays: data.trainingDays,
      equipment: data.equipment,
      age: data.age ?? null,
      sex: data.sex ?? null,
      weight: data.weight ?? null,
      weightUnit: data.weightUnit ?? "kg",
      injuries: data.injuries ?? null,
      priorityMuscles: data.priorityMuscles,
      onboardingComplete: true,
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        name: data.name ?? null,
        goal: data.goal,
        experience: data.experience,
        trainingDays: data.trainingDays,
        equipment: data.equipment,
        age: data.age ?? null,
        sex: data.sex ?? null,
        weight: data.weight ?? null,
        weightUnit: data.weightUnit ?? "kg",
        injuries: data.injuries ?? null,
        priorityMuscles: data.priorityMuscles,
        onboardingComplete: true,
      },
    })
    .returning();
  res.status(201).json({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
  });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [profile] = await db
    .update(userProfilesTable)
    .set(parsed.data)
    .where(eq(userProfilesTable.userId, userId))
    .returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
  });
});

export default router;
