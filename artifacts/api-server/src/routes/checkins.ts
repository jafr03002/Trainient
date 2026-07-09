import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkinsTable, programsTable, userProfilesTable, workoutLogsTable, bodyweightLogsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { SubmitCheckinBody } from "@workspace/api-zod";
import { anthropic } from "../lib/anthropic";
import { checkinAdjustmentOutputSchema } from "../lib/programSchema";
import { trainingWeekNumber } from "../lib/trainingWeek";

const router = Router();

// Reduced to a single line rather than raw entries — cheap to interpolate
// into the prompt and reads the same "is this trending the right way"
// signal a coach would glance at, without dumping a whole log array.
function bodyweightTrendSummary(logs: { date: string; weight: number; weightUnit: string }[]): string {
  if (logs.length === 0) return "No bodyweight logged recently.";
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (sorted.length === 1) {
    return `${last.weight} ${last.weightUnit} (logged ${last.date}, only one entry so far)`;
  }
  const delta = last.weight - first.weight;
  const sign = delta > 0 ? "+" : "";
  return `${first.weight} ${first.weightUnit} on ${first.date} → ${last.weight} ${last.weightUnit} on ${last.date} (${sign}${delta.toFixed(1)} ${last.weightUnit})`;
}

function serializeCheckin(c: typeof checkinsTable.$inferSelect) {
  return {
    ...c,
    submittedAt: c.submittedAt.toISOString(),
  };
}

// `weekNumber` in the API response is always the live calendar week since
// onboarding — see programs.ts for why the stored column can't be trusted.
function serializeProgram(p: typeof programsTable.$inferSelect, onboardingCompletedAt: Date | null | undefined) {
  return {
    ...p,
    weekNumber: trainingWeekNumber(onboardingCompletedAt),
    days: p.days as object[],
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

router.post("/checkins", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = SubmitCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [checkin] = await db
    .insert(checkinsTable)
    .values({ userId, ...parsed.data })
    .returning();

  const [profile, currentProgram, recentLogs, recentBodyweightLogs] = await Promise.all([
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) }),
    db.query.programsTable.findFirst({
      where: eq(programsTable.userId, userId),
      orderBy: [desc(programsTable.weekNumber)],
    }),
    db.query.workoutLogsTable.findMany({
      where: eq(workoutLogsTable.userId, userId),
      orderBy: [desc(workoutLogsTable.createdAt)],
      limit: 10,
    }),
    db.query.bodyweightLogsTable.findMany({
      where: eq(bodyweightLogsTable.userId, userId),
      orderBy: [desc(bodyweightLogsTable.date)],
      limit: 30,
    }),
  ]);

  if (!currentProgram) {
    res.status(400).json({ error: "No program to adjust" });
    return;
  }

  const adjustmentPrompt = `You are an AI personal trainer reviewing a client's weekly check-in to adjust their training program for next week.

Client profile: ${JSON.stringify(profile)}
Current program: ${JSON.stringify(currentProgram.days)}
Bodyweight trend (last 30 logged days): ${bodyweightTrendSummary(recentBodyweightLogs)}
This week's check-in:
- Energy: ${parsed.data.energy}/10
- Sleep: ${parsed.data.sleep}/10
- Soreness: ${parsed.data.soreness}
- Sessions completed: ${parsed.data.completion}
- Notes: ${parsed.data.notes ?? "none"}
Workout logs this week: ${JSON.stringify(recentLogs.slice(0, 5))}

Analyse their performance and fatigue. Then return:
1. A brief message to the client (2–3 sentences, encouraging and specific)
2. An updated program JSON for next week with any adjustments made

Adjustment rules:
- Energy/sleep both below 6: reduce volume by 10–15%, consider a deload day
- All sessions completed + good energy: increase weight targets or add 1 rep to ranges (progressive overload)
- Missed sessions: do not increase volume, note which days to prioritise
- High soreness: swap high-impact exercises for lower-impact alternatives
- Bodyweight trend vs the client's goal weight: if it's moving the wrong direction relative to their goal, factor that into volume/intensity guidance; if there's not enough data, ignore this signal
- Apply any specific notes the user left

Return ONLY valid JSON (no markdown):
{ "message": "...", "updated_program": { "program_name": "...", "split_type": "...",
  "program_highlights": [ { "title": "...", "detail": "..." } ], "days": [...same structure as above...] } }`;

  const completion = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: checkinAdjustmentOutputSchema },
    },
    messages: [{ role: "user", content: adjustmentPrompt }],
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

  const [updatedProgram] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: currentProgram.weekNumber + 1,
      programName: raw.updated_program.program_name,
      splitType: raw.updated_program.split_type,
      programHighlights: updatedHighlights,
      days: updatedDays,
    })
    .returning();

  res.status(201).json({
    checkin: serializeCheckin(checkin),
    aiMessage: raw.message,
    updatedProgram: serializeProgram(updatedProgram, profile?.onboardingCompletedAt),
  });
});

export default router;
