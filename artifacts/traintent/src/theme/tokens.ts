// Voltage design tokens (docs/design/voltage-style.md) - the single source of
// truth for the palette, fonts and radius. Everything that needs a Voltage
// value reads it from here:
//
//  - src/index.css: the `voltageTokens` plugin in vite.config.ts writes these
//    in as CSS custom properties at the `@voltage-tokens` marker, at build and
//    dev-server time. Nothing ships a hand-written copy.
//  - src/App.tsx: Clerk's `appearance` can't read custom properties, so it
//    takes literal colours from `hsl()` below instead of duplicating them.
//  - vite.config.ts: the web app manifest and the theme-color meta.
//
// Deliberately plain data with no imports, so the native (Expo) app can consume
// the same file instead of growing a third copy.
//
// Colours are HSL channel triples ("H S% L%") - the shape Tailwind's
// `hsl(var(--token))` expects. Changing one here re-skins the whole app.

export const voltageColors = {
  background: "224 47% 4%",
  foreground: "210 40% 98%",
  border: "217 40% 17%",

  card: "224 42% 7%",
  "card-foreground": "210 40% 98%",
  "card-border": "217 40% 17%",

  sidebar: "224 44% 6%",
  "sidebar-foreground": "210 40% 98%",
  "sidebar-border": "217 40% 15%",
  "sidebar-primary": "212 96% 62%",
  "sidebar-primary-foreground": "0 0% 100%",
  "sidebar-accent": "222 32% 15%",
  "sidebar-accent-foreground": "210 40% 98%",
  "sidebar-ring": "212 96% 62%",

  popover: "224 42% 7%",
  "popover-foreground": "210 40% 98%",
  "popover-border": "217 40% 17%",

  primary: "212 96% 62%",
  "primary-foreground": "0 0% 100%",

  secondary: "222 32% 14%",
  "secondary-foreground": "210 40% 98%",

  muted: "222 32% 14%",
  "muted-foreground": "214 22% 64%",

  accent: "222 32% 16%",
  "accent-foreground": "210 40% 98%",

  destructive: "0 72% 51%",
  "destructive-foreground": "0 0% 98%",

  input: "222 32% 18%",
  ring: "212 96% 62%",

  "chart-1": "212 96% 62%",
  "chart-2": "158 82% 48%",
  "chart-3": "43 96% 60%",
  "chart-4": "250 90% 70%",
  "chart-5": "330 85% 62%",
} as const;

export type VoltageColor = keyof typeof voltageColors;

export const voltageFonts = {
  sans: "'Inter', sans-serif",
  display: "'Space Grotesk', 'Inter', sans-serif",
  serif: "Georgia, serif",
  mono: "Menlo, monospace",
} as const;

export const voltageRadius = "0.75rem";

/** A token as a literal `hsl(212, 96%, 62%)`, for consumers that can't read CSS custom properties. */
export function hsl(token: VoltageColor): string {
  return `hsl(${voltageColors[token].split(" ").join(", ")})`;
}

/** A token as `#rrggbb`, for places that only reliably accept hex (web app manifest, theme-color). */
export function hex(token: VoltageColor): string {
  const [h, s, l] = voltageColors[token].split(" ").map((part) => parseFloat(part));
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * The tokens as CSS, in the exact form index.css used to hand-write: fonts and
 * radius on `:root`, colours on `.dark` (the only theme - index.html hardcodes
 * `<html class="dark">`).
 */
export function voltageCss(): string {
  const root = [
    `  --app-font-sans: ${voltageFonts.sans};`,
    `  --app-font-display: ${voltageFonts.display};`,
    `  --app-font-serif: ${voltageFonts.serif};`,
    `  --app-font-mono: ${voltageFonts.mono};`,
    `  --radius: ${voltageRadius};`,
  ];
  const dark = Object.entries(voltageColors).map(([name, value]) => `  --${name}: ${value};`);
  return `:root {\n${root.join("\n")}\n}\n\n.dark {\n${dark.join("\n")}\n}\n`;
}
