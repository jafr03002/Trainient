import type { Response } from "express";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, aiJobsTable, type AiJob } from "@workspace/db";
import { logger } from "./logger";

// Asynchronous AI jobs - the resumable alternative to the blocking
// POST /programs/generate and POST /checkins.
//
// A phone cannot be trusted to hold a request open for the minute a Claude call
// can take: a screen lock or a network handoff kills it and the result is lost.
// So the job endpoints answer 202 { jobId } straight away and the client polls
// GET .../jobs/{jobId}, which reads the row below. Dropping the connection
// mid-flight costs nothing - polling again (or GET /programs/current) finds the
// finished result.
//
// HOW THE WORK RUNS. The API is a single stateless Vercel function (see
// DEPLOY.md), so there is no worker process and no in-memory state that
// outlives an invocation. The work runs in the SAME invocation that accepted
// the job, after the 202 has been sent, kept alive with Vercel's `waitUntil`.
// The invocation is bounded by `maxDuration` for api/index.ts in vercel.json.
// A poll is a separate invocation that only reads Postgres.
//
// Why not the alternatives:
// - Holding the response open until the work is done (and letting the client
//   poll a concurrent invocation) needs no platform hook, but it is only
//   resumable if Vercel keeps running the handler after the client
//   disconnects, which it does not promise. It is also what the blocking
//   endpoints already do.
// - A separate worker invocation (the POST fires an internal request that does
//   the work) survives independently of the accepting request, but it needs a
//   shared secret, a self-URL that differs per preview deploy, and care that
//   the kick-off request really left before the POST returns. More moving parts
//   for the same maxDuration ceiling.
// If generation ever needs more than one function's maxDuration, the next step
// is a real queue (Vercel Queues, Inngest, QStash). This table is already the
// state such a queue would need.

export type AiJobKind = "program_generation" | "checkin";

// What the shared handler modules (programGeneration.ts, checkinSubmission.ts)
// hand back once the cheap checks are done: either a client error to return
// immediately, or the expensive part (the Claude call and the writes), deferred
// so the caller can run it inline (the blocking endpoint) or as a job.
export type PreparedAiWork<T> =
  | { ok: true; run: () => Promise<T> }
  | { ok: false; status: 400; error: string };

// A job still pending/running this long after it was created can no longer be
// running: the invocation doing it has been killed by maxDuration (300s in
// vercel.json - KEEP THIS ABOVE IT), or the local server was restarted. It is
// marked failed so the client stops polling and can retry. The one-active-job
// index would otherwise block that retry.
const STALE_AFTER_MS = 6 * 60 * 1000;

const ACTIVE_STATUSES = ["pending", "running"];

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a client sees when a job fails. The real error is only logged: it can
// carry internals (an SDK message, a SQL error) that don't belong in a phone UI.
const FAILURE_MESSAGE: Record<AiJobKind, string> = {
  program_generation: "Program generation failed. Please try again.",
  checkin: "Your check-in could not be processed. Please try again.",
};
const TIMEOUT_MESSAGE = "This took too long and was stopped. Please try again.";

// Vercel's per-request `waitUntil`, read the same way the `@vercel/functions`
// package reads it (that package is a thin wrapper over this symbol). Read
// directly so the API bundle takes no new dependency. Returns null outside a
// Vercel invocation (local dev, any long-lived Node host).
const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

function vercelWaitUntil(): ((promise: Promise<unknown>) => void) | null {
  const holder = (globalThis as Record<symbol, { get?: () => { waitUntil?: unknown } | undefined } | undefined>)[
    VERCEL_REQUEST_CONTEXT
  ];
  const context = holder?.get?.();
  const waitUntil = context?.waitUntil;
  return typeof waitUntil === "function" ? (waitUntil.bind(context) as (promise: Promise<unknown>) => void) : null;
}

