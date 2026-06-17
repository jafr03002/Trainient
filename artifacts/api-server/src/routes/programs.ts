import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, userProfilesTable, programsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { openai } from "../lib/openai";

const router = Router();

function serializeProgram(p: typeof programsTable.$inferSelect) {
  return {
    ...p,
    days: p.days as object[],
    generatedAt: p.generatedAt.toISOString(),
  };
}

router.get("/programs/current", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const program = await db.query.programsTable.findFirst({
    where: eq(programsTable.userId, userId),
    orderBy: [desc(programsTable.weekNumber), desc(programsTable.generatedAt)],
  });
  if (!program) {
    res.status(404).json({ error: "No active program" });
    return;
  }
  res.json(serializeProgram(program));
});

router.get("/programs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const programs = await db.query.programsTable.findMany({
    where: eq(programsTable.userId, userId),
    orderBy: [desc(programsTable.weekNumber)],
  });
  res.json(programs.map(serializeProgram));
});

// Manual program creation (independent mode)
router.post("/programs", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { programName, splitType, days } = req.body;
  if (!programName || !splitType || !days) {
    res.status(400).json({ error: "programName, splitType, and days are required" });
    return;
  }

  const latestProgram = await db.query.programsTable.findFirst({
    where: eq(programsTable.userId, userId),
    orderBy: [desc(programsTable.weekNumber)],
  });
  const newWeekNumber = (latestProgram?.weekNumber ?? 0) + 1;

  const [program] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: newWeekNumber,
      programName,
      splitType,
      aiNotes: "",
      days,
      aiGenerated: false,
    })
    .returning();

  res.status(201).json(serializeProgram(program));
});

// Update existing manual program
router.put("/programs/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const id = parseInt(String(req.params["id"] ?? "0"));
  const { programName, splitType, days } = req.body;
  if (!programName || !splitType || !days) {
    res.status(400).json({ error: "programName, splitType, and days are required" });
    return;
  }

  const [program] = await db
    .update(programsTable)
    .set({ programName, splitType, days })
    .where(eq(programsTable.id, id))
    .returning();

  if (!program || program.userId !== userId) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(serializeProgram(program));
});

router.post("/programs/generate", requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  if (!profile) {
    res.status(400).json({ error: "Complete onboarding first" });
    return;
  }

  const latestProgram = await db.query.programsTable.findFirst({
    where: eq(programsTable.userId, userId),
    orderBy: [desc(programsTable.weekNumber)],
  });
  const newWeekNumber = (latestProgram?.weekNumber ?? 0) + 1;

  const systemPrompt = `You are an expert strength and conditioning coach with deep knowledge of hypertrophy, powerlifting, and evidence-based training. You write structured, intelligent training programs tailored to the individual.

User profile:
- Goal: ${profile.goal}
- Experience: ${profile.experience}
- Training days per week: ${profile.trainingDays}
- Equipment: ${(profile.equipment as string[]).join(", ")}
- Age: ${profile.age ?? "not provided"}, Sex: ${profile.sex ?? "not provided"}, Weight: ${profile.weight ?? "not provided"} ${profile.weightUnit ?? "kg"}
- Injuries/limitations: ${profile.injuries ?? "none"}
- Priority muscle groups: ${(profile.priorityMuscles as string[]).join(", ")}

Generate a weekly training program with exactly ${profile.trainingDays} training days.
For each day, provide 5–7 exercises. For each exercise provide:
- Exercise name
- Sets
- Rep range (e.g. 8–10)
- Rest time in seconds
- One coaching cue (one sentence)
- Primary muscle group

Apply these rules:
- Beginners: full body or upper/lower, compound-focused, lower volume
- Intermediate: upper/lower or PPL, mix of compounds and isolation
- Advanced: PPL or specialisation splits, higher volume, more intensity techniques
- Always respect injuries — avoid or regress exercises that stress injured areas
- Add extra sets to priority muscle groups (15–20% more volume)
- Use progressive overload logic: rep ranges are designed to be beaten week over week

Return ONLY valid JSON (no markdown, no explanation) structured as:
{ "program_name": "...", "split_type": "...", "ai_notes": "...",
  "days": [ { "day_number": 1, "label": "...", "focus": "...",
    "exercises": [ { "name": "...", "sets": 4, "reps": "8-10",
    "rest_seconds": 90, "cue": "...", "muscle": "..." } ] } ] }`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: systemPrompt }],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const raw = JSON.parse(completion.choices[0].message.content!);

  const days = raw.days.map((d: any) => ({
    dayNumber: d.day_number,
    label: d.label,
    focus: d.focus,
    exercises: d.exercises.map((e: any) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      rpe: null,
      restSeconds: e.rest_seconds,
      cue: e.cue,
      muscle: e.muscle,
    })),
  }));

  const [program] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: newWeekNumber,
      programName: raw.program_name,
      splitType: raw.split_type,
      aiNotes: raw.ai_notes,
      days,
      aiGenerated: true,
    })
    .returning();

  res.status(201).json(serializeProgram(program));
});

export default router;
