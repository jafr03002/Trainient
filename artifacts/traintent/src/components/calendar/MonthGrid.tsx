import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { LiquidGlass, type LiquidGlassHandle } from "liquid-glass-web-react";
import { phaseLabel, phaseSolid } from "@/lib/phaseColors";

export type MonthDay = {
  date: string; // YYYY-MM-DD
  day: number;
  isToday: boolean;
  isPast: boolean;
  trained: boolean;
  planned: boolean;
  /** The phase painted on this day (already calibration-suppressed), if any. */
  phase: string | null;
  /** First day of its phase run - the band's end goes fully round here. */
  phaseStart: boolean;
  /** Where the band carries the phase's name: its start, or the 1st of the month inside a run. */
  phaseNamed: boolean;
  /** Last day of its phase run. */
  phaseEnd: boolean;
  ariaLabel: string;
};

type MonthGridProps = {
  /** Leading blank cells before the 1st (Monday-first). */
  padding: number;
  days: MonthDay[];
  selected: string;
  onSelect: (date: string) => void;
  /** Tapping the day that's already selected (or Enter on it). */
  onActivate: (date: string) => void;
  /** Reports the selected day's column centre, 0..1 of the grid width, for the storm's light. */
  onColumnChange?: (x: number) => void;
};

const ROW_H = 62;
const ROW_GAP = 4;
const DISC = 36;
const DISC_TOP = 6;
const LENS = 48;

/**
 * The month as seven columns of days, with a liquid-glass lens as the
 * selection.
 *
 * Phases are continuous bands behind the days (one rounded grey band per run
 * per week, named where it starts, with the phase colour only in a small dot).
 * A day you trained is a solid white disc, a planned one is outlined, and
 * today is marked by a small white dot under its number.
 *
 * The lens is liquid-glass-web-react refracting the grid itself: it magnifies
 * the disc under it and bends the band edges. It moves on a slightly
 * underdamped spring and stretches along its velocity, so a jump across the
 * month reads as liquid rather than a box sliding. A horizontal drag scrubs the
 * lens along the week under the finger (vertical drags still scroll the page),
 * and pressing the selected day squeezes it.
 */
