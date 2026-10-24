import { and, desc, eq } from "drizzle-orm";
import {
  db,
  bodyweightLogsTable,
  calibrationReviewsTable,
  dailyLogsTable,
  programsTable,
  userProfilesTable,
  workoutLogsTable,
  type Program,
} from "@workspace/db";
import type { SubmitCalibrationReviewBody } from "@workspace/api-zod";
import { generateStructured } from "./anthropic";
import { calibrationReviewOutputSchema } from "./programSchema";
import { calibrationReviewKnowledge } from "./knowledge";
import {
  applyExerciseSwaps,
  calibrationChecks,
  calibrationSessions,
  calibrationStartDate,
  calibrationWindow,
  currentCalibrationRun,
  feedbackSummary,
  type AppliedSwap,
  type CalibrationChecks,
  type CalibrationSession,
  type CalibrationWindow,
  type ProposedSwap,
} from "./calibrationWindow";
import { PHASE_TEMPLATES, effectivePhase, resolvePhaseProgression } from "./phaseTemplate";
import { longTermPhaseFor, trainingWorkloadFor } from "./programMonitoring";
import { serializeCalibrationReview, serializeProgram, type SerializedProgram } from "./serializers";
import { todayDateString } from "./dateWindow";
import type { PreparedAiWork } from "./aiJobs";

// The calibration review: the readiness check that ends calibration, shared by
// the blocking and job endpoints in routes/calibration.ts (prepare + run, like
// checkinSubmission.ts). Everything countable - timing, pause, retake, the hard
// checks - is decided in calibrationWindow.ts. The AI only judges readiness from
// the client's feedback and swaps exercises that don't work, using
// knowledge/ti-calibration-review.md.
//
// Leaving calibration = writing the next phase's program row. That is all the
// rest of the app needs: checkinGate.ts opens the first check-in 7 days after
// it, and the calendar reads the phase change off the rows. Calories, steps and
// cardio carry over unchanged - the first check-in sets the new phase's targets.

type ReviewInput = ReturnType<typeof SubmitCalibrationReviewBody.parse>;

export type CalibrationReviewResult = {
  review: ReturnType<typeof serializeCalibrationReview>;
  updatedProgram: SerializedProgram | null;
};

const PAUSED_MESSAGE =
  "Rest up and get well first - your calibration is on hold, and nothing moves on without you. " +
  "When you're ready to train again, tell us you've recovered and you'll get a fresh week to finish it.";

const BLOCKED_MESSAGE: Record<string, (w: CalibrationWindow) => string> = {
  too_early: (w) => `The calibration review opens on ${w.reviewOpensOn}`,
  paused: () => "Calibration is paused. Let us know when you've recovered.",
  ended: () => "The last day for the review has passed - calibration is finishing on its own",
  retake_tomorrow: () => "You can take the review again tomorrow",
};

type Context = Awaited<ReturnType<typeof loadContext>>;

// Everything the status, the review and the exit read, in one place so the
// three can't disagree about the window or the checks.
async function loadContext(userId: string, today: string) {
  const [profile, aiPrograms, reviews, workoutLogs, bodyweightLogs, dailyLogs] = await Promise.all([
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
    db.query.programsTable.findMany({
      where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, true)),
    }),
    db.query.calibrationReviewsTable.findMany({
      where: eq(calibrationReviewsTable.userId, userId),
      orderBy: [desc(calibrationReviewsTable.submittedAt)],
    }),
    db.query.workoutLogsTable.findMany({
      where: eq(workoutLogsTable.userId, userId),
      orderBy: [desc(workoutLogsTable.date), desc(workoutLogsTable.createdAt)],
      limit: 60,
    }),
    db.query.bodyweightLogsTable.findMany({
      where: eq(bodyweightLogsTable.userId, userId),
      orderBy: [desc(bodyweightLogsTable.date)],
      limit: 14,
    }),
    db.query.dailyLogsTable.findMany({
      where: eq(dailyLogsTable.userId, userId),
      orderBy: [desc(dailyLogsTable.date)],
      limit: 14,
    }),
  ]);

  const run = currentCalibrationRun(aiPrograms);
  if (!run) return { profile, inCalibration: false as const };

  const startDate = calibrationStartDate(aiPrograms, run.runStart, profile?.onboardingCompletedAt);
  // Reviews of THIS calibration - an earlier calibration (before a goal change)
  // has its own history.
  const runReviews = reviews.filter((r) => r.submittedAt.getTime() >= run.runStart.generatedAt.getTime());
  const window = calibrationWindow({ today, startDate, reviews: runReviews });
  const programDays = (run.current.days as { dayNumber: number; label?: string | null }[]) ?? [];
  const checks = calibrationChecks({ today, programDays, workoutLogs, bodyweightLogs, dailyLogs });
  const sessions = calibrationSessions(workoutLogs, startDate);

  return {
    profile,
    inCalibration: true as const,
    today,
    current: run.current,
    startDate,
    window,
    checks,
    sessions,
    runReviews,
  };
}

