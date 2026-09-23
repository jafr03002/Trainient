import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkinsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { SubmitCheckinBody } from "@workspace/api-zod";
import { computeSessionAdherence } from "../lib/sessionAdherence";
import { serializeCheckin } from "../lib/serializers";
import { currentAiProgram, prepareCheckinSubmission, recentWorkoutLogs } from "../lib/checkinSubmission";
import { acceptAiJob, readAiJob } from "../lib/aiJobs";
import { todayDateString } from "../lib/dateWindow";

const router = Router();

router.get("/checkins", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const checkins = await db.query.checkinsTable.findMany({
    where: eq(checkinsTable.userId, userId),
    orderBy: [desc(checkinsTable.submittedAt)],
  });
  res.json(checkins.map(serializeCheckin));
});

router.get("/checkins/latest", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const checkin = await db.query.checkinsTable.findFirst({
    where: eq(checkinsTable.userId, userId),
    orderBy: [desc(checkinsTable.submittedAt)],
  });
  if (!checkin) {
    res.status(404).json({ error: "No check-ins yet" });
    return;
  }
  res.json(serializeCheckin(checkin));
});

// Powers the check-in form's read-only "you logged X of Y sessions" step. The
// submission recomputes this server-side rather than trusting whatever the
// client saw, so this endpoint is a preview, not an input.
router.get("/checkins/adherence", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const [program, logs] = await Promise.all([currentAiProgram(userId), recentWorkoutLogs(userId)]);
  if (!program) {
    res.status(404).json({ error: "No program to measure against" });
    return;
  }
  res.json(
    computeSessionAdherence({
      today: todayDateString(),
      programDays: (program.days as { dayNumber: number; label?: string | null }[]) ?? [],
      workoutLogs: logs,
    }),
  );
});

// Blocking submission: holds the request open for the whole Claude call. Kept
// for the web app. New clients should use POST /checkins/jobs, which survives
// a dropped connection.
router.post("/checkins", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareCheckinSubmission(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  res.status(201).json(await prepared.run());
});

// Resumable submission (see lib/aiJobs.ts). Same validation and the same 400s
// as the blocking endpoint, answered immediately. Past those, 202 { jobId }.
// The check-in row itself is written by the job, just before the Claude call,
// exactly as the blocking endpoint does.
router.post("/checkins/jobs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareCheckinSubmission(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  await acceptAiJob(res, {
    userId,
    kind: "checkin",
    requestPayload: parsed.data,
    run: prepared.run,
  });
});

router.get("/checkins/jobs/:jobId", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const job = await readAiJob(userId, "checkin", String(req.params["jobId"] ?? ""));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

export default router;
