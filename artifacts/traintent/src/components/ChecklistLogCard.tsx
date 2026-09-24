// The logger's card for a timed checklist item.
//
// The card IS the progress bar: purple sweeps left to right across it as the
// hold runs, instead of draining a 40px ring beside the digits. At arm's length
// on a gym floor a filling card is readable without looking straight at it,
// which a thin arc is not.
//
// Completing is a swipe. The tick button it replaces is still in the DOM and
// still focusable - swipe is unreachable by keyboard and invisible to a screen
// reader, so it can be the primary gesture but never the only one.

import { useRef, useState } from "react";
import { Pause, Play, RotateCcw, Check, ChevronRight } from "lucide-react";
import { formatDuration } from "@/lib/checklistItems";

/** Fraction of the card's width a drag must cross to count as a completion. */
const COMMIT_AT = 0.55;

/** Travel before the gesture claims an axis. Below this it could still be a scroll. */
const AXIS_SLOP = 6;

export function ChecklistLogCard({
  name,
  accent,
  label,
  completedRounds,
  targetRounds,
  remaining,
  total,
  isRunning,
  isPaused,
  onCompleteRound,
  onStart,
  onPause,
  onReset,
  testId,
}: {
  name: string;
  accent: string;
  label: string;
  completedRounds: number;
  targetRounds: number;
  remaining: number;
  total: number;
  isRunning: boolean;
  isPaused: boolean;
  onCompleteRound: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  testId?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  // While dragging, the fill follows the finger instead of the clock. The
  // distance lives on the ref as well as in state: a quick flick can deliver
  // pointerdown, pointermove and pointerup inside a single React batch, so by
  // the time the release is handled `dragPct` may not have committed yet. State
  // drives what is painted; the ref is what the commit decision reads.
  const [dragPct, setDragPct] = useState<number | null>(null);
  const gesture = useRef<{ x: number; y: number; axis: "none" | "x" | "y"; pct: number } | null>(null);

  const elapsedPct = total > 0 ? Math.min(100, Math.max(0, (1 - remaining / total) * 100)) : 0;
  const pct = dragPct ?? elapsedPct;
  const committing = dragPct != null && dragPct >= COMMIT_AT * 100;

  function onPointerDown(e: React.PointerEvent) {
    gesture.current = { x: e.clientX, y: e.clientY, axis: "none", pct: 0 };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    // Axis lock. The logger is a long vertical list, so a horizontal drag must
    // prove itself before it takes over - otherwise scrolling past a timed item
    // would snag on it. Vertical wins ties and ends the gesture outright, which
    // leaves the browser's own scrolling untouched.
    if (g.axis === "none") {
      if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      g.axis = "x";
      // Capture keeps the drag alive if the finger leaves the card, but it
      // throws if the pointer is no longer active - which must not take the
      // rest of this handler down with it, or the drag silently never starts.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already released - the gesture still works without capture */
      }
    }

    const width = cardRef.current?.offsetWidth ?? 1;
    g.pct = Math.min(100, Math.max(0, (dx / width) * 100));
    setDragPct(g.pct);
  }

  function endGesture() {
    const g = gesture.current;
    gesture.current = null;
    setDragPct(null);
    if (!g || g.axis !== "x") return;
    if (g.pct >= COMMIT_AT * 100) onCompleteRound();
  }

  const roundLabel =
    targetRounds > 1 ? `round ${Math.min(completedRounds + 1, targetRounds)} of ${targetRounds}` : null;

  return (
    <div
      ref={cardRef}
      // pan-y keeps vertical scrolling with the browser; only horizontal
      // movement ever reaches the handlers above.
      className="relative select-none touch-pan-y overflow-hidden rounded-[26px] bg-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      data-testid={testId}
    >
      {/* The fill. Purely decorative - the real state is `remaining`, so this
          never needs to be trusted for correctness. Sessions keeps it a plain
          surface step (card -> secondary) rather than a colour wash; the
          category colour is left to the small label under the name. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-secondary"
        style={{ width: `${pct}%`, transition: dragPct == null ? "width 240ms linear" : "none" }}
        data-testid={testId ? `${testId}-fill` : undefined}
      />

      <div className="relative flex items-center gap-3 py-3.5 pl-4 pr-5">
        {/* Visually hidden until focused. Keeps a real, operable control for
            keyboard and assistive tech - the swipe has no visible button. */}
        <button
          onClick={onCompleteRound}
          className="sr-only focus:not-sr-only focus:relative focus:flex focus:h-10 focus:w-10 focus:shrink-0 focus:items-center focus:justify-center focus:rounded-full focus:bg-white focus:text-black"
          data-testid={testId ? `${testId}-complete` : undefined}
        >
          <Check className="w-4 h-4" aria-hidden />
          <span className="sr-only">
            Complete {roundLabel ? `${roundLabel} of ` : ""}{name}
          </span>
        </button>

        <button
          onClick={() => (isRunning ? onPause() : onStart())}
          // Stops the button's own press from being read as the start of a swipe.
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isRunning ? `Pause ${name}` : `Start ${name}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {isRunning ? <Pause className="h-4 w-4 fill-current" strokeWidth={0} /> : <Play className="ml-0.5 h-4 w-4 fill-current" strokeWidth={0} />}
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-normal text-foreground">{name}</h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            <span className="font-medium" style={{ color: accent }}>{label}</span>
            {" · "}{formatDuration(total)}
            {roundLabel && <> · {roundLabel}</>}
          </p>
        </div>

        {(isRunning || isPaused) && (
          <button
            onClick={onReset}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Reset ${name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            data-testid={testId ? `${testId}-reset` : undefined}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        )}

        <div
          className="shrink-0 whitespace-nowrap text-[26px] font-light tracking-[-0.02em] tabular-nums text-foreground"
          data-testid={testId ? `${testId}-digits` : undefined}
          // The countdown changes every second; announcing each tick would
          // drown out everything else.
          aria-live="off"
        >
          {formatDuration(remaining)}
        </div>
      </div>

      {/* Swipe affordance. Sits under the row so it never competes with the
          controls, and states the commitment point once the drag is underway. */}
      <div className="relative -mt-1.5 flex items-center gap-1 pb-2.5 pl-[68px] pr-5 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
        {committing ? (
          <span className="text-foreground">Release to complete</span>
        ) : (
          <>
            <ChevronRight className="timer-hint-chev w-3 h-3" />
            <ChevronRight className="timer-hint-chev w-3 h-3 -ml-2" />
            <ChevronRight className="timer-hint-chev w-3 h-3 -ml-2" />
            <span className="ml-1">Swipe to complete</span>
          </>
        )}
      </div>
    </div>
  );
}