export function MonthGrid({ padding, days, selected, onSelect, onActivate, onColumnChange }: MonthGridProps) {
  const glassRef = useRef<LiquidGlassHandle>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const rows = Math.ceil((padding + days.length) / 7);

  // Lens physics, all in px of the glass element. Nothing here goes through React state.
  const sim = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, scale: 1, tScale: 1, raf: 0, ready: false, w: LENS, h: LENS });
  const reduceMotion = useRef(false);
  const drag = useRef<{ id: number; x0: number; y0: number; row: number; scrubbing: boolean; onSelected: boolean } | null>(null);
  const suppressClick = useRef(false);

  const centreOf = useCallback((date: string) => {
    const host = glassRef.current?.element;
    const cell = cellRefs.current.get(date);
    if (!host || !cell) return null;
    const hr = host.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    return { x: cr.left - hr.left + cr.width / 2, y: cr.top - hr.top + DISC_TOP + DISC / 2, hw: hr.width, hh: hr.height };
  }, []);

  const apply = useCallback(() => {
    const engine = glassRef.current?.engine;
    const host = glassRef.current?.element;
    if (!engine || !host) return;
    const s = sim.current;
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    // Stretch along the motion, keep the area roughly constant.
    const stretchX = Math.min(0.42, Math.abs(s.vx) / 1300);
    const stretchY = Math.min(0.3, Math.abs(s.vy) / 1500);
    const w = Math.round(LENS * s.scale * (1 + stretchX - stretchY * 0.4));
    const h = Math.round(LENS * s.scale * (1 + stretchY - stretchX * 0.35));
    if (w !== s.w || h !== s.h) {
      s.w = w;
      s.h = h;
      engine.setOptions({ width: w, height: h });
    }
    engine.setPosition(s.x / W, s.y / H);
  }, []);

  const step = useCallback(
    (now: number, last: { t: number }) => {
      const s = sim.current;
      const dt = Math.min(0.032, (now - last.t) / 1000);
      last.t = now;
      // A little under critical damping: the lens overshoots by a hair and settles.
      const k = 420;
      const c = 2 * Math.sqrt(k) * 0.74;
      s.vx += (k * (s.tx - s.x) - c * s.vx) * dt;
      s.vy += (k * (s.ty - s.y) - c * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.scale += (s.tScale - s.scale) * (1 - Math.exp(-dt * 18));
      apply();
      const settled =
        Math.abs(s.tx - s.x) < 0.3 && Math.abs(s.ty - s.y) < 0.3 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4 && Math.abs(s.tScale - s.scale) < 0.004;
      if (settled) {
        s.x = s.tx;
        s.y = s.ty;
        s.vx = s.vy = 0;
        s.scale = s.tScale;
        apply();
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame((t) => step(t, last));
    },
    [apply],
  );

  const kick = useCallback(() => {
    const s = sim.current;
    if (reduceMotion.current) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = s.vy = 0;
      s.scale = s.tScale;
      apply();
      return;
    }
    if (!s.raf) {
      const last = { t: performance.now() };
      s.raf = requestAnimationFrame((t) => step(t, last));
    }
  }, [apply, step]);

  const aimAt = useCallback(
    (date: string, jump = false) => {
      const c = centreOf(date);
      if (!c) return;
      const s = sim.current;
      s.tx = c.x;
      s.ty = c.y;
      if (jump || !s.ready) {
        s.x = c.x;
        s.y = c.y;
        s.vx = s.vy = 0;
        s.ready = true;
        apply();
      } else {
        kick();
      }
      onColumnChange?.(c.x / c.hw);
    },
    [apply, centreOf, kick, onColumnChange],
  );

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => cancelAnimationFrame(sim.current.raf);
  }, []);

  // A new month lands the lens without travelling from last month's position.
  const monthKey = days[0]?.date.slice(0, 7);
  useLayoutEffect(() => {
    aimAt(selected, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  useLayoutEffect(() => {
    aimAt(selected);
  }, [selected, aimAt]);

  // Keep the lens on its day through resizes (rotation, sidebar, fonts loading).
  // One observer for the grid's lifetime: a new one per selection would fire
  // its initial callback and snap the lens, killing the glide.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const host = glassRef.current?.element;
    if (!host) return;
    let width = host.clientWidth;
    const ro = new ResizeObserver(() => {
      if (host.clientWidth === width) return;
      width = host.clientWidth;
      aimAt(selectedRef.current, true);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [aimAt]);

  // ---- Finger: tap selects, a horizontal drag scrubs the lens along the week ----

  const rowCells = (row: number) => days.filter((_, i) => Math.floor((i + padding) / 7) === row);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-date]");
    if (!cell || e.button !== 0) return;
    const date = cell.dataset.date!;
    const idx = days.findIndex((d) => d.date === date);
    const onSelected = date === selected;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, row: Math.floor((idx + padding) / 7), scrubbing: false, onSelected };
    if (onSelected) {
      sim.current.tScale = 1.14;
      kick();
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.scrubbing) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      d.scrubbing = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // The pointer already ended; the scrub just finishes on pointerup.
      }
      sim.current.tScale = 1.14;
    }
    const host = glassRef.current?.element;
    const cells = rowCells(d.row);
    const first = cells[0] && centreOf(cells[0].date);
    const lastC = cells[cells.length - 1] && centreOf(cells[cells.length - 1].date);
    if (!host || !first || !lastC) return;
    const hr = host.getBoundingClientRect();
    const s = sim.current;
    s.tx = Math.max(first.x, Math.min(lastC.x, e.clientX - hr.left));
    s.ty = first.y;
    kick();
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    sim.current.tScale = 1;
    if (d.scrubbing && !cancelled) {
      // Snap to the nearest day in that week.
      const s = sim.current;
      let best: MonthDay | null = null;
      let bestDist = Infinity;
      for (const cell of rowCells(d.row)) {
        const c = centreOf(cell.date);
        if (c && Math.abs(c.x - s.tx) < bestDist) {
          bestDist = Math.abs(c.x - s.tx);
          best = cell;
        }
      }
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      if (best && best.date !== selected) onSelect(best.date);
      else aimAt(selected);
      return;
    }
    if (cancelled) aimAt(selected);
    else kick();
  }

  function handleClick(date: string) {
    if (suppressClick.current) return;
    if (date === selected) onActivate(date);
    else onSelect(date);
  }

  // ---- Keyboard: arrows move by day / week, Enter opens ----

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = days.findIndex((d) => d.date === selected);
    if (idx < 0) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta == null) return;
    const next = days[idx + delta];
    if (!next) return;
    e.preventDefault();
    onSelect(next.date);
    cellRefs.current.get(next.date)?.focus();
  }

  return (
    <LiquidGlass
      ref={glassRef}
      width={LENS}
      height={LENS}
      radius="auto"
      strength={0.05}
      chromaticAberration={0}
      depth={12}
      curvature={0.85}
      glow={0.22}
      edgeHighlight={0.5}
      specularAngle={60}
      quality={256}
      shadow="inset 0 0 0 1px rgb(255 255 255 / 0.22), inset 0 1.5px 0 rgb(255 255 255 / 0.35), inset 0 -8px 14px -10px rgb(255 255 255 / 0.18), 0 10px 22px -8px rgb(0 0 0 / 0.75)"
    >
      <div
        role="grid"
        aria-label="Days of the month"
        className="flex select-none flex-col"
        style={{ gap: ROW_GAP, touchAction: "pan-y", WebkitTapHighlightColor: "transparent" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: rows }).map((_, r) => {
          const cells = Array.from({ length: 7 }, (_, c) => days[r * 7 + c - padding] ?? null);
          return (
            <div key={r} role="row" className="relative grid grid-cols-7" style={{ height: ROW_H }}>
              <PhaseBands cells={cells} />
              {cells.map((d, c) =>
                d ? (
                  <DayCell
                    key={d.date}
                    day={d}
                    selected={d.date === selected}
                    refCb={(el) => {
                      if (el) cellRefs.current.set(d.date, el);
                      else cellRefs.current.delete(d.date);
                    }}
                    onClick={() => handleClick(d.date)}
                  />
                ) : (
                  <div key={`pad-${c}`} role="gridcell" aria-hidden />
                ),
              )}
            </div>
          );
        })}
      </div>
    </LiquidGlass>
  );
}

