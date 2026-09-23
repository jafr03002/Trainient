// Per-set training targets for the AI-mode logger: what to try to beat this
// session, worked out from what was lifted last time. Pure arithmetic - no AI
// call - so it is instant, works offline and ports to native unchanged.
//
// This is the per-set view of the same double-progression idea the
// autoregulation engine (docs/work-catalog.md) builds on: add a rep until the
// rep cap, then add load and drop back to the bottom of the prescribed range.
// The engine may later decide WHEN to progress (fatigue, e1RM trend); this file
// only answers WHAT the next step up is.

export type ExerciseClass = "isolation" | "compound";

// The one place an exercise is classed as isolation or compound. Neither the
// exercise library nor docs/exercise-arsenal.md carries this, and the AI writes
// exercise names freely, so it's decided by name keyword rather than by a list
// of exact names. Anything that isn't recognisably single-joint is treated as
// compound - presses, squats, rows, pulldowns, hinges, dips and lunges.
const ISOLATION_KEYWORDS = [
  "curl", // biceps, hamstring and preacher curls
  "raise", // lateral, Y-, calf and leg raises
  "fly",
  "flies",
  "flye",
  "pec dec",
  "extension", // leg and triceps extensions
  "pushdown",
  "skullcrusher",
  "kickback",
  "crunch",
  "calf",
  "toe press",
  "abduction",
  "adductor",
  "shrug",
  "face pull",
  "pullover",
  "pallof",
  "plank",
  "wrist",
];

export function classifyExercise(name: string): ExerciseClass {
  const lower = name.toLowerCase();
  return ISOLATION_KEYWORDS.some((k) => lower.includes(k)) ? "isolation" : "compound";
}

// Jakob's rule: X = last session's reps + 1. While X stays inside the cap the
// target is one more rep at the same weight; past it, the load goes up.
const REP_CAP: Record<ExerciseClass, number> = { isolation: 12, compound: 9 };

// The load bump is about 2.5% of the working weight, snapped to a real plate
// step - smaller lifts can't take a 5 kg jump, and compounds carry more load so
// they are allowed the bigger one.
const LOAD_FRACTION = 0.025;
const STEPS_KG: Record<ExerciseClass, number[]> = { isolation: [1.25, 2.5], compound: [1.25, 2.5, 5] };
const STEPS_LB: Record<ExerciseClass, number[]> = { isolation: [2.5, 5], compound: [2.5, 5, 10] };

function weightStep(weight: number, cls: ExerciseClass, unit: string): number {
  const steps = (unit === "lb" || unit === "lbs" ? STEPS_LB : STEPS_KG)[cls];
  const ideal = weight * LOAD_FRACTION;
  return steps.reduce((best, s) => (Math.abs(s - ideal) < Math.abs(best - ideal) ? s : best), steps[0]);
}

// The bottom of a prescribed rep range - "8-12", "8–12", "8 to 12" and a plain
// "10" all work. Null when there is no number to read (e.g. "AMRAP").
export function repRangeFloor(reps: string | null | undefined): number | null {
  const match = /\d+/.exec(reps ?? "");
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type SetTarget = {
  weight: number;
  reps: number;
  // What moved since last time, so the suggestion reads as reasoning:
  // "+1 rep" or "+2.5 kg".
  change: "rep" | "weight";
  delta: string;
};

/**
 * The target for one set, from the matching set last session. Null when that
 * set has nothing to progress from (no reps logged).
 *
 * A bodyweight set (weight 0) can only progress on reps - there is no load to
 * add a percentage of - so it always gets "+1 rep".
 */
export function computeSetTarget({
  name,
  lastWeight,
  lastReps,
  targetReps,
  weightUnit,
}: {
  name: string;
  lastWeight: number;
  lastReps: number;
  targetReps: string | null | undefined;
  weightUnit: string;
}): SetTarget | null {
  if (!(lastReps > 0)) return null;
  const cls = classifyExercise(name);
  const next = lastReps + 1;

  if (next <= REP_CAP[cls] || !(lastWeight > 0)) {
    return { weight: lastWeight, reps: next, change: "rep", delta: "+1 rep" };
  }

  const step = weightStep(lastWeight, cls, weightUnit);
  // Round away float noise (80 + 1.25 + 1.25 ...), keeping quarter-kilo steps.
  const weight = Math.round((lastWeight + step) * 100) / 100;
  // Drop back to the bottom of the prescribed range at the new load. A range
  // floor at or above last time's reps can't be a reset, so keep last reps.
  const floor = repRangeFloor(targetReps);
  const reps = floor != null && floor < lastReps ? floor : lastReps;
  return { weight, reps, change: "weight", delta: `+${step} ${weightUnit}` };
}

/**
 * Target for a historic set as the logger stores it. Unilateral sets progress
 * on the weaker side, the same side the PR maths judges them on.
 */
export function targetFromPreviousSet(
  prev: any,
  { name, targetReps, weightUnit }: { name: string; targetReps: string | null | undefined; weightUnit: string },
): SetTarget | null {
  if (!prev) return null;
  const reps =
    prev.repsLeft != null || prev.repsRight != null
      ? Math.min(prev.repsLeft ?? 0, prev.repsRight ?? 0)
      : prev.reps ?? 0;
  return computeSetTarget({ name, lastWeight: prev.weight ?? 0, lastReps: reps, targetReps, weightUnit });
}
