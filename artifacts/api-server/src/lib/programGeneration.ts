import { eq, desc, and } from "drizzle-orm";
import { db, userProfilesTable, programsTable } from "@workspace/db";
import type { GenerateProgramBody } from "@workspace/api-zod";
import { generateStructured } from "./anthropic";
import { generateProgramOutputSchema } from "./programSchema";
import { programGenerationKnowledge } from "./knowledge";
import { longTermPhaseFor, trainingWorkloadFor, cardioIntensityFrom } from "./programMonitoring";
import { PHASE_TEMPLATES, INITIAL_PHASE_STATE, energyBalanceForPhase } from "./phaseTemplate";
import { defaultFixedSchedule } from "./programSchedule";
import { serializeProgram, type SerializedProgram } from "./serializers";
import type { PreparedAiWork } from "./aiJobs";

// AI program generation, shared by the blocking POST /programs/generate and the
// job endpoint POST /programs/generate/jobs. Both call prepare + run, so the two
// paths cannot drift apart.

// Static across every call for every user - persona, house training philosophy, and
// output format never change per-request, so this is the part worth prompt-caching.
// Built once at module load: any byte change here invalidates the cache.
const staticInstructions = `You are an expert strength and conditioning coach with deep knowledge of hypertrophy, powerlifting, and evidence-based training. You write structured, intelligent training programs tailored to the individual.

Reference material - house training philosophy and program-generation rules to apply:
${programGenerationKnowledge}

Apply these rules:
- Beginners: full body or upper/lower, compound-focused, lower volume
- Intermediate: upper/lower or PPL, mix of compounds and isolation
- Advanced: PPL or specialisation splits, higher volume, more intensity techniques
- Always respect injuries - avoid or regress exercises that stress injured areas
- Add extra sets to priority muscle groups (15–20% more volume)
- Use progressive overload logic: rep ranges are designed to be beaten week over week
- Recommend a concrete daily step count target (e.g. 6000-12000) per the activity-evaluation
  guidance above - bump it for clients with low/moderate activity and a weight-loss or
  general-fitness goal
- Estimate the client's TDEE from their weight, sex, age, and activity level, then prescribe a
  concrete daily calorie target (kcal) consistent with their goal: a deficit for weight loss, a
  surplus for muscle gain, roughly maintenance otherwise. Use sound, conservative rate-of-change
  assumptions (e.g. a 500 kcal/day deficit for a ~0.5 kg/week loss rate) rather than an aggressive number
- Recommend a cardio heart-rate zone (bpm_min, bpm_max, and a low/moderate/high level) using
  your own judgement of what's appropriate for this client's sex, weight, and experience level,
  per the guidance above
- Name the program in plain language after its split (e.g. "Push Pull Legs", "Upper/Lower
  Split") - never append training-method jargon like "Hypertrophy" or "Strength" to the name,
  and never pad it with redundant generic nouns like "Block", "Program", or "Plan"
- Give every day an estimated_duration_minutes: how long that session honestly takes from
  walking in to walking out, counting a warm-up, every working set, and the rest you
  prescribed between them. The client sees this before deciding to train and their real
  session length is measured against it, so an optimistic number gets found out. If the
  arithmetic lands somewhere the client is unlikely to sustain, fix the session rather than
  the estimate

Also produce exactly 2 "program highlights" - short explanations of why the program looks
the way it does. Do not write one highlight per input factor (split, priority muscle,
injury, progression logic, etc all crammed into separate cards) - instead, group the
relevant factors into 2 broader headlines that each weave together whichever concrete
inputs from the profile above actually drove that part of the program (e.g. one headline
covering the split choice + why it fits their training-days/experience/injuries, a second
covering volume/progression choices + any priority-muscle bump). Do not write generic
filler - each headline should still reference specific choices this program actually makes,
just fewer, denser headlines instead of many thin ones.

Return ONLY valid JSON (no markdown, no explanation) structured as:
{ "program_name": "...", "split_type": "...",
  "program_highlights": [ { "title": "...", "detail": "..." } ],
  "days": [ { "day_number": 1, "label": "...", "focus": "...",
    "estimated_duration_minutes": 55,
    "exercises": [ { "name": "...", "sets": 4, "reps": "8-10",
    "rest_seconds": 90, "cue": "...", "muscle": "..." } ] } ],
  "daily_step_target": 8000,
  "daily_calorie_target": 1900,
  "cardio_intensity": { "bpm_min": 120, "bpm_max": 135, "level": "moderate" } }`;

