import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  userProfilesTable,
  programsTable,
  workoutLogsTable,
  dailyLogsTable,
  bodyweightLogsTable,
  checkinsTable,
  calendarColorsTable,
  subscriptionsTable,
} from "@workspace/db";
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
    calibrationWalkthroughSeenAt: p.calibrationWalkthroughSeenAt?.toISOString() ?? null,
    programPageTourSeenAt: p.programPageTourSeenAt?.toISOString() ?? null,
    weightLoggingTourSeenAt: p.weightLoggingTourSeenAt?.toISOString() ?? null,
    dashboardTourSeenAt: p.dashboardTourSeenAt?.toISOString() ?? null,
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
        // Re-onboarding (e.g. switching mode back to AI) must not reset the
        // clock the app's "Week N" displays are computed from - only stamp
        // this the first time a profile is ever completed.
        onboardingCompletedAt: sql`COALESCE(${userProfilesTable.onboardingCompletedAt}, ${now})`,
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
  // Timestamp fields arrive as ISO strings over the wire (like every other date on
  // this API) but the columns are real timestamps - convert explicitly rather than
  // relying on the pg driver to infer the cast from the target column.
  const { calibrationWalkthroughSeenAt, programPageTourSeenAt, weightLoggingTourSeenAt, dashboardTourSeenAt, ...rest } = parsed.data;
  const [profile] = await db
    .update(userProfilesTable)
    .set({
      ...rest,
      ...(calibrationWalkthroughSeenAt !== undefined
        ? { calibrationWalkthroughSeenAt: calibrationWalkthroughSeenAt ? new Date(calibrationWalkthroughSeenAt) : null }
        : {}),
      ...(programPageTourSeenAt !== undefined
        ? { programPageTourSeenAt: programPageTourSeenAt ? new Date(programPageTourSeenAt) : null }
        : {}),
      ...(weightLoggingTourSeenAt !== undefined
        ? { weightLoggingTourSeenAt: weightLoggingTourSeenAt ? new Date(weightLoggingTourSeenAt) : null }
        : {}),
      ...(dashboardTourSeenAt !== undefined
        ? { dashboardTourSeenAt: dashboardTourSeenAt ? new Date(dashboardTourSeenAt) : null }
        : {}),
    })
    .where(eq(userProfilesTable.userId, userId))
    .returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(serializeProfile(profile));
});

// Every table that stores rows keyed by a Clerk user id. There are no foreign
// keys between them (each carries its own `user_id`), so nothing cascades -
// account deletion has to name them all, and any new user-owned table has to
// be added here or its rows outlive the account.
const USER_OWNED_TABLES = [
  workoutLogsTable,
  dailyLogsTable,
  bodyweightLogsTable,
  checkinsTable,
  calendarColorsTable,
  programsTable,
  subscriptionsTable,
  userProfilesTable,
] as const;

// Clears all application data for the caller. The client deletes the Clerk
// user *after* this succeeds: doing it in that order means a failure here
// leaves an account that can still sign in and retry, whereas the reverse
// would strand rows no one can ever reach again.
router.delete("/account", requireAuth, async (req, res) => {
  const userId = getUserId(req);

  // One transaction so a partial delete can't leave, say, workout logs behind
  // after the profile row is already gone.
  await db.transaction(async (tx) => {
    for (const table of USER_OWNED_TABLES) {
      await tx.delete(table).where(eq(table.userId, userId));
    }
  });

  res.status(204).end();
});

export default router;
