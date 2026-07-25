// The plausibility bands the API enforces, restated once for the client so a bad
// number is caught inline while the user is still looking at the field instead of
// coming back as a 400 from the server.
//
// These MUST stay in step with the minimum/maximum values on the input schemas in
// lib/api-spec/openapi.yaml - that spec is the real gate, this is the friendly
// version of it. If you widen one, widen the other.
//
// None of these are coaching opinions. They exist so age 999, weight -50 and a
// 0 kcal target can't be persisted; every value a real user enters passes.

export type FieldLimit = {
  min: number;
  max: number;
  /**
   * The field as a singular noun phrase, so it reads inside "Enter a ___ between
   * X and Y" - hence "set count" rather than "sets".
   */
  noun: string;
  /** Carried explicitly rather than guessed from the first letter. */
  article: "a" | "an";
  /** Follows the numbers in the message, e.g. "kcal". Omit for bare counts. */
  unit?: string;
  /** Whole numbers only - weights are the only fields that take decimals. */
  integer?: boolean;
};

export const FIELD_LIMITS = {
  age: { min: 13, max: 120, noun: "age", article: "an", integer: true },
  // Weights are unit-agnostic: the same band has to cover 20 kg and 1000 lbs,
  // because each log carries its own unit rather than being normalised.
  weight: { min: 20, max: 1000, noun: "weight", article: "a" },
  goalWeight: { min: 20, max: 1000, noun: "goal weight", article: "a" },
  dailyCalorieTarget: { min: 800, max: 10000, noun: "calorie target", article: "a", unit: "kcal", integer: true },
  dailyStepTarget: { min: 0, max: 100000, noun: "step target", article: "a", unit: "steps", integer: true },
  cardioMinutes: { min: 0, max: 1440, noun: "cardio duration", article: "a", unit: "minutes", integer: true },
  calories: { min: 0, max: 20000, noun: "calorie count", article: "a", unit: "kcal", integer: true },
  steps: { min: 0, max: 200000, noun: "step count", article: "a", unit: "steps", integer: true },
  // Program builder. Both ceilings are absurdity backstops, not programming advice.
  sets: { min: 1, max: 50, noun: "set count", article: "a", integer: true },
} satisfies Record<string, FieldLimit>;

// Bounds for a logged set. Unlike the fields above these are clamped at the input
// rather than surfaced as an error: the set grid has four numeric boxes per row
// with nowhere to put a message, and a negative weight or rep count isn't an
// ambiguous intent the way "0 sets" was - there's nothing to ask the user about.
export const LOGGED_SET_BOUNDS = {
  weight: { min: 0, max: 2000 },
  reps: { min: 0, max: 1000 },
} as const;

export function clampToBounds(value: number, bounds: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

export const MAX_EXERCISE_NAME = 80;
export const MAX_DAY_LABEL = 60;
export const MAX_PROFILE_NAME = 80;

// Pinned to en-US rather than the viewer's locale: the surrounding copy is English
// only, and the machine default turned 10000 into "10 000" with a non-breaking
// space, which reads like a typo mid-sentence.
function group(n: number): string {
  return n.toLocaleString("en-US");
}

// Returns the message to show under the field, or null when there's nothing to
// complain about. An empty string is always fine - every one of these fields is
// optional, and "not filled in" is not an error. Same contract as the existing
// goalWeightConflict / phaseGoalWeightError direction checks, so the two compose:
// callers show whichever fires.
export function rangeError(raw: string, limit: FieldLimit): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `Enter a valid ${limit.noun}.`;
  if (limit.integer && !Number.isInteger(value)) {
    return `Enter your ${limit.noun} as a whole number.`;
  }
  if (value < limit.min || value > limit.max) {
    const suffix = limit.unit ? ` ${limit.unit}` : "";
    return `Enter ${limit.article} ${limit.noun} between ${group(limit.min)} and ${group(limit.max)}${suffix}.`;
  }
  return null;
}

// True when every supplied value is either blank or in range - the shape the
// Continue/Save gates want.
export function allInRange(pairs: [string, FieldLimit][]): boolean {
  return pairs.every(([raw, limit]) => rangeError(raw, limit) === null);
}
