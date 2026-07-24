// Independent mode has no AI-generated phase, so its dashboard "phase" is
// derived straight from the profile goal the user picks (in onboarding or in
// the editable targets box). The three options map 1:1 onto the existing
// short-term phase colours in phaseColors.ts, so nothing has to drift:
//   gain_weight -> bulk (green), general -> maintenance (amber), lose_weight -> diet (pink)

export type IndependentPhase = "bulk" | "maintenance" | "diet";

export type PhaseOption = {
  phase: IndependentPhase;
  goal: string;
  heading: string; // what the user is doing, in plain words
  tag: string; // the training-world name for it
  sub: string;
};

export const PHASE_OPTIONS: PhaseOption[] = [
  { phase: "bulk", goal: "gain_weight", heading: "Gaining weight", tag: "Bulk phase", sub: "Build muscle in a surplus" },
  { phase: "maintenance", goal: "general", heading: "General fitness", tag: "Maintenance", sub: "Hold weight, stay consistent" },
  { phase: "diet", goal: "lose_weight", heading: "Losing weight", tag: "Diet phase", sub: "Lean out, keep muscle" },
];

// Any goal that isn't an explicit gain/lose (including legacy slugs and the
// empty default) reads as maintenance - the neutral middle option.
export function goalToPhase(goal: string | null | undefined): IndependentPhase {
  if (goal === "gain_weight") return "bulk";
  if (goal === "lose_weight") return "diet";
  return "maintenance";
}

export function phaseOption(phase: IndependentPhase): PhaseOption {
  return PHASE_OPTIONS.find((o) => o.phase === phase)!;
}

// Bulk/diet are goal-weight phases; maintenance has no target at all. Mirrors
// onboarding's goalWeightConflict, keyed on the phase instead of the raw goal:
// a target must point the same way as the phase (bulk above current, diet below),
// and a goal-weight phase can't be left without one. Returns the message to show,
// or null when there's nothing to complain about. Direction is only checked when
// the current weight is known - otherwise any non-empty target is accepted.
export function phaseGoalWeightError(
  phase: IndependentPhase,
  currentWeight: number | null | undefined,
  goalWeight: string,
  unit: string,
): string | null {
  if (phase === "maintenance") return null;
  if (!goalWeight.trim()) return "Set a goal weight to continue.";
  const target = parseFloat(goalWeight);
  if (!Number.isFinite(target)) return "Enter a valid goal weight.";
  const current = currentWeight ?? NaN;
  if (!Number.isFinite(current)) return null; // no current weight to compare against
  if (target === current) {
    return `That's your current weight (${current} ${unit}) - enter a target ${phase === "bulk" ? "above" : "below"} it.`;
  }
  if (phase === "bulk" && target < current) {
    return `Bulk needs a target above your current ${current} ${unit}. ${target} ${unit} is below it - that's a diet.`;
  }
  if (phase === "diet" && target > current) {
    return `Diet needs a target below your current ${current} ${unit}. ${target} ${unit} is above it - that's a bulk.`;
  }
  return null;
}

// Weekday labels used by the cardio picker, stored verbatim in cardioDays.
export const CARDIO_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Order an arbitrary set of stored day labels back into week order for display.
export function orderCardioDays(days: string[]): string[] {
  return CARDIO_DAYS.filter((d) => days.includes(d));
}