export async function getCalibrationStatus(userId: string) {
  const ctx = await loadContext(userId, todayDateString());
  const empty = {
    calibrationDay: null,
    startDate: null,
    reviewOpensOn: null,
    lastReviewDate: null,
    autoExitOn: null,
    reviewOpen: false,
    nextReviewAvailableOn: null,
    paused: false,
    autoExitDue: false,
    checks: null,
    sessions: [],
    feedbackSummary: null,
    latestReview: null,
  };
  if (!ctx.inCalibration) return { ...empty, inCalibration: false, reviewBlockedReason: "not_in_calibration" };
  const w = ctx.window;
  const latest = ctx.runReviews[0];
  const base = {
    ...empty,
    inCalibration: true,
    calibrationDay: w.calibrationDay,
    startDate: w.startDate,
    reviewOpensOn: w.reviewOpensOn,
    lastReviewDate: w.lastReviewDate,
    autoExitOn: w.autoExitOn,
    checks: ctx.checks,
    sessions: ctx.sessions,
    feedbackSummary: feedbackSummary(ctx.sessions),
    latestReview: latest ? serializeCalibrationReview(latest) : null,
  };
  // Calibration only exists in the AI lineage. A client who switched to
  // Independent mode keeps the row but can't be reviewed from there.
  if (ctx.profile?.mode === "independent") return { ...base, reviewBlockedReason: "not_ai_mode" };
  return {
    ...base,
    reviewOpen: w.reviewOpen,
    reviewBlockedReason: w.reviewBlockedReason,
    nextReviewAvailableOn: w.nextReviewAvailableOn,
    paused: w.paused,
    autoExitDue: w.autoExitDue,
  };
}

// ── The AI judgement ────────────────────────────────────────────────────────

// Static across every review, so it carries the prompt-cache breakpoint.
const systemInstructions = `You are an expert AI strength & nutrition coach running a client's calibration review: the readiness check that decides whether they are ready to leave calibration and start the real training phases.

Reference material - the calibration review guide, then the training principles (for exercise swaps). Treat them as a reference to compare against and apply judgement to, not rigid code:
${calibrationReviewKnowledge}

Return ONLY valid JSON (no markdown) matching the required schema:
{ "verdict": "pass" | "pass_with_notes" | "extend", "reasons": ["..."], "work_on": ["..."],
  "exercise_swaps": [ { "day_number": 1, "replace": "exact name from the program", "with": { "name": "...", "sets": 3, "reps": "8-10", "rest_seconds": 90, "cue": "...", "muscle": "..." }, "why": "..." } ],
  "message_to_user": "..." }`;

const PAIN_TEXT: Record<string, string> = { none: "no pain", discomfort: "discomfort", pain: "PAIN" };

function formatSessions(sessions: CalibrationSession[]): string {
  if (sessions.length === 0) return "  (no calibration sessions logged)";
  return sessions
    .map((s) => {
      const f = s.feedback;
      const answers = f
        ? `equipment found/used: ${f.equipment}, form confidence ${f.formConfidence}/5, ${PAIN_TEXT[f.pain] ?? f.pain}${
            f.pain !== "none" && f.painWhere ? ` (${f.painWhere})` : ""
          }, overall feel ${f.overallFeel}/5`
        : "post-session questions not answered";
      const notes = [
        s.note ? `session note: "${s.note}"` : null,
        ...s.exerciseNotes.map((n) => `${n.exercise}: "${n.note}"`),
      ].filter(Boolean);
      return `  - ${s.date} · ${s.dayLabel ?? `Day ${s.dayNumber}`}: ${answers}${notes.length ? `\n      ${notes.join("\n      ")}` : ""}`;
    })
    .join("\n");
}

