import type { LoggedExercise } from "@/lib/workoutSession";

export type SetPosition = { exIdx: number; setIdx: number };

/**
 * The set the user should log next: the first lift set, in page order, without
 * both weight and reps. Checklist items are skipped - a warmup left unticked
 * shouldn't hold the page at the top once the lifting has started. Null when
 * every lift set is logged.
 */
export function findNextUnloggedSet(logs: LoggedExercise[]): SetPosition | null {
  for (let exIdx = 0; exIdx < logs.length; exIdx++) {
    const ex = logs[exIdx];
    if (ex.kind === "checklist") continue;
    const setIdx = ex.sets.findIndex((s) => !s.completed);
    if (setIdx >= 0) return { exIdx, setIdx };
  }
  return null;
}

export function hasAnyLoggedSet(logs: LoggedExercise[]): boolean {
  return logs.some((ex) => ex.kind !== "checklist" && ex.sets.some((s) => s.completed));
}

/**
 * Glide the set row into the middle of the screen and give it one faint glow so
 * the eye lands on it. Reduced-motion users get an instant jump and no glow.
 */
export function scrollToSet({ exIdx, setIdx }: SetPosition) {
  const row = document.querySelector<HTMLElement>(`[data-set-row="${exIdx}-${setIdx}"]`);
  if (!row) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  if (!reduceMotion) {
    // Raw rgba rather than the foreground token: var() inside Web Animations
    // keyframes isn't reliable across the mobile browsers we care about.
    row.animate(
      [{ backgroundColor: "rgba(244, 244, 247, 0.07)" }, { backgroundColor: "rgba(244, 244, 247, 0)" }],
      { duration: 1400, easing: "ease-out", delay: 250 }
    );
  }
}
