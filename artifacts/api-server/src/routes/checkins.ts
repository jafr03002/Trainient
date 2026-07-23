import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  checkinsTable,
  programsTable,
  userProfilesTable,
  workoutLogsTable,
  bodyweightLogsTable,
  dailyLogsTable,
} from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { SubmitCheckinBody } from "@workspace/api-zod";
import { anthropic } from "../lib/anthropic";
import { checkinAdjustmentOutputSchema } from "../lib/programSchema";
import { checkInEngineKnowledge } from "../lib/knowledge";
import { buildCheckinEvidence } from "../lib/checkinData";
import { computeSessionAdherence, MISSED_REASON_TEXT } from "../lib/sessionAdherence";
import { trainingWeekNumber } from "../lib/trainingWeek";
import { longTermPhaseFor, trainingWorkloadFor, cardioIntensityFrom } from "../lib/programMonitoring";
import { PHASE_TEMPLATES, resolvePhaseProgression, effectivePhase, type LongTermPhase } from "../lib/phaseTemplate";

const router = Router();

// Today's date as YYYY-MM-DD (server local) - the reference "end of this week"
// for the past-week evidence windows in buildCheckinEvidence.
function todayDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// Prior check-ins condensed to one line each, exposing the SAME questions this
// week's form asks so the model can compare week over week for patterns (the
// engine doc leans on "compared to the last weeks same questioneers").
function formatPriorCheckins(list: (typeof checkinsTable.$inferSelect)[]): string {
  if (list.length === 0) return "  (none - this is the client's first check-in)";
  return list
    .map((c) => {
      const off = c.offDayDeviation == null ? "n/a" : c.offDayDeviation ? "yes" : "no";
      // Rows written before the scale change answered energy/sleep on 1-10 and
      // carry no ratingScaleMax - printing them as "/5" would make an unchanged
      // week look like a collapse.
      const scale = c.ratingScaleMax ?? 10;
      // Adherence used to be a self-reported word ("mostly"); it is now derived
      // counts. Print whichever the row actually has.
      const adherence =
        c.sessionsLogged != null && c.sessionsPlanned != null
          ? `sessions ${c.sessionsLogged}/${c.sessionsPlanned}${
              c.missedSessionReason ? ` (${MISSED_REASON_TEXT[c.missedSessionReason] ?? c.missedSessionReason})` : ""
            }`
          : `completion ${c.completion ?? "n/a"}`;
      const extras = [
        c.didntGoWell ? `didn't-go-well: ${c.didntGoWell}` : null,
        c.sleepDecline ? `sleep-decline: ${c.sleepDecline}` : null,
        c.digestionIssues ? `digestion: ${c.digestionIssues}` : null,
        c.notes ? `notes: ${c.notes}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `  - ${c.submittedAt.toISOString().slice(0, 10)}: energy ${c.energy}/${scale}, sleep ${c.sleep}/${scale}, hunger ${
        c.hungerAppetite ?? "n/a"
      }/5, off-day-deviation ${off}, soreness ${c.soreness}, ${adherence}${extras ? `; ${extras}` : ""}`;
    })
    .join("\n");
}

function serializeCheckin(c: typeof checkinsTable.$inferSelect) {
  return {
    ...c,
    submittedAt: c.submittedAt.toISOString(),
  };
}

// `weekNumber` in the API response is always the live calendar week since
// onboarding - see programs.ts for why the stored column can't be trusted.
// `weekInPhase`/`phaseTotalWeeks` mirror the same derivation as programs.ts's
// serializeProgram - see that file for why the raw segment index isn't
// returned as-is.
function serializeProgram(p: typeof programsTable.$inferSelect, onboardingCompletedAt: Date | null | undefined) {
  const { phaseSegmentIndex, weeksInPhaseSegment, ...rest } = p;
  const template = p.longTermPhase ? PHASE_TEMPLATES[p.longTermPhase as LongTermPhase] : null;
  const segment = template && phaseSegmentIndex != null ? template[phaseSegmentIndex] : null;
  return {
    ...rest,
    weekNumber: trainingWeekNumber(onboardingCompletedAt),
    weekInPhase: weeksInPhaseSegment,
    phaseTotalWeeks: segment?.maxWeeks ?? null,
    days: rest.days as object[],
    generatedAt: p.generatedAt.toISOString(),
  };
}

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

// The AI-lineage program the check-in reads from and writes to. Scoped to
// aiGenerated=true so a manual (Independent-mode) program that happens to hold a
// higher weekNumber can never be picked up, adjusted, and saved back into the AI
// lineage. Shared by GET /checkins/adherence and POST /checkins so the form and
// the prompt always measure against the same program.
function currentAiProgram(userId: string) {
  return db.query.programsTable.findFirst({
    where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, true)),
    orderBy: [desc(programsTable.weekNumber), desc(programsTable.generatedAt)],
  });
}

// Enough session history to compute multi-week e1RM progression/stall streaks
// per exercise (RULE 1 triggers at 4 sessions).
function recentWorkoutLogs(userId: string) {
  return db.query.workoutLogsTable.findMany({
    where: eq(workoutLogsTable.userId, userId),
    orderBy: [desc(workoutLogsTable.date), desc(workoutLogsTable.createdAt)],
    limit: 60,
  });
}

// Powers the check-in form's read-only "you logged X of Y sessions" step. The
// POST handler recomputes this server-side rather than trusting whatever the
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

router.post("/checkins", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch the evidence BEFORE inserting this week's check-in so `priorCheckins`
  // is strictly the previous weeks' answers to compare against.
  const [profile, currentProgram, workoutLogs, recentBodyweightLogs, recentDailyLogs, priorCheckins] =
    await Promise.all([
      db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
      currentAiProgram(userId),
      recentWorkoutLogs(userId),
      db.query.bodyweightLogsTable.findMany({
        where: eq(bodyweightLogsTable.userId, userId),
        orderBy: [desc(bodyweightLogsTable.date)],
        limit: 30,
      }),
      db.query.dailyLogsTable.findMany({
        where: eq(dailyLogsTable.userId, userId),
        orderBy: [desc(dailyLogsTable.date)],
        limit: 30,
      }),
      // Previous check-in for direct comparison + a few more for pattern context.
      db.query.checkinsTable.findMany({
        where: eq(checkinsTable.userId, userId),
        orderBy: [desc(checkinsTable.submittedAt)],
        limit: 4,
      }),
    ]);

  if (!currentProgram) {
    res.status(400).json({ error: "No program to adjust" });
    return;
  }

  const today = todayDateString();

  // Recomputed here rather than trusting anything the client sent - the form's
  // GET /checkins/adherence call is only a preview.
  const adherence = computeSessionAdherence({
    today,
    programDays: (currentProgram.days as { dayNumber: number; label?: string | null }[]) ?? [],
    workoutLogs: workoutLogs,
  });
  const missedSessionReason =
    adherence.loggedSessions < adherence.plannedSessions ? (parsed.data.missedSessionReason ?? null) : null;

  const [checkin] = await db
    .insert(checkinsTable)
    .values({
      userId,
      ...parsed.data,
      // Derived server-side, exactly like routes/workouts.ts does for workout
      // logs: a client-computed week can be stale, and the form used to submit a
      // week-of-year number that had nothing to do with programs.weekNumber.
      weekNumber: trainingWeekNumber(profile?.onboardingCompletedAt),
      sessionsPlanned: adherence.plannedSessions,
      sessionsLogged: adherence.loggedSessions,
      missedSessionReason,
      // Stamps which scale energy/sleep were answered on, so a future comparison
      // against a legacy 1-10 row stays honest.
      ratingScaleMax: 5,
    })
    .returning();

  const evidence = buildCheckinEvidence({
    today,
    bodyweightLogs: recentBodyweightLogs,
    dailyLogs: recentDailyLogs,
    workoutLogs,
    adherence,
    missedSessionReason,
  });

  // The AI never picks the next short-term phase directly (see
  // lib/phaseTemplate.ts) - it only recommends stay/advance, bounded by the
  // current segment's min/max week window. A goal change or a legacy/manual
  // row with no prior bookkeeping starts fresh at the new template's segment 0.
  const longTermPhase = longTermPhaseFor(profile?.goal ?? "");
  const template = PHASE_TEMPLATES[longTermPhase];
  const startingFresh =
    currentProgram.longTermPhase !== longTermPhase ||
    currentProgram.phaseSegmentIndex == null ||
    currentProgram.weeksInPhaseSegment == null;
  const priorSegmentIndex = startingFresh ? 0 : currentProgram.phaseSegmentIndex!;
  const priorWeeksInSegment = startingFresh ? 0 : currentProgram.weeksInPhaseSegment!;

  const currentSegment = template[priorSegmentIndex]!;
  const isTerminal = priorSegmentIndex === template.length - 1;
  const nextSegment = isTerminal ? null : template[priorSegmentIndex + 1]!;
  const weekWindowLabel = `${currentSegment.maxWeeks ?? "unbounded"}`;

  // Static across every check-in: persona, the check-in reprogramming engine
  // document, and the fixed decision/output rules. This is the ONLY knowledge
  // document injected into a check-in decision (program-generation knowledge is
  // deliberately excluded) - so the reprogram reasons purely from this engine
  // plus the client's own logged data. Prompt-cached like programs.ts.
  const systemInstructions = `You are an expert AI strength & nutrition coach reviewing a client's weekly check-in to reprogram next week's training and nutrition.

Reference material - the weekly check-in reprogramming engine. This is your decision guide for adjusting calories, steps, cardio, training volume, and phase progress. Treat it as a reference to compare against and apply judgement to, not rigid code:
${checkInEngineKnowledge}

How to apply it:
- Compare THIS week's questionnaire answers to the previous weeks' answers (provided below) to detect patterns before acting - a one-off is not a trend.
- Weigh the questionnaire together with the logged evidence variables (averageWeight vs last week, caloriesPerDay, stepCounts, cardioCompleted, sessions logged vs planned, progressionAcrossSets, sessionComments), all provided below.
- Session adherence is DERIVED from what the client logged, not self-reported. It counts sessions LOGGED, which is not the same as sessions trained: if the client says they trained a session but forgot to log it, treat that session as trained and the shortfall as a logging problem - do not cut training volume for it. Only a genuine skip is an adherence problem.
- Off-day deviation: if the client deviated from their calorie intake and did NOT log it, treat this week's calorie/bodyweight data as unreliable - do not change calories off it; keep calories and attribute the miss to discipline, not the plan.
- Hunger/appetite + phase: apply the document's phase-specific IF/THEN calorie guidance using the client's CURRENT phase (given below) and the week-over-week averageWeight change.
- Training Evaluation (RULE 1): the per-exercise e1RM progression/stall streaks are pre-computed in the evidence below. Where a STALL or PROGRESS trigger is flagged (4+ sessions), apply the document's corresponding volume adjustment for that muscle, using soreness + the client's notes as the fatigue proxy (no separate 1-10 fatigue survey is collected - infer it).

Phase-name mapping (the document speaks in phase names; the client's current phase is given below):
- mini_cut = the document's "high-deficit" phase; diet = "diet"; bulk = "bulk"; reverse_diet ≈ bulk but gentler; calibration / maintenance / deload = the document's "deload/maintenance".

Then return:
1. A short message to the client (2-3 sentences, encouraging and specific, referencing what you actually observed).
2. An updated program JSON for next week.

Server-enforced constraints (always apply):
- Recommend whether to stay in the current phase segment or advance (phase_progress.recommendation), with reasoning tied to averageWeight-vs-phase-rate and this week's adherence. The server clamps this to the phase template's min/max week bounds - it only matters within that window.
- Set short_term_goal_weight consistent with the recommended phase (bulk/diet/mini_cut target a specific bodyweight bound); for calibration/maintenance/deload return null.
- Recalibrate daily_calorie_target and daily_step_target from the same evidence per the document. If off-day deviation makes the data unreliable, or there isn't enough bodyweight data yet, keep last week's numbers roughly unchanged rather than guessing.
- Keep program_name plain-language (no method jargon); produce exactly 2 program_highlights.

Return ONLY valid JSON (no markdown) matching the required schema:
{ "message": "...", "updated_program": { "program_name": "...", "split_type": "...",
  "program_highlights": [ { "title": "...", "detail": "..." } ], "days": [ { "day_number": 1, "label": "...", "focus": "...", "exercises": [ { "name": "...", "sets": 4, "reps": "8-10", "rest_seconds": 90, "cue": "...", "muscle": "..." } ] } ],
  "phase_progress": { "reasoning": "...", "recommendation": "stay" }, "short_term_goal_weight": null,
  "daily_step_target": 8000, "daily_calorie_target": 1900,
  "cardio_intensity": { "bpm_min": 120, "bpm_max": 135, "level": "..." } } }`;

  const userPrompt = `Client profile: ${JSON.stringify(profile)}
Current program (this week's training days): ${JSON.stringify(currentProgram.days)}
Current targets: ${currentProgram.dailyCalorieTarget ?? "n/a"} kcal/day, ${currentProgram.dailyStepTarget ?? "n/a"} steps/day, cardio ${JSON.stringify(currentProgram.cardioIntensity)}

Current phase-template position (server-tracked context - do not restate these values in your output):
- Long-term goal: ${longTermPhase}
- Current phase: ${currentProgram.shortTermPhase ?? currentSegment.phase} (energy balance: ${currentProgram.energyBalance ?? "n/a"}), week ${priorWeeksInSegment + 1} of ${weekWindowLabel}
- If you recommend "stay": next week continues as "${currentSegment.phase}"
- If you recommend "advance": ${nextSegment ? `next week moves to "${nextSegment.phase}"` : `there is no next phase defined yet for this goal - the server will keep the client in "${currentSegment.phase}" regardless of your recommendation`}

This week's check-in questionnaire (energy, sleep and hunger are answered on a 1-5 scale):
- Energy: ${parsed.data.energy}/5
- Sleep quality: ${parsed.data.sleep}/5
- Hunger/appetite: ${parsed.data.hungerAppetite}/5
- Off days deviating from calorie intake without logging: ${parsed.data.offDayDeviation ? "YES - calorie/bodyweight data unreliable this week" : "no"}
- Soreness going into sessions: ${parsed.data.soreness}
- Exercise issues (connection / joint / muscle pain): ${parsed.data.exerciseIssues || "none reported"}
- What went well: ${parsed.data.wentWell || "not provided"}
- What did not go well / to improve: ${parsed.data.didntGoWell || "not provided"}
- Decline in sleep duration or quality, and why: ${parsed.data.sleepDecline || "not provided"}
- Digestion issues: ${parsed.data.digestionIssues || "none reported"}
- Extra notes: ${parsed.data.notes ?? "none"}

Previous check-ins (most recent first - compare the SAME questions week over week to spot patterns):
${formatPriorCheckins(priorCheckins)}

${evidence.text}`;

  const completion = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: systemInstructions, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: checkinAdjustmentOutputSchema },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = completion.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Expected a text block in Claude's check-in adjustment response");
  }
  const raw = JSON.parse(textBlock.text);
  const updatedDays = raw.updated_program.days.map((d: any) => ({
    dayNumber: d.day_number ?? d.dayNumber,
    label: d.label,
    focus: d.focus,
    exercises: (d.exercises ?? []).map((e: any) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      rpe: null,
      restSeconds: e.rest_seconds ?? e.restSeconds,
      cue: e.cue,
      muscle: e.muscle,
    })),
  }));

  const updatedHighlights = (raw.updated_program.program_highlights ?? []).map((h: any) => ({
    title: h.title,
    detail: h.detail,
  }));

  const resolved = resolvePhaseProgression(
    template,
    priorSegmentIndex,
    priorWeeksInSegment,
    raw.updated_program.phase_progress.recommendation,
  );
  const { shortTermPhase, energyBalance } = effectivePhase(template, resolved.segmentIndex, resolved.weeksInSegment);
  const phaseHasWeightTarget = shortTermPhase === "bulk" || shortTermPhase === "diet" || shortTermPhase === "mini_cut";
  const shortTermGoalWeight = phaseHasWeightTarget ? raw.updated_program.short_term_goal_weight : null;

  const [updatedProgram] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: currentProgram.weekNumber + 1,
      longTermPhase,
      shortTermPhase,
      energyBalance,
      trainingWorkload: trainingWorkloadFor(updatedDays),
      longTermGoalWeight: profile?.goalWeight,
      shortTermGoalWeight,
      dailyStepTarget: raw.updated_program.daily_step_target,
      dailyCalorieTarget: raw.updated_program.daily_calorie_target,
      cardioIntensity: cardioIntensityFrom(raw.updated_program.cardio_intensity),
      phaseSegmentIndex: resolved.segmentIndex,
      weeksInPhaseSegment: resolved.weeksInSegment,
      programName: raw.updated_program.program_name,
      splitType: raw.updated_program.split_type,
      programHighlights: updatedHighlights,
      days: updatedDays,
      // Explicit rather than relying on the column default: check-in output
      // always belongs to the AI lineage, never the manual one.
      aiGenerated: true,
    })
    .returning();

  res.status(201).json({
    checkin: serializeCheckin(checkin),
    aiMessage: raw.message,
    updatedProgram: serializeProgram(updatedProgram, profile?.onboardingCompletedAt),
  });
});

export default router;
