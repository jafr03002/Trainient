import { useCallback, useEffect, useRef, useState } from "react";
import {
  startProgramGenerationJob,
  getProgramGenerationJob,
  startCheckinJob,
  getCheckinJob,
  type GenerateProgramInput,
  type CheckinInput,
  type Program,
  type CheckinResult,
  type AiJobStatus,
} from "@workspace/api-client-react";

/**
 * Runs an AI request (program generation, weekly check-in) as a server-side
 * job and polls it, instead of holding one POST open for the minute a Claude
 * call takes. On a phone that POST dies with the screen lock or a network
 * handoff, and the answer goes with it. A job keeps running on the server
 * (artifacts/api-server/src/lib/aiJobs.ts), so the app only has to come back
 * and ask.
 *
 * The job id is also written to localStorage, so leaving the page or having
 * the OS kill the app mid-generation doesn't lose it either: the page calls
 * `resume()` on mount and picks the same job up again.
 */

type JobKind = "program_generation" | "checkin";

type JobSnapshot<T> = { status: AiJobStatus; result: T | null; error: string | null };

type JobApi<TInput, TResult> = {
  kind: JobKind;
  start: (input: TInput) => Promise<{ jobId: string }>;
  read: (jobId: string) => Promise<JobSnapshot<TResult>>;
  failureMessage: string;
};

const programGenerationApi: JobApi<GenerateProgramInput | undefined, Program> = {
  kind: "program_generation",
  start: (input) => startProgramGenerationJob(input),
  read: (jobId) => getProgramGenerationJob(jobId),
  failureMessage: "Program generation failed. Please try again.",
};

const checkinApi: JobApi<CheckinInput, CheckinResult> = {
  kind: "checkin",
  start: (input) => startCheckinJob(input),
  read: (jobId) => getCheckinJob(jobId),
  failureMessage: "Your check-in could not be processed. Please try again.",
};

const POLL_MS = 2500;
// The server marks a job failed six minutes after it was created (STALE_AFTER_MS
// in aiJobs.ts). Past that, a stored id is not worth resuming, and a poll loop
// that still hasn't heard back has lost the server rather than the job.
const GIVE_UP_AFTER_MS = 6.5 * 60 * 1000;

type StoredJob = { jobId: string; startedAt: number };

const storageKey = (kind: JobKind) => `trainient-ai-job:${kind}`;

function readStoredJob(kind: JobKind): StoredJob | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const job = JSON.parse(raw) as StoredJob;
    if (typeof job?.jobId !== "string" || typeof job?.startedAt !== "number") return null;
    return Date.now() - job.startedAt < GIVE_UP_AFTER_MS ? job : null;
  } catch {
    return null;
  }
}

function writeStoredJob(kind: JobKind, job: StoredJob | null) {
  try {
    if (job) window.localStorage.setItem(storageKey(kind), JSON.stringify(job));
    else window.localStorage.removeItem(storageKey(kind));
  } catch {
    // Storage blocked: the job still runs, it just can't be resumed after a reload.
  }
}

class AbortedError extends Error {}

// Waits POLL_MS, but wakes early the moment the app is back in front of the
// user or back online - timers are frozen while a phone is locked, and the
// first thing someone does on unlocking is look for their result.
function nap(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", wake);
      signal.removeEventListener("abort", onAbort);
    };
    const wake = () => {
      cleanup();
      resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    const onAbort = () => {
      cleanup();
      reject(new AbortedError());
    };
    const timer = window.setTimeout(wake, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", wake);
    signal.addEventListener("abort", onAbort);
  });
}

function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

// The server's own message for a 400 (e.g. "Complete onboarding first").
function serverMessage(err: unknown): string | undefined {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : undefined;
}

function useAiJob<TInput, TResult>(api: JobApi<TInput, TResult>) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once: whether an earlier visit left a job running for this page to pick up.
  const [resumable] = useState(() => readStoredJob(api.kind));
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the page stops polling. The job itself carries on server-side,
  // and its id stays stored for the next visit.
  useEffect(() => () => abortRef.current?.abort(), []);

  const follow = useCallback(
    async (job: StoredJob): Promise<TResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsPending(true);
      setError(null);
      try {
        for (;;) {
          await nap(controller.signal);
          let snapshot: JobSnapshot<TResult>;
          try {
            snapshot = await api.read(job.jobId);
          } catch (err) {
            if (httpStatus(err) === 404) throw new Error(api.failureMessage);
            // Offline, a dropped connection, a cold function: none of these say
            // anything about the job, so keep asking until the server's own
            // timeout would have ended it.
            if (Date.now() - job.startedAt > GIVE_UP_AFTER_MS) throw new Error(api.failureMessage);
            continue;
          }
          if (snapshot.status === "succeeded" && snapshot.result) return snapshot.result;
          if (snapshot.status === "failed") throw new Error(snapshot.error ?? api.failureMessage);
        }
      } catch (err) {
        if (err instanceof AbortedError) throw err;
        writeStoredJob(api.kind, null);
        const message = err instanceof Error ? err.message : api.failureMessage;
        setError(message);
        throw err;
      } finally {
        if (abortRef.current === controller) setIsPending(false);
      }
    },
    [api],
  );

  const run = useCallback(
    async (input: TInput): Promise<TResult> => {
      setIsPending(true);
      setError(null);
      let jobId: string;
      try {
        // A retry while a job is still running gets that job back rather than
        // starting (and paying for) a second one - the server dedupes.
        ({ jobId } = await api.start(input));
      } catch (err) {
        setIsPending(false);
        setError(serverMessage(err) ?? api.failureMessage);
        throw err;
      }
      const job = { jobId, startedAt: Date.now() };
      writeStoredJob(api.kind, job);
      const result = await follow(job);
      writeStoredJob(api.kind, null);
      return result;
    },
    [api, follow],
  );

  // Picks up the job an earlier visit left running. Only call this when
  // `resumable` is set.
  const resume = useCallback(async (): Promise<TResult> => {
    if (!resumable) throw new Error("No job to resume");
    const result = await follow(resumable);
    writeStoredJob(api.kind, null);
    return result;
  }, [api.kind, follow, resumable]);

  return { run, resume, resumable: !!resumable, isPending, isError: error !== null, error };
}

export const useProgramGenerationJob = () => useAiJob(programGenerationApi);
export const useCheckinJob = () => useAiJob(checkinApi);

/** True when a rejection only means the page was left mid-job - not a failure to report. */
export function isAbandonedJob(err: unknown): boolean {
  return err instanceof AbortedError;
}