async function expireStaleJobs(filter: { userId: string; kind: AiJobKind; jobId?: string }) {
  await db
    .update(aiJobsTable)
    .set({ status: "failed", error: TIMEOUT_MESSAGE, completedAt: new Date() })
    .where(
      and(
        eq(aiJobsTable.userId, filter.userId),
        eq(aiJobsTable.kind, filter.kind),
        filter.jobId ? eq(aiJobsTable.id, filter.jobId) : undefined,
        inArray(aiJobsTable.status, ACTIVE_STATUSES),
        lt(aiJobsTable.createdAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    );
}

// Never rejects, so it is safe to hand to waitUntil or leave running unawaited.
async function executeAiJob(jobId: string, kind: AiJobKind, run: () => Promise<unknown>): Promise<void> {
  try {
    // Claim it: only one execution ever moves a job out of pending.
    const [claimed] = await db
      .update(aiJobsTable)
      .set({ status: "running" })
      .where(and(eq(aiJobsTable.id, jobId), eq(aiJobsTable.status, "pending")))
      .returning({ id: aiJobsTable.id });
    if (!claimed) return;

    let result: unknown;
    try {
      result = await run();
    } catch (err) {
      logger.error({ err, jobId, kind }, "AI job failed");
      // Guarded on `running` so a late failure can't overwrite a result.
      await db
        .update(aiJobsTable)
        .set({ status: "failed", error: FAILURE_MESSAGE[kind], completedAt: new Date() })
        .where(and(eq(aiJobsTable.id, jobId), eq(aiJobsTable.status, "running")));
      return;
    }

    // Deliberately NOT guarded on status: if the stale sweep already gave up on
    // this job, the program was still written, so the truthful answer is the
    // result, not the timeout.
    await db
      .update(aiJobsTable)
      .set({ status: "succeeded", result, error: null, completedAt: new Date() })
      .where(eq(aiJobsTable.id, jobId));
  } catch (err) {
    // Only the bookkeeping writes can land here. The job stays pending/running
    // and the stale sweep fails it for the client.
    logger.error({ err, jobId, kind }, "AI job bookkeeping failed");
  }
}

// Records the job, starts the work and answers 202 { jobId }. If the user
// already has an unfinished job of this kind, answers with that job instead
// and `run` is never called (a retried POST must not pay for a second run).
export async function acceptAiJob(
  res: Response,
  job: { userId: string; kind: AiJobKind; requestPayload: unknown; run: () => Promise<unknown> },
): Promise<void> {
  await expireStaleJobs({ userId: job.userId, kind: job.kind });

  // Two attempts: the conflicting job can finish between our insert and the
  // lookup, in which case the second insert goes through.
  let jobId: string | null = null;
  for (let attempt = 0; attempt < 2 && !jobId; attempt++) {
    const [created] = await db
      .insert(aiJobsTable)
      .values({ userId: job.userId, kind: job.kind, requestPayload: job.requestPayload ?? {}, status: "pending" })
      .onConflictDoNothing()
      .returning({ id: aiJobsTable.id });
    if (created) {
      jobId = created.id;
      break;
    }
    const inFlight = await db.query.aiJobsTable.findFirst({
      where: and(
        eq(aiJobsTable.userId, job.userId),
        eq(aiJobsTable.kind, job.kind),
        inArray(aiJobsTable.status, ACTIVE_STATUSES),
      ),
    });
    if (inFlight) {
      res.status(202).json({ jobId: inFlight.id });
      return;
    }
  }
  if (!jobId) throw new Error(`Could not create a ${job.kind} job`);

  const execution = executeAiJob(jobId, job.kind, job.run);

  const waitUntil = vercelWaitUntil();
  if (waitUntil) {
    waitUntil(execution);
  } else if (process.env.VERCEL) {
    // On Vercel with no request context to extend, work left running after the
    // response would be frozen mid-generation. Fall back to finishing it before
    // answering. The client still gets a job it can poll, just late. This
    // should never happen: if it shows up in the logs, waitUntil stopped being
    // exposed and `@vercel/functions` should replace vercelWaitUntil() above.
    logger.error({ jobId, kind: job.kind }, "waitUntil unavailable on Vercel; running AI job inline");
    await execution;
  }
  // Otherwise this is a long-lived Node process (local dev, a persistent host),
  // where the work just carries on after the response.

  res.status(202).json({ jobId });
}

export function serializeAiJob(job: AiJob) {
  return {
    jobId: job.id,
    status: job.status,
    result: job.status === "succeeded" ? job.result : null,
    error: job.status === "failed" ? job.error : null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

// The caller's job of this kind, or null. Scoped by user AND kind, so a
// check-in job id can't be read through the program-generation endpoint.
export async function readAiJob(userId: string, kind: AiJobKind, jobId: string) {
  // Reject anything that isn't a uuid before it reaches Postgres, which would
  // otherwise throw on the cast and turn a bad id into a 500.
  if (!JOB_ID_PATTERN.test(jobId)) return null;
  await expireStaleJobs({ userId, kind, jobId });
  const job = await db.query.aiJobsTable.findFirst({
    where: and(eq(aiJobsTable.id, jobId), eq(aiJobsTable.userId, userId), eq(aiJobsTable.kind, kind)),
  });
  return job ? serializeAiJob(job) : null;
}
