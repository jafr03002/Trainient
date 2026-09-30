// The splash screen is static markup in index.html so it paints before this
// bundle loads. It fades out once the app has something to show - Clerk has
// loaded, so the page underneath isn't blank (src/App.tsx) - and not before its
// animation has played (the sun lands as the "i"'s dot at ~1.65s).
const MIN_VISIBLE_MS = 1900;
const REDUCED_MOTION_MS = 600;
const FADE_MS = 350;
// Clerk can fail to load at all (offline, its CDN blocked), and a splash that
// waits for it forever is worse than a blank page, so it gives up after this.
const MAX_VISIBLE_MS = 6000;

let dismissed = false;

export function dismissSplash() {
  if (dismissed) return;
  dismissed = true;
  const splash = document.getElementById("splash");
  if (!splash) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = Math.max(0, (reduced ? REDUCED_MOTION_MS : MIN_VISIBLE_MS) - performance.now());
  window.setTimeout(() => {
    splash.classList.add("splash-out");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, wait);
}

// The backstop for when the app never reports ready.
export function dismissSplashEventually() {
  window.setTimeout(dismissSplash, Math.max(0, MAX_VISIBLE_MS - performance.now()));
}