function formatChecks(c: CalibrationChecks): string {
  const line = (ok: boolean, text: string) => `  - [${ok ? "met" : "NOT MET"}] ${text}`;
  return [
    line(
      c.fullRotation.met,
      `full rotation logged: ${c.fullRotation.logged} of ${c.fullRotation.planned} program days${
        c.fullRotation.missingDays.length ? ` (missing: ${c.fullRotation.missingDays.join(", ")})` : ""
      }`,
    ),
    line(c.weighIns.met, `weigh-ins: ${c.weighIns.count} (needs ${c.weighIns.required})`),
    line(c.nutritionLogs.met, `nutrition logs: ${c.nutritionLogs.count} (needs ${c.nutritionLogs.required})`),
  ].join("\n");
}

// The unmet checks as plain sentences, put in front of the reasons so the
// client always sees the real cause of a forced extend.
function unmetCheckReasons(c: CalibrationChecks): string[] {
  const out: string[] = [];
  if (!c.fullRotation.met) {
    out.push(`Log every program day once this week - ${c.fullRotation.logged} of ${c.fullRotation.planned} so far.`);
  }
  if (!c.weighIns.met) out.push(`Weigh in at least ${c.weighIns.required} times this week - ${c.weighIns.count} so far.`);
  if (!c.nutritionLogs.met) {
    out.push(`Log your nutrition at least ${c.nutritionLogs.required} times this week - ${c.nutritionLogs.count} so far.`);
  }
  return out;
}

function formatPriorReviews(reviews: (typeof calibrationReviewsTable.$inferSelect)[]): string {
  const prior = [...reviews].reverse();
  if (prior.length === 0) return "  (none - this is the first review)";
  return prior
    .map((r) => {
      if (r.verdict === "paused") return `  - day ${r.calibrationDay}: paused (ill or injured)`;
      return `  - day ${r.calibrationDay}: ${r.verdict}; nutrition sustainable ${r.nutritionSustainable ?? "n/a"}/5, fits schedule ${
        r.nutritionFitsSchedule ?? "n/a"
      }; changed: ${r.anythingChanged ?? "-"}; notes: ${r.notes ?? "-"}; work on: ${
        (r.workOn as string[]).join(" / ") || "-"
      }`;
    })
    .join("\n");
}

function promptFor(ctx: Extract<Context, { inCalibration: true }>, mode: "review" | "exit", input: ReviewInput | null) {
  const p = ctx.profile;
  const profile = {
    goal: p?.goal,
    experience: p?.experience,
    trainingDays: p?.trainingDays,
    equipment: p?.equipment,
    injuries: p?.injuries,
    injurySeverity: p?.injurySeverity,
    priorityMuscles: p?.priorityMuscles,
    sex: p?.sex,
    age: p?.age,
  };
  const w = ctx.window;
  const header =
    mode === "exit"
      ? `Mode: AUTOMATIC EXIT. Calibration ended on its own today (day ${w.calibrationDay}) because the client did not pass by the last review day. Write the summary described under "Automatic exit". Return verdict "pass_with_notes" - the server records it as that regardless. Swap exercises that clearly don't work.`
      : `Mode: REVIEW. Today is day ${w.calibrationDay} of calibration; the review is open until ${w.lastReviewDate}.${
          w.lastReviewDate === ctx.today
            ? " Today is the LAST review day: an extend means calibration ends automatically tomorrow."
            : ""
        }`;
  const checksNote = ctx.checks.allMet
    ? "All hard checks are met."
    : "A hard check is NOT met, so the verdict will be extend whatever you return. Say kindly what is missing, still read their feedback, and don't swap exercises.";

  const answers =
    mode === "review" && input
      ? `This review's answers:
- Nutrition sustainable long term: ${input.nutritionSustainable}/5
- Nutrition fits their schedule: ${input.nutritionFitsSchedule}
- Anything changed since the sessions: ${input.anythingChanged?.trim() || "nothing written"}
- Anything else the coach should know: ${input.notes?.trim() || "nothing written"}`
      : "";

  return `${header}

Client profile: ${JSON.stringify(profile)}
Calibration program (exercise names here are what "replace" must match): ${JSON.stringify(ctx.current.days)}

Hard checks over ${ctx.checks.windowStart} to ${ctx.checks.windowEnd} (decided by the server):
${formatChecks(ctx.checks)}
${mode === "review" ? checksNote : ""}

Calibration sessions, oldest first (the newest answers count most):
${formatSessions(ctx.sessions)}

Earlier reviews in this calibration, oldest first:
${formatPriorReviews(ctx.runReviews)}

${answers}`.trim();
}

