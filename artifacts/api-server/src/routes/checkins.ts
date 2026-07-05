import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkinsTable, programsTable, userProfilesTable, workoutLogsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { SubmitCheckinBody } from "@workspace/api-zod";
import { openai } from "../lib/openai";
import { trainingWeekNumber } from "../lib/trainingWeek";

const router = Router();

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

  const [profile, currentProgram, recentLogs] = await Promise.all([
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
  ]);

  if (!currentProgram) {
    res.status(400).json({ error: "No program to adjust" });
    return;
  }

  const adjustmentPrompt = `You are an AI personal trainer reviewing a client's weekly check-in to adjust their training program for next week.

Client profile: ${JSON.stringify(profile)}
Current program: ${JSON.stringify(currentProgram.days)}
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
- Apply any specific notes the user left

Return ONLY valid JSON (no markdown):
{ "message": "...", "updated_program": { "program_name": "...", "split_type": "...", "ai_notes": "...", "days": [...same structure as above...] } }`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: adjustmentPrompt }],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const raw = JSON.parse(completion.choices[0].message.content!);
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

  const [updatedProgram] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: currentProgram.weekNumber + 1,
      programName: raw.updated_program.program_name,
      splitType: raw.updated_program.split_type,
      aiNotes: raw.updated_program.ai_notes,
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