// The cheap half: reads the profile and the program being reacted to, and
// rejects a request that can't be served. Nothing is written and Claude is not
// called until `run()`.
export async function prepareProgramGeneration(
  userId: string,
  input: ReturnType<typeof GenerateProgramBody.parse>,
): Promise<PreparedAiWork<SerializedProgram>> {
  // Validated (enum-constrained categories, string note) before it is
  // interpolated into the LLM prompt below.
  const feedback = input.feedback;

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  if (!profile) {
    return { ok: false, status: 400, error: "Complete onboarding first" };
  }

  const latestProgram = await db.query.programsTable.findFirst({
    where: and(eq(programsTable.userId, userId), eq(programsTable.aiGenerated, true)),
    orderBy: [desc(programsTable.weekNumber)],
  });
  const newWeekNumber = (latestProgram?.weekNumber ?? 0) + 1;

  const run = async (): Promise<SerializedProgram> => {
    const hasFeedback = !!feedback && ((feedback.categories?.length ?? 0) > 0 || !!feedback.note);
    const feedbackBlock = hasFeedback
      ? `\n\nThe client reviewed a previously generated program and asked for changes before accepting it:
- Categories to revisit: ${feedback!.categories?.length ? feedback!.categories.join(", ") : "unspecified"}
- Additional notes: ${feedback!.note || "none"}

Here is the program they are reacting to, for reference:
${JSON.stringify(latestProgram?.days ?? [])}

Generate a new version of the program that directly addresses this feedback, while still following all the rules above.`
      : "";

    const userPrompt = `User profile:
- Goal: ${profile.goal}
- Experience: ${profile.experience}
- Training days per week: ${profile.trainingDays}
- Preferred rest days: ${(profile.preferredRestDays as string[]).length ? (profile.preferredRestDays as string[]).join(", ") : "no preference"}
- Equipment: ${(profile.equipment as string[]).join(", ")}
- Age: ${profile.age ?? "not provided"}, Sex: ${profile.sex ?? "not provided"}, Weight: ${profile.weight ?? "not provided"} ${profile.weightUnit ?? "kg"}
- Long-term goal weight: ${profile.goalWeight != null ? `${profile.goalWeight} ${profile.weightUnit ?? "kg"}` : "not provided"}
- Daily activity level (outside training): ${profile.activityLevel ?? "not provided"}
- Injuries/limitations: ${profile.injuries ?? "none"}${profile.injuries && profile.injurySeverity ? ` (severity: ${profile.injurySeverity} - ${
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

    const raw = await generateStructured({
      purpose: "program-generation",
      system: staticInstructions,
      prompt: userPrompt,
      schema: generateProgramOutputSchema,
    });

    const days = raw.days.map((d: any) => ({
      dayNumber: d.day_number,
      label: d.label,
      focus: d.focus,
      estimatedDurationMinutes: d.estimated_duration_minutes ?? null,
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

    // Every generation is a fresh start into the goal's hard phase template -
    // this only ever runs before a program has been accepted (see
    // program.tsx/onboarding.tsx, both only call it while `!program`), so
    // there's never prior phase state to carry forward.
    const longTermPhase = longTermPhaseFor(profile.goal);
    const template = PHASE_TEMPLATES[longTermPhase];
    const initialPhase = template[INITIAL_PHASE_STATE.segmentIndex]!.phase;

    const [program] = await db
      .insert(programsTable)
      .values({
        userId,
        weekNumber: newWeekNumber,
        longTermPhase,
        shortTermPhase: initialPhase,
        energyBalance: energyBalanceForPhase(initialPhase),
        trainingWorkload: trainingWorkloadFor(days),
        longTermGoalWeight: profile.goalWeight,
        shortTermGoalWeight: null,
        dailyStepTarget: raw.daily_step_target,
        dailyCalorieTarget: raw.daily_calorie_target,
        cardioIntensity: cardioIntensityFrom(raw.cardio_intensity),
        phaseSegmentIndex: INITIAL_PHASE_STATE.segmentIndex,
        weeksInPhaseSegment: INITIAL_PHASE_STATE.weeksInSegment,
        programName: raw.program_name,
        splitType: raw.split_type,
        programHighlights,
        days,
        // Derived here rather than asked of the model: the client stated which
        // weekdays it wants to keep free, and honouring that exactly is arithmetic,
        // not judgement. Always `fixed` - a rotating cycle drifts straight through
        // the rest days they just picked.
        schedule: defaultFixedSchedule(days, (profile.preferredRestDays as string[]) ?? []),
        aiGenerated: true,
      })
      .returning();

    return serializeProgram(program, profile.onboardingCompletedAt);
  };

  return { ok: true, run };
}