// ── Writing the outcome ─────────────────────────────────────────────────────

function nextPhaseProgramValues(current: Program, goal: string, days: object[]) {
  const longTermPhase = longTermPhaseFor(goal);
  const template = PHASE_TEMPLATES[longTermPhase];
  const startingFresh =
    current.longTermPhase !== longTermPhase || current.phaseSegmentIndex == null || current.weeksInPhaseSegment == null;
  // "advance" from calibration always clears its one-week minimum, so this is
  // always the next segment.
  const resolved = resolvePhaseProgression(
    template,
    startingFresh ? 0 : current.phaseSegmentIndex!,
    startingFresh ? 0 : current.weeksInPhaseSegment!,
    "advance",
  );
  const { shortTermPhase, energyBalance } = effectivePhase(template, resolved.segmentIndex, resolved.weeksInSegment);
  const schedule = current.schedule as { mode?: string } | null;
  return {
    userId: current.userId,
    weekNumber: current.weekNumber + 1,
    longTermPhase,
    shortTermPhase,
    energyBalance,
    trainingWorkload: trainingWorkloadFor(days as { exercises: { sets: number; kind?: string | null }[] }[]),
    longTermGoalWeight: current.longTermGoalWeight,
    // Set by the first check-in with the new phase's targets.
    shortTermGoalWeight: null,
    dailyStepTarget: current.dailyStepTarget,
    dailyCalorieTarget: current.dailyCalorieTarget,
    cardioIntensity: current.cardioIntensity,
    phaseSegmentIndex: resolved.segmentIndex,
    weeksInPhaseSegment: resolved.weeksInSegment,
    programName: current.programName,
    splitType: current.splitType,
    programHighlights: current.programHighlights,
    days,
    // Swaps keep every dayNumber, so the schedule's slots still point at real days.
    schedule: current.schedule,
    startDate: schedule?.mode === "rotating" ? current.startDate : null,
    aiGenerated: true,
  };
}

type Outcome = {
  kind: "review" | "auto_exit";
  input: ReviewInput | null;
  verdict: "pass" | "pass_with_notes" | "extend" | "paused";
  reasons: string[];
  workOn: string[];
  proposedSwaps: ProposedSwap[];
  messageToUser: string;
};

async function writeOutcome(
  userId: string,
  ctx: Extract<Context, { inCalibration: true }>,
  outcome: Outcome,
): Promise<CalibrationReviewResult> {
  const ends = outcome.verdict === "pass" || outcome.verdict === "pass_with_notes";
  let applied: AppliedSwap[] = [];
  let days = ctx.current.days as object[];
  if (ends) {
    const swapped = applyExerciseSwaps(days as Parameters<typeof applyExerciseSwaps>[0], outcome.proposedSwaps);
    days = swapped.days;
    applied = swapped.applied;
  }

  const { review, nextProgram } = await db.transaction(async (tx) => {
    // The program could have changed while Claude was thinking (a regenerate,
    // or a second review from another device). Never advance a stale one.
    const newest = await tx.query.programsTable.findFirst({
      where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, true)),
      orderBy: [desc(programsTable.generatedAt)],
      columns: { id: true },
    });
    if (newest?.id !== ctx.current.id) throw new Error("The calibration program changed during the review");

    const [nextProgram] = ends
      ? await tx.insert(programsTable).values(nextPhaseProgramValues(ctx.current, ctx.profile?.goal ?? "", days)).returning()
      : [null];
    const [review] = await tx
      .insert(calibrationReviewsTable)
      .values({
        userId,
        programId: ctx.current.id,
        kind: outcome.kind,
        calibrationDay: ctx.window.calibrationDay,
        illOrInjured: outcome.input?.illOrInjured ?? null,
        nutritionSustainable: outcome.input?.nutritionSustainable ?? null,
        nutritionFitsSchedule: outcome.input?.nutritionFitsSchedule ?? null,
        anythingChanged: outcome.input?.anythingChanged?.trim() || null,
        notes: outcome.input?.notes?.trim() || null,
        checks: ctx.checks,
        verdict: outcome.verdict,
        reasons: outcome.reasons,
        workOn: outcome.workOn,
        exerciseSwaps: applied,
        messageToUser: outcome.messageToUser,
        nextProgramId: nextProgram?.id ?? null,
      })
      .returning();
    return { review: review!, nextProgram };
  });

  return {
    review: serializeCalibrationReview(review),
    updatedProgram: nextProgram ? serializeProgram(nextProgram, ctx.profile?.onboardingCompletedAt) : null,
  };
}

