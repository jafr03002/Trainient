import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateProfileBody,
  UpdateProfileBody,
} from "@workspace/api-zod";

const router = Router();

function serializeProfile(p: typeof userProfilesTable.$inferSelect) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    onboardingCompletedAt: p.onboardingCompletedAt?.toISOString() ?? null,
  };
}

router.get("/profile", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(serializeProfile(profile));
});

router.post("/profile", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const now = new Date();
  const [profile] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      name: data.name ?? null,
      mode: data.mode ?? "ai",
      goal: data.goal ?? "",
      experience: data.experience ?? "",
      trainingDays: data.trainingDays,
      equipment: data.equipment ?? [],
      age: data.age ?? null,
      sex: data.sex ?? null,
      weight: data.weight ?? null,
      weightUnit: data.weightUnit ?? "kg",
      goalWeight: data.goalWeight ?? null,
      activityLevel: data.activityLevel ?? null,
      preferredRestDays: data.preferredRestDays ?? [],
      injuries: data.injuries ?? null,
      injurySeverity: data.injurySeverity ?? null,
      priorityMuscles: data.priorityMuscles ?? [],
      onboardingComplete: true,
      onboardingCompletedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        name: data.name ?? null,
        mode: data.mode ?? "ai",
        goal: data.goal ?? "",
        experience: data.experience ?? "",
        trainingDays: data.trainingDays,
        equipment: data.equipment ?? [],
        age: data.age ?? null,
        sex: data.sex ?? null,
        weight: data.weight ?? null,
        weightUnit: data.weightUnit ?? "kg",
        goalWeight: data.goalWeight ?? null,
        activityLevel: data.activityLevel ?? null,
        preferredRestDays: data.preferredRestDays ?? [],
        injuries: data.injuries ?? null,
        injurySeverity: data.injurySeverity ?? null,
        priorityMuscles: data.priorityMuscles ?? [],
        onboardingComplete: true,
        onboardingCompletedAt: now,
      },
    })
    .returning();
  res.status(201).json(serializeProfile(profile));
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
  res.json(serializeProfile(profile));
});

export default router;
