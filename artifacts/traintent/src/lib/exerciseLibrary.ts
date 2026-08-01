import { MUSCLE_OPTIONS } from "./muscles";

export type MuscleOption = (typeof MUSCLE_OPTIONS)[number];

// The picker's exercise catalogue, transcribed from docs/exercise-arsenal.md.
//
// Keyed by muscle group on purpose: the key IS each exercise's primary muscle,
// so the browse list's grouping and the muscle auto-filled into the builder are
// the same piece of data and can't drift apart. Because the key type is
// MuscleOption, an exercise also can't be tagged with a muscle the program
// builder's dropdown doesn't offer - a typo here fails typecheck.
//
// An exercise may legitimately appear under two groups (dips are listed under
// both Chest and Triceps); each entry carries its own primary muscle, and the
// picker shows the group next to every suggestion so the two are tellable apart.
export const EXERCISE_LIBRARY: Record<MuscleOption, string[]> = {
  Chest: [
    "Dumbbell Bench Press",
    "Barbell Bench Press",
    "Incline Dumbbell Press",
    "Incline Barbell Press",
    "Pec Fly Machine",
    "Pec Fly Cable",
    "Pec Fly Dumbbell",
    "Dips",
    "Machine Dips",
    "Weighted Dips",
    "Decline Dumbbell Press",
    "Decline Barbell Press",
    "Machine Flat Chest Press",
    "Machine Incline Chest Press",
    "Machine Decline Chest Press",
    "Flat Smith Press",
    "Incline Smith Press",
    "Decline Smith Press",
  ],
  Shoulders: [
    // Full delt
    "Shoulder Overhead Dumbbell Press",
    "Shoulder Overhead Barbell Press",
    "Shoulder Overhead Machine Press",
    "Shoulder Overhead Smith Press",
    // Side delt
    "Dumbbell Lateral Raises",
    "Machine Lateral Raises",
    "Cable Lateral Raises",
    "Y-Raise",
    // Rear delt
    "Pec Dec Rear Delt Flies",
    "Dumbbell Rear Delt Flies",
    "Cable Rear Delt Flies",
  ],
  Biceps: [
    "Machine Preacher Curl",
    "Standing Dumbbell Curl",
    "Incline Bench Dumbbell Curl",
    "Preacher Bench Curl",
    "Barbell Curl",
    "Cable EZ-Bar Curl",
    "Cable D-Handle Curl",
    "Cable Drag Curl",
    "Dumbbell Hammer Curl",
    "Rope Hammer Cable Curl",
    "Hammer Machine Curl",
  ],
  Triceps: [
    "Dips",
    "Machine Dips",
    "Weighted Dips",
    "Tricep Pushdown",
    "Skullcrushers",
    "Overhead Tricep Extension",
  ],
  // The arsenal's "Back" rows plus its "Upper Back Bias" high rows. The plain
  // rows land here rather than under Lats because the arsenal lists the
  // lat-focused versions separately ("Cable Lat Row" vs "Cable Row").
  "Upper Back": [
    "Machine Row",
    "Smith Machine Row",
    "Barbell Row",
    "T-Bar Row",
    "Landmine Row",
    "Dumbbell Row",
    "Cable Row",
    "High Machine Row",
    "High Cable Row",
    "Smith High Row",
  ],
  // The arsenal's "Lat bias" section.
  Lats: [
    "Cable Wide Pulldown",
    "Cable Close-Grip Pulldown",
    "Machine Wide Pulldown",
    "Machine Close-Grip Pulldown",
    "Cable Lat Row",
    "Machine Lat Row",
    "SA Bench Lat Pulldown",
    "SA Machine Lat Pulldown",
  ],
  Quads: [
    "Leg Press",
    "Barbell Squat",
    "Smith Machine Squat",
    "Hack Squat",
    "Pendulum Squat",
    "Hip Press",
    "Leg Extension",
    "Bulgarian Split Squat",
    // The arsenal's lone "Adductors" entry - there is no adductor group in
    // MUSCLE_OPTIONS, so it sits with the other lower-body machines.
    "Adductor Machine",
  ],
  Hamstrings: [
    "Seated Hamstring Curl",
    "Lying Hamstring Curl",
    "45 Degree Hinge",
    "Romanian Deadlift",
    "Stiff Leg Deadlift",
    "Deadlift",
  ],
  Glutes: [
    "Hip Thrust",
    "Banded 45 Degree Hinge",
    "Abduction Machine",
    "Glute Kickback",
    "Glute Biased Bulgarian Split Squat Dumbbell",
    "Glute Biased Bulgarian Split Squat Smith",
  ],
  Calves: ["Standing Calf Raise", "Seated Calf Raise", "Toe Press"],
  Core: [
    "Plank",
    "Cable Crunch",
    "Machine Crunch",
    "Hanging Leg Raises",
    "Lying Leg Raises",
    "Pallof Press",
  ],
};

