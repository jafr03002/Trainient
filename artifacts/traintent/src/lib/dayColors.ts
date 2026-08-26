// One colour per training day, shared by every surface that paints a day: the
// program page (hero + day tabs), the program builder's day cards, and the
// calendar's session pills, dots and legend. Single source so a day that reads
// blue on /program is the same blue on /calendar and in the editor, instead of
// each page inventing its own palette (which is what they all used to do).
//
// The palette is deliberately the calendar's original DEFAULT_COLORS, in its
// original order: those are the only day colours that were ever persisted
// (per-user overrides in Settings key off them), so reusing the order keeps
// existing calendars painted exactly as they were.
export const DAY_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

export type DayTones = {
  // The colour itself - pills, dots, the day card's edge bar.
  solid: string;
  // Same hue at low alpha, for a wash behind a badge or card.
  soft: string;
  // Lightened enough to stay readable as text on top of `soft` in dark mode.
  text: string;
  // Foreground for text sitting *on* `solid`. Black or white, whichever the
  // colour's own lightness can carry - white on amber or lime is unreadable.
  on: string;
  // Same hue at mid alpha, for a glow under a solid-filled control.
  glow: string;
  // Bare `h s% l%` components, for composing in CSS: `hsl(var(--day) / 0.3)`.
  parts: string;
};

// Anything that isn't a parseable 3/6-digit hex (a hand-edited override, say)
// falls back to the first palette colour rather than rendering NaN.
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const int = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) return { r: 0.231, g: 0.51, b: 0.965 };
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

// WCAG relative luminance. HSL lightness is no use for this: amber and blue
// both sit at l=50-60 while amber is nearly three times as bright to the eye.
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Works for palette entries and for user-picked overrides alike - everything a
// surface needs is derived from the one hex, so a custom colour tints a hero or
// a badge exactly the way a built-in one does.
export function dayTones(hex: string): DayTones {
  const { h, s, l } = hexToHsl(hex);
  return {
    solid: hex,
    soft: `hsla(${h}, ${s}%, ${l}%, 0.14)`,
    text: `hsl(${h}, ${Math.min(s, 80)}%, ${Math.max(l, 70)}%)`,
    // 0.32 is where the palette actually splits: the blues, violets, red and
    // pink stay white-on-colour (blue keeps the primary button's familiar look),
    // while amber, lime, cyan, emerald and orange flip to near-black, which is
    // the difference between 2.2:1 and 8:1 on those.
    on: luminance(hex) > 0.32 ? "hsl(224 47% 6%)" : "hsl(210 40% 98%)",
    glow: `hsla(${h}, ${s}%, ${l}%, 0.35)`,
    parts: `${h} ${s}% ${l}%`,
  };
}

// Last-resort slot for a label nobody could place in an order (a session logged
// against a program that no longer exists, say). Hashing beats defaulting to
// index 0, which would paint every orphan the same blue as day 1.
function labelHash(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) % 100000;
  return hash;
}

export type DayColorOrder = Record<string, number>;

// The canonical colour slot per day label: the current program's days come
// first, in program order, so day 1 is always the first colour. `extraLabels`
// (labels seen in logged sessions that the current program no longer has) take
// the slots after them, keeping active days collision-free for as long as the
// palette holds out.
export function buildDayColorOrder(
  programLabels: (string | null | undefined)[],
  extraLabels: (string | null | undefined)[] = [],
): DayColorOrder {
  const order: DayColorOrder = {};
  let next = 0;
  for (const label of [...programLabels, ...extraLabels]) {
    if (!label || order[label] !== undefined) continue;
    order[label] = next++;
  }
  return order;
}

// The colour for a day label. A user's own pick in Settings always wins; past
// that it's the label's slot in `order`.
export function dayColorHex(
  label: string,
  order: DayColorOrder = {},
  custom: Record<string, string> = {},
): string {
  const picked = custom[label];
  if (picked) return picked;
  const index = order[label] ?? labelHash(label);
  return DAY_PALETTE[index % DAY_PALETTE.length];
}

// Colour by position, for surfaces that already know a day's index and don't
// need to go through a label (the builder, where the day may not be named yet).
export function dayColorAt(index: number): string {
  return DAY_PALETTE[index % DAY_PALETTE.length];
}
