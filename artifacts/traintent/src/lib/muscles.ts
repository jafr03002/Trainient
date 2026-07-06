// The 11 canonical muscle-group options used across program building,
// progress tracking, and onboarding — single source so they can't drift out
// of alignment with each other again.
export const MUSCLE_OPTIONS = [
  "Chest", "Shoulders", "Biceps", "Triceps", "Upper Back",
  "Lats", "Quads", "Hamstrings", "Glutes", "Calves", "Core",
] as const;

// Single source for muscle-group colors, keyed by the MUSCLE_OPTIONS labels —
// used by the onboarding/progress volume charts and the program page's muscle
// badges, so they can't drift out of sync with each other.
export const MUSCLE_COLORS: Record<string, string> = {
  Chest: "hsl(217, 91%, 60%)",
  Shoulders: "hsl(280, 68%, 60%)",
  Biceps: "hsl(38, 92%, 50%)",
  Triceps: "hsl(24, 90%, 55%)",
  "Upper Back": "hsl(142, 71%, 45%)",
  Lats: "hsl(160, 84%, 39%)",
  Quads: "hsl(0, 72%, 51%)",
  Hamstrings: "hsl(350, 75%, 55%)",
  Glutes: "hsl(316, 73%, 52%)",
  Calves: "hsl(199, 89%, 48%)",
  Core: "hsl(90, 60%, 45%)",
};
