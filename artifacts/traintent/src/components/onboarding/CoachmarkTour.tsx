import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CoachRobot } from "@/components/CoachRobot";

// A single coachmark step.
// - "info" (the default): an explanatory bubble anchored to a real element via
//   `target`, advanced with Next.
// - "center": an unanchored bubble shown in the middle of the screen (no
//   highlight ring) - for a general "you're on page X" intro that doesn't point
//   at any one element. Still counted/numbered and advanced with Next.
// - "navClick": the user must tap the highlighted element to advance - a real
//   nav link, or a page's primary action (e.g. "Create your program"). These
//   steps hide the Next button and skip the auto scrollIntoView, so the tour
//   hands the user off to the real UI instead of driving it for them (see
//   useNavTourTarget/useNavTourClick in components/layout.tsx).
// - "awaitAction": the same hand-off, but for an element the page itself owns
//   (a logged session, a dialog's close button). The page reports the outcome
//   of the action through `done`, and the step advances when that flips true -
//   so the user has to really perform it, not just read about it.
//
// Anchored steps can also carry a `spotlight`: the element to cut out of the
// dimming backdrop, when that should be bigger than the ringed target. The
// calendar's last step rings the session sheet's close button but spotlights
// the whole sheet, so the session the user just opened reads at full contrast
// instead of sitting under the same scrim as the page behind it. Defaults to
// `target`.
export type CoachmarkStep =
  | { kind?: "info"; target: RefObject<HTMLElement | null>; text: string; spotlight?: RefObject<HTMLElement | null> }
  | { kind: "center"; text: string }
  | { kind: "navClick"; target: RefObject<HTMLElement | null>; text: string; spotlight?: RefObject<HTMLElement | null> }
  | {
      kind: "awaitAction";
      target: RefObject<HTMLElement | null>;
      text: string;
      done: boolean;
      spotlight?: RefObject<HTMLElement | null>;
    };

type Rect = { top: number; left: number; width: number; height: number };

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

// How far the undimmed hole extends past the spotlit element, and how round its
// corners are - a touch wider than the highlight ring (4px at rect - 4) so the
// ring itself lands on clean, undimmed background.
const HOLE_PAD = 8;
const HOLE_RADIUS = 14;

