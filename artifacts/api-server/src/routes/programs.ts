import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, userProfilesTable, programsTable } from "@workspace/db";
import {
  SetProgramStartDateBody,
  CreateManualProgramBody,
  UpdateProgramBody,
  GenerateProgramBody,
} from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";
import { serializeProgram } from "../lib/serializers";
import { prepareProgramGeneration } from "../lib/programGeneration";
import { acceptAiJob, readAiJob } from "../lib/aiJobs";

const router = Router();

router.get("/programs/current", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  // Independent and AI mode each own a separate program lineage (aiGenerated
  // false/true) so switching modes never surfaces or edits the other mode's
  // program - "current" resolves within the active mode's lineage by default.
  // An explicit ?lineage= lets a client view a specific lineage (e.g. the
  // read-only view of the other mode's program page) without switching modes.
  const lineage = req.query["lineage"];
  if (lineage !== undefined && lineage !== "ai" && lineage !== "manual") {
    res.status(400).json({ error: "lineage must be 'ai' or 'manual'" });
    return;
  }
  const wantAiGenerated = lineage ? lineage === "ai" : profile?.mode !== "independent";
  const program = await db.query.programsTable.findFirst({
    where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, wantAiGenerated)),
    orderBy: [desc(programsTable.weekNumber), desc(programsTable.generatedAt)],
  });
  if (!program) {
    res.status(404).json({ error: "No active program" });
    return;
  }
  res.json(serializeProgram(program, profile?.onboardingCompletedAt));
});

router.get("/programs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const [programs, profile] = await Promise.all([
    db.query.programsTable.findMany({
      where: eq(programsTable.userId, userId),
      orderBy: [desc(programsTable.weekNumber)],
    }),
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
  ]);
  res.json(programs.map((p) => serializeProgram(p, profile?.onboardingCompletedAt)));
});

// Manual program creation (independent mode)
router.post("/programs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateManualProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { programName, splitType, days } = parsed.data;

  const [latestProgram, profile] = await Promise.all([
    db.query.programsTable.findFirst({
      where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, false)),
      orderBy: [desc(programsTable.weekNumber)],
    }),
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
  ]);
  const newWeekNumber = (latestProgram?.weekNumber ?? 0) + 1;

  const [program] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: newWeekNumber,
      programName,
      splitType,
      programHighlights: [],
      days,
      // No `schedule`: scheduling belongs to AI mode only. A manual program is a
      // list of days the user trains whenever they like, so the column stays null
      // and the program page's schedule strip simply doesn't render.
      aiGenerated: false,
    })
    .returning();

  res.status(201).json(serializeProgram(program, profile?.onboardingCompletedAt));
});

// Update existing manual program
router.put("/programs/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = parseInt(String(req.params["id"] ?? "0"));
  const parsed = UpdateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { programName, splitType, days } = parsed.data;

  // Scoped to userId + aiGenerated=false in the WHERE itself (not checked
  // after the fact) so this can never touch another user's row, and an
  // AI-generated program can never be edited even if the client is stale
  // or bypasses the UI.
  const [program] = await db
    .update(programsTable)
    .set({
      programName,
      splitType,
      days,
      // Cleared rather than left alone: scheduling is AI-mode only now, but rows
      // saved while the manual builder briefly offered it still carry one. Blanking
      // it here retires those the next time the user saves, so no manual program is
      // left showing a week it has no way to edit.
      schedule: null,
    })
    .where(and(eq(programsTable.id, id), eq(programsTable.userId, userId), eq(programsTable.aiGenerated, false)))
    .returning();

  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  res.json(serializeProgram(program, profile?.onboardingCompletedAt));
});

// Sets when the user wants to begin training - called from the
// post-presentation commitment screen. Not restricted to manual programs
// (unlike the PUT above) since this only ever runs against AI-generated ones.
router.patch("/programs/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = parseInt(String(req.params["id"] ?? "0"));
  const parsed = SetProgramStartDateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [program] = await db
    .update(programsTable)
    .set({ startDate: parsed.data.startDate.toISOString().slice(0, 10) })
    .where(and(eq(programsTable.id, id), eq(programsTable.userId, userId)))
    .returning();

  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  res.json(serializeProgram(program, profile?.onboardingCompletedAt));
});

// Blocking generation: holds the request open for the whole Claude call. Kept
// for the web app. New clients (the native app especially) should use the job
// endpoints below, which survive a dropped connection.
router.post("/programs/generate", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = GenerateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareProgramGeneration(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  res.status(201).json(await prepared.run());
});

// Resumable generation (see lib/aiJobs.ts). Same validation and the same 400s
// as the blocking endpoint, answered immediately. Past those, 202 { jobId }.
router.post("/programs/generate/jobs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = GenerateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareProgramGeneration(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  await acceptAiJob(res, {
    userId,
    kind: "program_generation",
    requestPayload: parsed.data,
    run: prepared.run,
  });
});

router.get("/programs/generate/jobs/:jobId", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const job = await readAiJob(userId, "program_generation", String(req.params["jobId"] ?? ""));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

export default router;
