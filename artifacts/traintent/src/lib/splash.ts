// The splash screen is static markup in index.html so it paints before this
// bundle loads. Once the app has rendered, hold it until its animation has
// played (the sun lands as the "i"'s dot at ~1.65s), then fade it out.
const MIN_VISIBLE_MS = 1900;
const REDUCED_MOTION_MS = 600;
const FADE_MS = 350;

export function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = Math.max(0, (reduced ? REDUCED_MOTION_MS : MIN_VISIBLE_MS) - performance.now());
  window.setTimeout(() => {
    splash.classList.add("splash-out");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, wait);
}
