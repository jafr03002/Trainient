import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, userProfilesTable, programsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { anthropic } from "../lib/anthropic";
import { generateProgramOutputSchema } from "../lib/programSchema";
import { programGenerationKnowledge } from "../lib/knowledge";
import { longTermPhaseFor, trainingWorkloadFor, cardioIntensityFrom } from "../lib/programMonitoring";
import { trainingWeekNumber } from "../lib/trainingWeek";

const router = Router();

// `weekNumber` in the API response is always the live calendar week since
// onboarding — not the stored column, which is just an insert-order ordinal
// (used internally for "find the latest program" / check-in versioning).
function serializeProgram(p: typeof programsTable.$inferSelect, onboardingCompletedAt: Date | null | undefined) {
  return {
    ...p,
    weekNumber: trainingWeekNumber(onboardingCompletedAt),
    days: p.days as object[],
    generatedAt: p.generatedAt.toISOString(),
  };
}

router.get("/programs/current", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  // Independent and AI mode each own a separate program lineage (aiGenerated
  // false/true) so switching modes never surfaces or edits the other mode's
  // program — "current" resolves within the active mode's lineage only.
  const wantAiGenerated = profile?.mode !== "independent";
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
  const { programName, splitType, days } = req.body;
  if (!programName || !splitType || !days) {
    res.status(400).json({ error: "programName, splitType, and days are required" });
    return;
  }

  const [latestProgram, profile] = await Promise.all([
    db.query.programsTable.findFirst({
      where: eq(programsTable.userId, userId),
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
      aiGenerated: false,
    })
    .returning();

  res.status(201).json(serializeProgram(program, profile?.onboardingCompletedAt));
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

  // Scoped to userId + aiGenerated=false in the WHERE itself (not checked
  // after the fact) so this can never touch another user's row, and an
  // AI-generated program can never be edited even if the client is stale
  // or bypasses the UI.
  const [program] = await db
    .update(programsTable)
    .set({ programName, splitType, days })
    .where(and(eq(programsTable.id, id), eq(programsTable.userId, userId), eq(programsTable.aiGenerated, false)))
    .returning();

  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  res.json(serializeProgram(program, profile?.onboardingCompletedAt));
});

router.post("/programs/generate", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const feedback: { categories?: string[]; note?: string } | undefined = req.body?.feedback;

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

  const hasFeedback = !!feedback && ((feedback.categories?.length ?? 0) > 0 || !!feedback.note);
  const feedbackBlock = hasFeedback
    ? `\n\nThe client reviewed a previously generated program and asked for changes before accepting it:
- Categories to revisit: ${feedback!.categories?.length ? feedback!.categories.join(", ") : "unspecified"}
- Additional notes: ${feedback!.note || "none"}

Here is the program they are reacting to, for reference:
${JSON.stringify(latestProgram?.days ?? [])}

Generate a new version of the program that directly addresses this feedback, while still following all the rules above.`
    : "";

  // Static across every call for every user — persona, house training philosophy, and
  // output format never change per-request, so this is the part worth prompt-caching.
  const staticInstructions = `You are an expert strength and conditioning coach with deep knowledge of hypertrophy, powerlifting, and evidence-based training. You write structured, intelligent training programs tailored to the individual.

Reference material — house training philosophy and program-generation rules to apply:
${programGenerationKnowledge}

Apply these rules:
- Beginners: full body or upper/lower, compound-focused, lower volume
- Intermediate: upper/lower or PPL, mix of compounds and isolation
- Advanced: PPL or specialisation splits, higher volume, more intensity techniques
- Always respect injuries — avoid or regress exercises that stress injured areas
- Add extra sets to priority muscle groups (15–20% more volume)
- Use progressive overload logic: rep ranges are designed to be beaten week over week
- Determine the client's short-term phase (calibration, bulk, maintenance, reverse_diet, diet,
  mini_cut, or deload) and matching energy balance (surplus, maintenance, deficit, or
  high_deficit), applying the goal-evaluation timeline template and the short-term phase
  weekly-rate definitions in the reference material above, based on their goal, experience,
  and current stats
- Set a short-term goal weight only if the phase implies one (bulk/diet/mini_cut phases target
  a specific bodyweight bound); for a maintenance/general-fitness client, return
  short_term_goal_weight as null
- Recommend a daily step target (low, moderate, or high) per the activity-evaluation guidance
  above — bump it for clients with low/moderate activity and a weight-loss or general-fitness goal
- Recommend a cardio heart-rate zone (bpm_min, bpm_max, and a low/moderate/high level) using
  your own judgement of what's appropriate for this client's sex, weight, and experience level,
  per the guidance above
- Name the program in plain language after its split (e.g. "Push Pull Legs", "Upper/Lower
  Split") — never append training-method jargon like "Hypertrophy" or "Strength" to the name

Also produce 3–5 "program highlights" — short explanations of why the program looks the
way it does. Each highlight MUST tie back to a concrete input from the profile above (the
chosen split and why it fits the training-days/experience combo, an extra-volume bump for a
priority muscle group, an exercise substitution or omission made for an injury, the
progression logic used for this experience level, etc). Do not write generic filler —
every highlight should reference a specific choice this program actually makes.

Return ONLY valid JSON (no markdown, no explanation) structured as:
{ "program_name": "...", "split_type": "...",
  "program_highlights": [ { "title": "...", "detail": "..." } ],
  "days": [ { "day_number": 1, "label": "...", "focus": "...",
    "exercises": [ { "name": "...", "sets": 4, "reps": "8-10",
    "rest_seconds": 90, "cue": "...", "muscle": "..." } ] } ],
  "short_term_phase": "bulk", "energy_balance": "surplus",
  "short_term_goal_weight": 82.5,
  "daily_step_target": "moderate",
  "cardio_intensity": { "bpm_min": 120, "bpm_max": 135, "level": "moderate" } }`;

  const userPrompt = `User profile:
- Goal: ${profile.goal}
- Experience: ${profile.experience}
- Training days per week: ${profile.trainingDays}
- Preferred rest days: ${(profile.preferredRestDays as string[]).length ? (profile.preferredRestDays as string[]).join(", ") : "no preference"}
- Equipment: ${(profile.equipment as string[]).join(", ")}
- Age: ${profile.age ?? "not provided"}, Sex: ${profile.sex ?? "not provided"}, Weight: ${profile.weight ?? "not provided"} ${profile.weightUnit ?? "kg"}
- Long-term goal weight: ${profile.goalWeight != null ? `${profile.goalWeight} ${profile.weightUnit ?? "kg"}` : "not provided"}
- Daily activity level (outside training): ${profile.activityLevel ?? "not provided"}
- Injuries/limitations: ${profile.injuries ?? "none"}${profile.injuries && profile.injurySeverity ? ` (severity: ${profile.injurySeverity} — ${
    profile.injurySeverity === "high"
      ? "avoid loading the affected area entirely, substitute unaffected-area work"
      : profile.injurySeverity === "medium"
        ? "avoid or modify movements that stress the affected area, reduce load/range where needed"
        : "train around it normally, just avoid aggravating movements"
  })` : ""}
- Priority muscle groups: ${(profile.priorityMuscles as string[]).join(", ")}

Generate a weekly training program with exactly ${profile.trainingDays} training days.
For each day, provide 5–7 exercises. For each exercise provide:
- Exercise name
- Sets
- Rep range (e.g. 8–10)
- Rest time in seconds
- One coaching cue (one sentence)
- Primary muscle group${feedbackBlock}`;

  const completion = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: staticInstructions, cache_control: { type: "ephemeral" } },
    ],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: generateProgramOutputSchema },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = completion.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Expected a text block in Claude's program-generation response");
  }
  const raw = JSON.parse(textBlock.text);

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

  const programHighlights = (raw.program_highlights ?? []).map((h: any) => ({
    title: h.title,
    detail: h.detail,
  }));

  const [program] = await db
    .insert(programsTable)
    .values({
      userId,
      weekNumber: newWeekNumber,
      longTermPhase: longTermPhaseFor(profile.goal),
      shortTermPhase: raw.short_term_phase,
      energyBalance: raw.energy_balance,
      trainingWorkload: trainingWorkloadFor(days),
      longTermGoalWeight: profile.goalWeight,
      shortTermGoalWeight: raw.short_term_goal_weight,
      dailyStepTarget: raw.daily_step_target,
      cardioIntensity: cardioIntensityFrom(raw.cardio_intensity),
      programName: raw.program_name,
      splitType: raw.split_type,
      programHighlights,
      days,
      aiGenerated: true,
    })
    .returning();

  res.status(201).json(serializeProgram(program, profile.onboardingCompletedAt));
});

export default router;
