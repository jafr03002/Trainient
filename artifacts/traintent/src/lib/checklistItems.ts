// Checklist items: the non-weight half of a program day - "5 min stretching",
// "2 min plank", a foam-rolling warmup, breathing work.
//
// A checklist item is modelled as an Exercise with kind:"checklist" rather than a
// separate array, so it interleaves anywhere in the day and reuses the builder's
// existing reorder/delete controls, the draft autosave, and the logger's render
// order. It reuses the lift fields instead of adding required ones - `sets` is the
// round count and `reps` is the human-readable target - so every row written before
// this feature existed still validates.
//
// The one invariant that matters: a logged checklist item carries NO weight and NO
// reps. That is what keeps it out of the volume/e1RM/PR maths for free, because
// api-server's workoutAnalysis.isPerformed only counts a set with weight or reps on
// it. Never synthesise a fake set to represent a tick.

import { LOGGED_SET_BOUNDS } from "./fieldLimits";

export type ItemKind = "lift" | "checklist";

/** How a checklist item is measured. "none" is a plain tick-off. */
export type TargetType = "duration" | "count" | "distance" | "none";

export type ChecklistCategory = "stretch" | "mobility" | "core" | "breathing" | "other";

// Cardio is deliberately absent. It already has two homes - daily_logs.cardioType /
// cardioMinutes on the dashboard, and Program.cardioIntensity for the AI's HR-zone
// prescription - and a third would fragment the data.
// `token` is a ready-to-use CSS colour, not a bare token reference: the theme
// defines --chart-N as raw HSL components ("250 90% 70%"), so `var(--chart-4)`
// alone is not a valid colour and silently renders as nothing when handed to an
// SVG stroke or a style colour. It must stay wrapped in hsl().
export const CHECKLIST_CATEGORIES: { value: ChecklistCategory; label: string; token: string }[] = [
  { value: "stretch", label: "Stretch", token: "hsl(var(--chart-4))" },
  { value: "mobility", label: "Mobility", token: "hsl(var(--chart-4))" },
  { value: "core", label: "Core", token: "hsl(var(--chart-2))" },
  { value: "breathing", label: "Breathing", token: "hsl(var(--chart-1))" },
  { value: "other", label: "Other", token: "hsl(var(--chart-4))" },
];

/** Fallback accent for a checklist item with no category set. */
export const CHECKLIST_ACCENT = "hsl(var(--chart-4))";

export const TARGET_TYPE_OPTIONS: { value: TargetType; label: string }[] = [
  { value: "none", label: "Just tick it" },
  { value: "duration", label: "Duration" },
  { value: "count", label: "Reps / count" },
  { value: "distance", label: "Distance" },
];

export const DISTANCE_UNITS = ["m", "km"] as const;

/**
 * What the duration wheel can express: 60 minutes plus 59 seconds. Far below
 * openapi.yaml's 86400s ceiling on purpose - the contract only has to refuse
 * nonsense, while the picker should not make a user spin past an hour of
 * stretching to find 45 seconds. A stored value above this is clamped when it's
 * loaded back into the builder.
 */
export const MAX_WHEEL_MINUTES = 60;
export const MAX_WHEEL_SECONDS = MAX_WHEEL_MINUTES * 60 + 59;

export function categoryMeta(category: string | null | undefined) {
  return CHECKLIST_CATEGORIES.find((c) => c.value === category) ?? null;
}

/**
 * Narrows a free-form stored value to a known category, or null. Programs written
 * by an older or newer client can hold anything here, and the API enums the field -
 * so an unrecognised value must become null rather than be passed straight back.
 */
export function parseCategory(value: unknown): ChecklistCategory | null {
  return CHECKLIST_CATEGORIES.find((c) => c.value === value)?.value ?? null;
}

/**
 * Seconds -> "m:ss" (or "h:mm:ss" past an hour). The canonical display form: the
 * builder's input, the roster row and the logger's countdown all read the same way,
 * so what you programmed is literally what you see counting down.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The target as shown on a roster row or a logger card - "2:30", "× 20", "400 m",
 * or null when the item is a plain tick-off with nothing to say.
 */
export function describeTarget(item: {
  targetType?: string | null;
  targetSeconds?: number | null;
  targetValue?: number | null;
  targetUnit?: string | null;
}): string | null {
  if (item.targetType === "duration") {
    return (item.targetSeconds ?? 0) > 0 ? formatDuration(item.targetSeconds!) : null;
  }
  if (item.targetType === "count") {
    return item.targetValue != null ? `× ${item.targetValue}` : null;
  }
  if (item.targetType === "distance") {
    return item.targetValue != null ? `${item.targetValue} ${item.targetUnit ?? "m"}` : null;
  }
  return null;
}

/** "2:30 × 2" when there's more than one round, else just the target. */
export function describeTargetWithRounds(item: {
  targetType?: string | null;
  targetSeconds?: number | null;
  targetValue?: number | null;
  targetUnit?: string | null;
  rounds?: number | null;
}): string | null {
  const target = describeTarget(item);
  const rounds = item.rounds ?? 1;
  if (!target) return rounds > 1 ? `${rounds} rounds` : null;
  return rounds > 1 ? `${rounds} × ${target}` : target;
}

/**
 * Clamps a count/distance amount to the band openapi.yaml accepts. Reuses the
 * logged-set reps ceiling for counts so "20 reps" is bounded the same way a logged
 * rep count is.
 */
export function clampTargetValue(value: number, targetType: TargetType): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const max = targetType === "count" ? LOGGED_SET_BOUNDS.reps.max : 100000;
  return Math.min(value, max);
}
