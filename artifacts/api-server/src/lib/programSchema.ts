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

const programSchema = {
  type: "object",
  properties: {
    program_name: { type: "string" },
    split_type: { type: "string" },
    program_highlights: { type: "array", items: programHighlightSchema },
    days: { type: "array", items: programDaySchema },
  },
  required: ["program_name", "split_type", "program_highlights", "days"],
  additionalProperties: false,
};

export const generateProgramOutputSchema = programSchema;

export const checkinAdjustmentOutputSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
    updated_program: programSchema,
  },
  required: ["message", "updated_program"],
  additionalProperties: false,
};