export type LibraryExercise = { name: string; muscle: MuscleOption };

// Search needs the lowercased name and its individual words for every entry on
// every keystroke, so they're derived once at module load rather than per-match.
type IndexedExercise = LibraryExercise & {
  lowerName: string;
  lowerMuscle: string;
  words: string[];
};

function wordsOf(lowerName: string): string[] {
  return lowerName.split(/[^a-z0-9]+/).filter(Boolean);
}

const INDEX: IndexedExercise[] = MUSCLE_OPTIONS.flatMap((muscle) =>
  EXERCISE_LIBRARY[muscle].map((name) => {
    const lowerName = name.toLowerCase();
    return { name, muscle, lowerName, lowerMuscle: muscle.toLowerCase(), words: wordsOf(lowerName) };
  })
);

export const ALL_EXERCISES: LibraryExercise[] = INDEX.map(({ name, muscle }) => ({ name, muscle }));

// How well a single query token matches an exercise. Lower is better; null
// means no match at all, which disqualifies the exercise entirely (every token
// has to land somewhere, so "chest pre" can't match on "chest" alone).
function tokenTier(token: string, ex: IndexedExercise): number | null {
  if (ex.words.some((w) => w.startsWith(token))) return 0;
  // Substring rather than word-prefix: catches mid-word typing like "bell" and
  // the muscle name, so "chest" alone surfaces the whole Chest group.
  if (ex.lowerName.includes(token) || ex.lowerMuscle.includes(token)) return 1;
  return null;
}

/**
 * Ranked name matches for what the user has typed so far.
 *
 * Every whitespace-separated token must match, so "chest pre" narrows to the
 * chest presses rather than returning everything containing "chest". Results
 * are ordered strongest-match first: the whole query prefixing the name, then
 * every token starting a word, then looser substring hits - alphabetical within
 * each tier so the ordering is stable as the user types.
 */
export function searchExercises(query: string, limit = 40): LibraryExercise[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);

  const scored: { ex: IndexedExercise; tier: number }[] = [];
  for (const ex of INDEX) {
    let tier = 0;
    let matched = true;
    for (const token of tokens) {
      const t = tokenTier(token, ex);
      if (t === null) {
        matched = false;
        break;
      }
      tier = Math.max(tier, t);
    }
    if (!matched) continue;
    // Typing the start of a name outright is the strongest possible signal, so
    // it outranks even an all-word-prefix match.
    if (ex.lowerName.startsWith(trimmed)) tier = -1;
    scored.push({ ex, tier });
  }

  scored.sort((a, b) => a.tier - b.tier || a.ex.name.localeCompare(b.ex.name));
  return scored.slice(0, limit).map(({ ex }) => ({ name: ex.name, muscle: ex.muscle }));
}

// Muscle groups that actually have exercises, in MUSCLE_OPTIONS order - the
// browse list's section order. Guards against an empty heading if a group is
// ever left blank.
export const LIBRARY_GROUPS: { muscle: MuscleOption; names: string[] }[] = MUSCLE_OPTIONS
  .map((muscle) => ({ muscle, names: EXERCISE_LIBRARY[muscle] }))
  .filter((g) => g.names.length > 0);