function DayCell({ day, selected, refCb, onClick }: { day: MonthDay; selected: boolean; refCb: (el: HTMLButtonElement | null) => void; onClick: () => void }) {
  let disc = "";
  if (day.trained) disc = "bg-white text-black font-medium";
  else if (day.planned) disc = "text-foreground shadow-[inset_0_0_0_1px_hsl(var(--muted-foreground)/0.42)]";
  else if (day.isPast) disc = "text-muted-foreground";
  else disc = "text-foreground/85";

  return (
    <div role="gridcell" aria-selected={selected} className="relative flex justify-center">
      <button
        ref={refCb}
        type="button"
        data-date={day.date}
        data-testid={`day-cell-button-${day.date}`}
        aria-label={day.ariaLabel}
        aria-current={day.isToday ? "date" : undefined}
        tabIndex={selected ? 0 : -1}
        onClick={onClick}
        className="relative z-[1] flex h-full w-full justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
        style={{ paddingTop: DISC_TOP }}
      >
        <span
          className={`grid place-items-center rounded-full text-[15px] tabular-nums transition-colors duration-200 ${disc} ${
            (selected || day.isToday) && !day.trained ? "font-semibold text-foreground" : ""
          }`}
          style={{ width: DISC, height: DISC }}
        >
          {day.day}
        </span>
        {/* Today: just a dot under the number - quiet, but always findable. */}
        {day.isToday && (
          <span
            aria-hidden
            className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white"
            style={{ top: DISC_TOP + DISC + 3 }}
          />
        )}
      </button>
    </div>
  );
}

/**
 * One rounded grey band per run of same-phase days in this week row. Ends are
 * fully round where the phase itself starts or ends, and only softly rounded
 * where the run just wraps onto the next row.
 */
function PhaseBands({ cells }: { cells: (MonthDay | null)[] }) {
  const runs: { from: number; to: number; phase: string; start: boolean; end: boolean; name: boolean }[] = [];
  for (let c = 0; c < 7; c++) {
    const d = cells[c];
    if (!d?.phase) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === c - 1 && last.phase === d.phase && !d.phaseStart) {
      last.to = c;
      last.end = d.phaseEnd;
      last.name ||= d.phaseNamed;
    } else {
      runs.push({ from: c, to: c, phase: d.phase, start: d.phaseStart, end: d.phaseEnd, name: d.phaseNamed });
    }
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {runs.map((run) => {
        const left = `calc(${(run.from / 7) * 100}% + 2px)`;
        const width = `calc(${((run.to - run.from + 1) / 7) * 100}% - 4px)`;
        const l = run.start ? 22 : 8;
        const r = run.end ? 22 : 8;
        return (
          <div
            key={run.from}
            className="absolute bg-white/[0.075]"
            style={{ left, width, top: 1, bottom: 1, borderRadius: `${l}px ${r}px ${r}px ${l}px` }}
          >
          </div>
        );
      })}
      {/* The name may run past a short band to the end of the week, so a two-day
          run still reads "Calibration", not "Calibrati…". */}
      {runs
        .filter((run) => run.name)
        .map((run) => (
          <span
            key={`name-${run.from}`}
            className="absolute bottom-[4px] flex min-w-0 items-center gap-1 text-[8.5px] font-semibold uppercase leading-none tracking-[0.1em] text-foreground/90"
            style={{ left: `calc(${(run.from / 7) * 100}% + 10px)`, maxWidth: `calc(${((7 - run.from) / 7) * 100}% - 14px)` }}
          >
            <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: phaseSolid(run.phase) }} />
            <span className="truncate">{phaseLabel(run.phase)}</span>
          </span>
        ))}
    </div>
  );
}
