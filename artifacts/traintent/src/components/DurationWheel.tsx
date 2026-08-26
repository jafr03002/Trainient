// The minutes/seconds picker for a checklist item's duration - the phone alarm
// convention: two columns you scroll up and down, with the value under the
// centre band selected.
//
// The scrolling is the browser's own, not a JS animation: each column is an
// overflow-y scroller with `scroll-snap-type: y mandatory`, so momentum, rubber
// banding and touch feel are native on every platform, and a trackpad or a wheel
// works for free on desktop. All this component does is read where the scroll
// settled and report the value under the band.
//
// Keyboard users never scroll: each column is a spinbutton, so arrow keys step
// it and a screen reader announces the value.

import { useEffect, useRef, useState } from "react";
import { MAX_WHEEL_MINUTES } from "@/lib/checklistItems";

/**
 * Row height in px. The column shows three rows, so its height is 3x this.
 * 24 keeps the wheel readable while holding the whole control to 72px - the rows
 * either side of the band are what make it legible as a wheel rather than a
 * cropped list, so the row count is the last thing to give up when shrinking.
 */
const ITEM_H = 24;
const VISIBLE_ROWS = 3;

/** How long the scroll must be still before the settled value is committed. */
const SETTLE_MS = 90;

const MINUTES = Array.from({ length: MAX_WHEEL_MINUTES + 1 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);

function WheelColumn({
  values,
  value,
  onChange,
  label,
  accent,
  testId,
}: {
  values: number[];
  value: number;
  onChange: (next: number) => void;
  label: string;
  accent: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  // Which row is under the band right now, tracked separately from `value` so the
  // highlight follows the finger during the scroll rather than only after it stops.
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, values.indexOf(value)));

  const index = Math.max(0, values.indexOf(value));

  // Drive the scroll position from the prop. Guarded on the position already
  // being right, which is what stops the scroll handler and this effect from
  // chasing each other: after a user scroll the element is already where this
  // would put it, so nothing happens.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = index * ITEM_H;
    if (Math.abs(el.scrollTop - top) < 1) return;
    el.scrollTo({ top, behavior: "auto" });
    setActiveIndex(index);
  }, [index]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const nearest = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
    setActiveIndex(nearest);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (values[nearest] !== value) onChange(values[nearest]);
    }, SETTLE_MS);
  }

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Without this, page-scrolling past a checklist row on desktop would spin
  // whichever column the cursor happened to cross and silently rewrite a
  // programmed duration. So a mouse wheel only drives the column once it has
  // been clicked or tabbed into; otherwise the delta is handed back to the page.
  // Touch and trackpad panning are untouched - only `wheel` is intercepted, and
  // the listener has to be non-passive to be allowed to preventDefault at all.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (document.activeElement === el) return;
      e.preventDefault();
      window.scrollBy({ top: e.deltaY });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function step(delta: number) {
    const next = Math.max(0, Math.min(values.length - 1, index + delta));
    if (values[next] !== value) onChange(values[next]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    if (e.key in moves) {
      e.preventDefault();
      step(moves[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(values[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(values[values.length - 1]);
    }
  }

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={values[0]}
      aria-valuemax={values[values.length - 1]}
      aria-valuetext={`${value} ${label}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      title="Scroll, or use the arrow keys"
      className="h-[72px] w-[40px] cursor-ns-resize overflow-y-auto overscroll-contain rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        scrollSnapType: "y mandatory",
        // Fades the rows either side of the band so the column reads as a wheel
        // rather than a list that happens to be cropped.
        maskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
      }}
      data-testid={testId}
    >
      {/* One blank row above and below, so the first and last values can both
          reach the centre band. */}
      <div style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}>
        {values.map((v, i) => (
          <div
            key={v}
            onClick={() => onChange(v)}
            className={`flex items-center justify-center font-display tabular-nums cursor-pointer transition-[color,opacity] ${
              i === activeIndex ? "text-[15px] font-bold" : "text-[13px] text-muted-foreground opacity-45"
            }`}
            style={{
              height: ITEM_H,
              scrollSnapAlign: "center",
              color: i === activeIndex ? accent : undefined,
            }}
          >
            {String(v).padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DurationWheel({
  seconds,
  onChange,
  accent = "hsl(var(--foreground))",
  testId,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
  accent?: string;
  testId?: string;
}) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.min(MAX_WHEEL_MINUTES, Math.floor(safe / 60));
  const secs = safe % 60;

  return (
    // w-fit so the selected-row band hugs the two columns. Without it the band
    // stretches to whatever cell the wheel is placed in, which since it moved
    // into the field grid would be the full width of that column.
    <div className="relative mx-auto flex w-fit items-center justify-center gap-1 select-none">
      {/* The band that marks the selected row. Sits above the columns and takes
          no pointer events, so it never eats a scroll or a tap. */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-md border-y border-border/70 bg-secondary/30"
        style={{ height: ITEM_H, top: (VISIBLE_ROWS - 1) / 2 * ITEM_H }}
        aria-hidden
      />
      <WheelColumn
        values={MINUTES}
        value={minutes}
        onChange={(m) => onChange(m * 60 + secs)}
        label="minutes"
        accent={accent}
        testId={testId ? `${testId}-minutes` : undefined}
      />
      {/* A colon rather than the words "min" and "sec": left-is-minutes is the
          universal clock convention, and dropping the two labels is most of what
          lets the control sit in 40px-wide columns. The columns still announce
          themselves properly - the words live on their aria-labels. */}
      <span className="relative font-display text-sm font-bold text-muted-foreground">:</span>
      <WheelColumn
        values={SECONDS}
        value={secs}
        onChange={(s) => onChange(minutes * 60 + s)}
        label="seconds"
        accent={accent}
        testId={testId ? `${testId}-seconds` : undefined}
      />
    </div>
  );
}