async function judge(ctx: Extract<Context, { inCalibration: true }>, mode: "review" | "exit", input: ReviewInput | null) {
  const raw = await generateStructured({
    purpose: mode === "exit" ? "calibration exit" : "calibration review",
    system: systemInstructions,
    prompt: promptFor(ctx, mode, input),
    schema: calibrationReviewOutputSchema,
  });
  return raw as {
    verdict: "pass" | "pass_with_notes" | "extend";
    reasons: string[];
    work_on: string[];
    exercise_swaps: ProposedSwap[];
    message_to_user: string;
  };
}

// ── Entry points ────────────────────────────────────────────────────────────

async function openContext(userId: string) {
  const ctx = await loadContext(userId, todayDateString());
  if (ctx.profile?.mode === "independent") {
    return { ok: false as const, error: "The calibration review is part of AI coaching" };
  }
  if (!ctx.inCalibration) return { ok: false as const, error: "You're not in calibration" };
  return { ok: true as const, ctx };
}

export async function prepareCalibrationReview(
  userId: string,
  input: ReviewInput,
): Promise<PreparedAiWork<CalibrationReviewResult>> {
  if (!input.illOrInjured && (input.nutritionSustainable == null || input.nutritionFitsSchedule == null)) {
    return { ok: false, status: 400, error: "Answer both nutrition questions" };
  }
  const opened = await openContext(userId);
  if (!opened.ok) return { ok: false, status: 400, error: opened.error };
  const { ctx } = opened;
  const blocked = ctx.window.reviewBlockedReason;
  if (blocked) return { ok: false, status: 400, error: BLOCKED_MESSAGE[blocked]!(ctx.window) };

  const run = async (): Promise<CalibrationReviewResult> => {
    // Decided here, with no AI call: nothing else is evaluated while they're unwell.
    if (input.illOrInjured) {
      return writeOutcome(userId, ctx, {
        kind: "review",
        input,
        verdict: "paused",
        reasons: ["Ill or injured - calibration is on hold until you've recovered."],
        workOn: [],
        proposedSwaps: [],
        messageToUser: PAUSED_MESSAGE,
      });
    }
    const ai = await judge(ctx, "review", input);
    // A failed hard check always extends (the AI is told so, this enforces it).
    const verdict = ctx.checks.allMet ? ai.verdict : "extend";
    return writeOutcome(userId, ctx, {
      kind: "review",
      input,
      verdict,
      reasons: [...unmetCheckReasons(ctx.checks), ...ai.reasons],
      workOn: ai.work_on,
      proposedSwaps: ai.exercise_swaps,
      messageToUser: ai.message_to_user,
    });
  };
  return { ok: true, run };
}

export async function prepareCalibrationExit(userId: string): Promise<PreparedAiWork<CalibrationReviewResult>> {
  const opened = await openContext(userId);
  if (!opened.ok) return { ok: false, status: 400, error: opened.error };
  const { ctx } = opened;
  if (!ctx.window.autoExitDue) {
    return {
      ok: false,
      status: 400,
      error: ctx.window.paused
        ? "Calibration is paused. Let us know when you've recovered."
        : `Calibration ends on its own on ${ctx.window.autoExitOn}`,
    };
  }

  const run = async (): Promise<CalibrationReviewResult> => {
    const ai = await judge(ctx, "exit", null);
    return writeOutcome(userId, ctx, {
      kind: "auto_exit",
      input: null,
      verdict: "pass_with_notes",
      reasons: ai.reasons,
      workOn: ai.work_on,
      proposedSwaps: ai.exercise_swaps,
      messageToUser: ai.message_to_user,
    });
  };
  return { ok: true, run };
}

export async function resumeCalibration(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const opened = await openContext(userId);
  if (!opened.ok) return opened;
  const { pausedReviewId } = opened.ctx.window;
  if (pausedReviewId == null) return { ok: false, error: "Calibration isn't paused" };
  await db
    .update(calibrationReviewsTable)
    .set({ resumedAt: new Date() })
    .where(and(eq(calibrationReviewsTable.id, pausedReviewId), eq(calibrationReviewsTable.userId, userId)));
  return { ok: true };
}
