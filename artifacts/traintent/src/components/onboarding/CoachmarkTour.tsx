import { useLayoutEffect, useState, type RefObject } from "react";

// A single coachmark step.
// - "info" (the default): an explanatory bubble anchored to a real element via
//   `target`, advanced with Next.
// - "center": an unanchored bubble shown in the middle of the screen (no
//   highlight ring) - for a general "you're on page X" intro that doesn't point
//   at any one element. Still counted/numbered and advanced with Next.
// - "navClick": the user must tap the highlighted element - a real nav link -
//   to advance. These steps hide the Next button and skip the auto
//   scrollIntoView, so the tour ends by handing the user off to the app's nav
//   instead of navigating for them (see useNavTourTarget/useNavTourClick in
//   components/layout.tsx).
export type CoachmarkStep =
  | { kind?: "info"; target: RefObject<HTMLElement | null>; text: string }
  | { kind: "center"; text: string }
  | { kind: "navClick"; target: RefObject<HTMLElement | null>; text: string };

type Rect = { top: number; left: number; width: number; height: number };

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const BUBBLE_WIDTH = 320;

// Numbered, anchored coachmark sequence - points directly at a real element on
// the page rather than explaining it in a separate full-screen deck. Shared by
// the Dashboard, Program, and Log page first-time tours (see the *TourSeenAt
// profile fields for how each caller decides whether to render this).
// Optionally opens with a full-screen `intro` card (Skip / Let's go) before the
// anchored steps, and a `navClick` final step can end the tour by directing the
// user to tap a real nav link rather than auto-navigating for them.
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
  const [rect, setRect] = useState<Rect | null>(null);
  const total = steps.length;
  const isLast = step === total - 1;
  const current = steps[step];
  const isCenter = current?.kind === "center";

  useLayoutEffect(() => {
    if (phase !== "steps") return;
    // Centered steps aren't anchored to anything - nothing to measure or scroll.
    const el = current && current.kind !== "center" ? current.target.current : null;
    if (!el) {
      setRect(null);
      return;
    }
    if (current.kind !== "navClick") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const update = () => setRect(measure(el));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.kind, phase]);

  // Dimming backdrop rendered behind every tour surface so the info box stands
  // out from the page. pointer-events-none so it never blocks the real nav
  // links a `navClick` step needs the user to tap.
  const scrim = <div className="fixed inset-0 z-[60] bg-black/60 pointer-events-none" aria-hidden />;

  if (phase === "intro" && intro) {
    return (
      <>
        {scrim}
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm p-5 rounded-xl bg-primary text-primary-foreground shadow-xl"
            data-testid={`${testIdPrefix}-intro`}
          >
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Quick tour</div>
            <p className="text-sm font-medium mt-1 leading-relaxed">{intro.text}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onDone}
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
          onClick={onDone}
          className="text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
          data-testid={`${testIdPrefix}-skip`}
        >
          Skip tour
        </button>
        <div className="flex-1" />
        {current.kind !== "navClick" && (
          <button
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm p-4 rounded-xl bg-primary text-primary-foreground shadow-xl"
            data-testid={`${testIdPrefix}-bubble`}
          >
            {bubbleBody}
          </div>
        </div>
      </>
    );
  }

  const spaceBelow = window.innerHeight - (rect!.top + rect!.height);
  const placeAbove = spaceBelow < 180;
  const bubbleTop = placeAbove ? rect!.top - 8 : rect!.top + rect!.height + 8;
  const bubbleLeft = Math.min(Math.max(rect!.left, 16), window.innerWidth - 16 - BUBBLE_WIDTH);

  return (
    <>
      {scrim}
      <div
        className="fixed z-[60] rounded-lg ring-4 ring-primary/40 pointer-events-none transition-all duration-200"
        style={{ top: rect!.top - 4, left: rect!.left - 4, width: rect!.width + 8, height: rect!.height + 8 }}
      />
      <div
        className="fixed z-[60] p-4 rounded-xl bg-primary text-primary-foreground shadow-xl transition-all duration-200"
        style={{
          top: bubbleTop,
          left: bubbleLeft,
          width: BUBBLE_WIDTH,
          transform: placeAbove ? "translateY(-100%)" : undefined,
        }}
        data-testid={`${testIdPrefix}-bubble`}
      >
        {bubbleBody}
      </div>
    </>
  );
}
