// JSON schemas for Claude structured outputs (output_config.format) on the
// AI program-generation routes. Field names are snake_case to match the
// existing prompt wording and the `raw.days.map(...)` parsing in
// programs.ts / checkins.ts.

const exerciseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    sets: { type: "integer" },
    reps: { type: "string" },
    rest_seconds: { type: "integer" },
    cue: { type: "string" },
    muscle: { type: "string" },
  },
  required: ["name", "sets", "reps", "rest_seconds", "cue", "muscle"],
  additionalProperties: false,
};

const programDaySchema = {
  type: "object",
  properties: {
    day_number: { type: "integer" },
    label: { type: "string" },
    focus: { type: "string" },
    exercises: { type: "array", items: exerciseSchema },
  },
  required: ["day_number", "label", "focus", "exercises"],
  additionalProperties: false,
};

const programHighlightSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
  },
  required: ["title", "detail"],
  additionalProperties: false,
};

const cardioIntensitySchema = {
  type: "object",
  properties: {
    bpm_min: { type: "integer" },
    bpm_max: { type: "integer" },
    level: { type: "string", enum: ["low", "moderate", "high"] },
  },
  required: ["bpm_min", "bpm_max", "level"],
  additionalProperties: false,
};

// Fields every program (generation and check-in) always produces. Phase
// fields are deliberately absent here - see phaseTemplate.ts. Generation
// always starts at the template's first segment (calibration), so it needs
// no phase judgement from the model at all; check-ins need the bounded
// phase_progress signal below instead of a free-form phase choice.
const programCoreSchema = {
  type: "object",
  properties: {
    program_name: {
      type: "string",
      description:
        "Short, plain-language name for the program (e.g. \"Push Pull Legs\", \"Upper/Lower Split\"). " +
        "Do not tack on training-method jargon like \"Hypertrophy\" or \"Strength\" - the split and " +
        "days already communicate that.",
    },
    split_type: {
      type: "string",
      description:
        "Short, plain-language label for the split (e.g. \"Push Pull Legs\", \"Upper/Lower\", " +
        "\"Full Body\"). Space-separated words, no underscores or code-style casing.",
    },
    program_highlights: { type: "array", items: programHighlightSchema },
    days: { type: "array", items: programDaySchema },
    daily_step_target: { type: "string", enum: ["low", "moderate", "high"] },
    cardio_intensity: cardioIntensitySchema,
  },
  required: ["program_name", "split_type", "program_highlights", "days", "daily_step_target", "cardio_intensity"],
  additionalProperties: false,
};

export const generateProgramOutputSchema = programCoreSchema;

const phaseProgressSchema = {
  type: "object",
  properties: {
    reasoning: {
      type: "string",
      description:
        "1-2 sentences citing concrete evidence (bodyweight trend vs this phase's weekly-rate " +
        "target, adherence) for the recommendation below.",
    },
    recommendation: {
      type: "string",
      enum: ["stay", "advance"],
      description:
        "Whether to remain in the current phase segment another week, or move to the next segment " +
        "in the template. This is only a recommendation - the server enforces the template's " +
        "min/max week bounds regardless of what you choose here.",
    },
  },
  required: ["reasoning", "recommendation"],
  additionalProperties: false,
};

const checkinProgramSchema = {
  type: "object",
  properties: {
    ...programCoreSchema.properties,
    phase_progress: phaseProgressSchema,
    short_term_goal_weight: { type: ["number", "null"] },
  },
  required: [...programCoreSchema.required, "phase_progress", "short_term_goal_weight"],
  additionalProperties: false,
};

export const checkinAdjustmentOutputSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
    updated_program: checkinProgramSchema,
  },
  required: ["message", "updated_program"],
  additionalProperties: false,
};