// The scrim's `clip-path`: everything except a rounded hole over `hole`. The
// outer ring is deliberately far larger than any viewport, so the path never has
// to be rebuilt when the window resizes. Clipped-away pixels aren't painted and
// aren't hit-tested, so the hole is both bright and clickable.
function scrimClipPath(hole: Rect): string {
  const x = hole.left - HOLE_PAD;
  const y = hole.top - HOLE_PAD;
  const w = hole.width + HOLE_PAD * 2;
  const h = hole.height + HOLE_PAD * 2;
  const r = Math.max(0, Math.min(HOLE_RADIUS, w / 2, h / 2));
  const outer = "M-20000,-20000 H20000 V20000 H-20000 Z";
  const inner =
    `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} ` +
    `V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} ` +
    `H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  return `path(evenodd, "${outer} ${inner}")`;
}

const BUBBLE_WIDTH = 320;

// Coach's rendered box, as laid out by `coachAt` below: 30px square, inset 12px
// (left-3 / right-3) from a top corner of the bubble and lifted 36px (-top-9)
// above its top edge.
const COACH_SIZE = 30;
const COACH_INSET = 12;
const COACH_LIFT = 36;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

// How long a freshly-opened step keeps re-measuring its target, in ms. Long
// enough to outlast the entrance animation of anything a step points into (the
// calendar's session sheet is the slowest at 220ms) with room for the frame the
// step itself costs.
const SETTLE_MS = 450;

// Numbered, anchored coachmark sequence - points directly at a real element on
// the page rather than explaining it in a separate full-screen deck. Shared by
// the Dashboard, Program, Log and Calendar page first-time tours (see the *TourSeenAt
// profile fields for how each caller decides whether to render this).
// Optionally opens with a full-screen `intro` card (Skip / Let's go) before the
// anchored steps, and a `navClick`/`awaitAction` final step can end the tour by
// directing the user to tap something real rather than acting for them.
export function CoachmarkTour({
  steps,
  onDone,
  testIdPrefix,
  intro,
}: {
  steps: CoachmarkStep[];
  onDone: () => void;
  testIdPrefix: string;
  intro?: { text: string; cta?: string };
}) {
  const [phase, setPhase] = useState<"intro" | "steps">(intro ? "intro" : "steps");
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [holeRect, setHoleRect] = useState<Rect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(160);
  const total = steps.length;
  const isLast = step === total - 1;
  const current = steps[step];
  const isCenter = current?.kind === "center";
  // Steps the user has to act on (a nav link, a session, a close button) need a
  // click-through backdrop; every other surface (intro card, centered/anchored
  // bubbles) can be dismissed by clicking the dimmed backdrop.
  const handsOff = current?.kind === "navClick" || current?.kind === "awaitAction";
  const dismissable = phase === "intro" || !handsOff;

  // Ending the tour hides it here and now, rather than waiting for the caller's
  // `onDone` to land. Callers persist a *TourSeenAt flag and only stop rendering
  // us once the profile round-trip comes back, which used to leave the last
  // bubble on screen in the gap - and on screen forever if the write failed,
  // with no Next button (a hand-off step hides it) and a click-through scrim.
  // The tour is over the moment the user finishes it, whatever the network does.
  const end = useCallback(() => {
    setFinished(true);
    onDone();
  }, [onDone]);

  // Escape always ends the tour, so a user who somehow can't reach Skip/Next
  // (an unusual viewport, a mispositioned bubble) is never trapped behind the
  // overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end]);

  // An awaitAction step is advanced by the page rather than by a Next button:
  // the moment it reports the action done, move on (or end the tour if it was
  // the last step). Latched per step so a `done` that stays true - and an
  // `onDone` whose identity changes every parent render - can't fire twice.
  // Runs before paint: the action that satisfies the step usually destroys the
  // element the step points at (closing a dialog removes its close button), so
  // deferring to a passive effect paints one frame of a bubble and ring stranded
  // over whatever is underneath.
  const awaitDone = current?.kind === "awaitAction" && current.done;
  const settledStepRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (phase !== "steps" || !awaitDone) return;
    if (settledStepRef.current === step) return;
    settledStepRef.current = step;
    if (isLast) end();
    else setStep((s) => s + 1);
  }, [awaitDone, step, isLast, end, phase]);

  useLayoutEffect(() => {
    if (phase !== "steps") return;
    // Centered steps aren't anchored to anything - nothing to measure or scroll.
    const el = current && current.kind !== "center" ? current.target.current : null;
    if (!el) {
      setRect(null);
      setHoleRect(null);
      return;
    }
    // The area cut out of the scrim - the step's own `spotlight` when it names
    // one, otherwise the ringed target itself.
    const holeEl = (current && current.kind !== "center" ? current.spotlight?.current : null) ?? el;
    // Commit only real movement: `rect` feeds the bubble's height measurement
    // below, and handing it a fresh object per frame spins that into a render
    // loop that starves the page.
    let last: Rect | null = null;
    let lastHole: Rect | null = null;
    const measureNow = () => {
      const r = measure(el);
      if (!sameRect(r, last)) {
        last = r;
        setRect(r);
      }
      const hr = holeEl === el ? r : measure(holeEl);
      if (!sameRect(hr, lastHole)) {
        lastHole = hr;
        setHoleRect(hr);
      }
    };
    const bringIntoView = () => {
      // Instant (not smooth) so the measurement reflects the settled position
      // immediately instead of racing a scroll animation. Hand-off steps aren't
      // scrolled at all: their targets are already on screen (a nav link, an
      // open dialog), and re-centering on every resize would shift the page out
      // from under the tap the step is asking the user to make.
      if (!handsOff) el.scrollIntoView({ block: "center" });
      measureNow();
    };
    bringIntoView();

    // A target usually animates into its final place just after the step opens:
    // the calendar's session sheet slides its panel up 40px over 220ms, carrying
    // the close button the last step points at. A transform changes no box size
    // and fires no scroll event, so neither the observer nor the listeners below
    // would ever hear about it, and the ring would stay pinned 40px under the
    // button. Re-measure each frame while the target settles - then stop, because
    // an unbounded loop is a frame of work every frame for the whole tour.
    let raf = 0;
    const settleUntil = performance.now() + SETTLE_MS;
    const settle = () => {
      measureNow();
      if (performance.now() < settleUntil) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);

    // The dashboard opens the tour before its data has loaded, so the page grows
    // taller underneath the target after the first measurement - which is
    // exactly how a user ends up stranded with the highlight far below the fold.
    // Re-center whenever the page (or the target) resizes, and keep the rect in
    // sync with scroll/resize.
    const ro = new ResizeObserver(() => bringIntoView());
    ro.observe(document.body);
    ro.observe(el);
    if (holeEl !== el) ro.observe(holeEl);
    window.addEventListener("resize", measureNow);
    window.addEventListener("scroll", measureNow, true);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measureNow);
      window.removeEventListener("scroll", measureNow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.kind, phase]);

  // Measure the live bubble so the anchored placement below can keep the whole
  // box - Skip/Next included - inside the viewport on short screens.
  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  }, [step, phase, rect, current?.text]);

  // Dimming backdrop rendered behind every tour surface so the info box stands
  // out from the page. Clicking it dismisses the tour, except on a hand-off
  // step, where it stays pointer-events-none so it never blocks the real
  // element the user needs to tap.
  //
  // An anchored step punches a hole in it over the spotlit element. Dimming the
  // very thing a step tells you to tap reads as "disabled, don't touch"; leaving
  // it at full contrast is what makes it look pressable, and lets the step's
  // ring stand out against the page rather than against a grey wash.
  // The dimming and the click target are two layers on purpose: the dark one is
  // clipped (and so never hit-tested over the hole), while a transparent
  // full-screen catcher keeps "click the backdrop to dismiss" covering the whole
  // viewport. Without it, the hole would quietly turn into a live click-through
  // on steps that only mean to point at something.
  const spotlit = phase === "steps" && !isCenter && holeRect;
  const scrim = (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 pointer-events-none transition-[clip-path] duration-200"
        style={spotlit ? { clipPath: scrimClipPath(holeRect!) } : undefined}
        aria-hidden
      />
      {dismissable && <div className="fixed inset-0 z-[60]" aria-hidden onClick={end} />}
    </>
  );

  // Coach, the AI coach mascot, perches on a top corner of every tour box. He's
  // a child of the box element (never the scrim), so he always paints on top of
  // the dimming backdrop and keeps his bright blue - he never darkens with the
  // page behind it.
  //
  // He overhangs the box's top edge, which puts him over whatever sits above the
  // bubble - and when the bubble is anchored just below a small target, that is
  // the target itself. On the calendar's last step he sat squarely on the session
  // sheet's close button, hiding both the X and its highlight ring. The anchored
  // branch below picks the corner that keeps him off the target.
  const coachAt = (side: "left" | "right") => (
    <CoachRobot
      size={COACH_SIZE}
      className={`pointer-events-none absolute -top-9 ${side === "left" ? "left-3" : "right-3"} drop-shadow-[0_5px_9px_rgba(23,55,110,0.35)]`}
    />
  );
  // Unanchored surfaces (intro card, centered bubble) have no target to dodge.
  const coach = coachAt("left");

  if (finished) return null;

  if (phase === "intro" && intro) {
    return (
      <>
        {scrim}
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={end}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm p-5 rounded-xl bg-primary text-primary-foreground shadow-xl"
            data-testid={`${testIdPrefix}-intro`}
          >
            {coach}
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Quick tour</div>
            <p className="text-sm font-medium mt-1 leading-relaxed">{intro.text}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={end}
                className="text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
                data-testid={`${testIdPrefix}-intro-skip`}
              >
                Skip tour
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setPhase("steps")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-foreground text-primary hover:opacity-90 transition-opacity"
                data-testid={`${testIdPrefix}-intro-next`}
              >
                {intro.cta ?? "Let's go"}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!current) return null;
  // Anchored steps need a measured rect; centered steps don't.
  if (!isCenter && !rect) return null;

  // Shared bubble body (numbering, copy, Skip / Next) - reused by both the
  // centered and the anchored placements below.
  const bubbleBody = (
    <>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
        Step {step + 1} of {total}
      </div>
      <p className="text-sm font-medium mt-1 leading-relaxed">{current.text}</p>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={end}
          className="text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
          data-testid={`${testIdPrefix}-skip`}
        >
          Skip tour
        </button>
        <div className="flex-1" />
        {!handsOff && (
          <button
            onClick={() => (isLast ? end() : setStep((s) => s + 1))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-foreground text-primary hover:opacity-90 transition-opacity"
            data-testid={`${testIdPrefix}-next`}
          >
            {isLast ? "Done" : "Next"}
          </button>
        )}
      </div>
    </>
  );

  if (isCenter) {
    return (
      <>
        {scrim}
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={dismissable ? end : undefined}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm p-4 rounded-xl bg-primary text-primary-foreground shadow-xl"
            data-testid={`${testIdPrefix}-bubble`}
          >
            {coach}
            {bubbleBody}
          </div>
        </div>
      </>
    );
  }

  const spaceBelow = window.innerHeight - (rect!.top + rect!.height);
  const placeAbove = spaceBelow < 180;
  // Keep the whole bubble on-screen regardless of where the target sits.
  // TOP_MARGIN leaves room for the Coach mascot, which overhangs the bubble's
  // top edge (-top-9). Without this vertical clamp the bubble - and its
  // Skip/Next buttons - can land below the fold on a short viewport.
  const TOP_MARGIN = 44;
  const BOTTOM_MARGIN = 12;
  const desiredTop = placeAbove ? rect!.top - 8 - bubbleH : rect!.top + rect!.height + 8;
  const maxTop = window.innerHeight - bubbleH - BOTTOM_MARGIN;
  const bubbleTop = Math.min(Math.max(desiredTop, TOP_MARGIN), Math.max(TOP_MARGIN, maxTop));
  const bubbleLeft = Math.min(Math.max(rect!.left, 16), window.innerWidth - 16 - BUBBLE_WIDTH);

  // Keep Coach off the highlighted element. He hangs above the bubble's top
  // edge, so a bubble anchored under a small target puts him right on top of it
  // - the calendar's close-button step is the case that bit. Both corners are
  // measured against the ring (the target plus its 4px halo); the near corner
  // wins unless it collides, and if the target is wide enough to swallow both,
  // the default corner is no worse than the alternative.
  const coachBox = (side: "left" | "right"): Rect => ({
    top: bubbleTop - COACH_LIFT,
    left: side === "left" ? bubbleLeft + COACH_INSET : bubbleLeft + BUBBLE_WIDTH - COACH_INSET - COACH_SIZE,
    width: COACH_SIZE,
    height: COACH_SIZE,
  });
  const ringBox: Rect = { top: rect!.top - 4, left: rect!.left - 4, width: rect!.width + 8, height: rect!.height + 8 };
  const coachSide = overlaps(coachBox("left"), ringBox) && !overlaps(coachBox("right"), ringBox) ? "right" : "left";

  return (
    <>
      {scrim}
      <div
        className="fixed z-[60] rounded-lg ring-4 ring-primary/40 pointer-events-none transition-all duration-200"
        style={ringBox}
      />
      <div
        ref={bubbleRef}
        className="fixed z-[60] p-4 rounded-xl bg-primary text-primary-foreground shadow-xl transition-all duration-200"
        style={{ top: bubbleTop, left: bubbleLeft, width: BUBBLE_WIDTH }}
        data-testid={`${testIdPrefix}-bubble`}
      >
        {coachAt(coachSide)}
        {bubbleBody}
      </div>
    </>
  );
}
