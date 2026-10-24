import { Router } from "express";
import { SubmitCalibrationReviewBody } from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";
import {
  getCalibrationStatus,
  prepareCalibrationExit,
  prepareCalibrationReview,
  resumeCalibration,
} from "../lib/calibrationReview";
import { acceptAiJob, readAiJob } from "../lib/aiJobs";

// The calibration review - see lib/calibrationReview.ts. Blocking and job
// variants share prepare + run, exactly like routes/checkins.ts.
const router = Router();

router.get("/calibration/status", requireAuth, async (req, res) => {
  res.json(await getCalibrationStatus(getUserId(req)));
});

router.post("/calibration/reviews", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCalibrationReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareCalibrationReview(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  res.status(201).json(await prepared.run());
});

router.post("/calibration/reviews/jobs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCalibrationReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = await prepareCalibrationReview(userId, parsed.data);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  await acceptAiJob(res, { userId, kind: "calibration_review", requestPayload: parsed.data, run: prepared.run });
});

router.post("/calibration/exit", requireAuth, async (req, res) => {
  const prepared = await prepareCalibrationExit(getUserId(req));
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  res.status(201).json(await prepared.run());
});

router.post("/calibration/exit/jobs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const prepared = await prepareCalibrationExit(userId);
  if (!prepared.ok) {
    res.status(prepared.status).json({ error: prepared.error });
    return;
  }
  await acceptAiJob(res, { userId, kind: "calibration_review", requestPayload: { exit: true }, run: prepared.run });
});

router.get("/calibration/jobs/:jobId", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const job = await readAiJob(userId, "calibration_review", String(req.params["jobId"] ?? ""));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.post("/calibration/recovered", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const resumed = await resumeCalibration(userId);
  if (!resumed.ok) {
    res.status(400).json({ error: resumed.error });
    return;
  }
  res.json(await getCalibrationStatus(userId));
});

export default router;
