// Sessions design tokens (TrainientAppDesign.md) - the single source of truth
// for the palette, fonts and radius. Everything that needs a token value reads
// it from here:
//
//  - src/index.css: the `appTokens` plugin in vite.config.ts writes these in as
//    CSS custom properties at the `@app-tokens` marker, at build and dev-server
//    time. Nothing ships a hand-written copy.
//  - src/App.tsx: Clerk's `appearance` can't read custom properties, so it
//    takes literal colours from `hsl()` below instead of duplicating them.
//  - vite.config.ts: the web app manifest and the theme-color meta.
//
// Deliberately plain data with no imports, so the native (Expo) app can consume
// the same file instead of growing a third copy.
//
// Colours are HSL channel triples ("H S% L%") - the shape Tailwind's
// `hsl(var(--token))` expects. Changing one here re-skins the whole app.
//
// Sessions replaced the navy/electric-blue Voltage palette (docs/design/voltage-style.md)
// app-wide. It is almost monochrome: pure black, three neutral greys stepping
// up (background -> card -> secondary), white-on-black for primary and selected,
// and one cool teal accent (`sessions-cyan`).

export const appColors = {
  background: "0 0% 0%",
  foreground: "240 11% 96%",
  border: "240 4% 16%",

  card: "240 4% 9%",
  "card-foreground": "240 11% 96%",
  "card-border": "240 4% 16%",

  // The shell (desktop sidebar, mobile tab bar) sits on the same black as the page.
  sidebar: "0 0% 0%",
  "sidebar-foreground": "240 11% 96%",
  "sidebar-border": "240 4% 16%",
  "sidebar-primary": "0 0% 100%",
  "sidebar-primary-foreground": "0 0% 0%",
  "sidebar-accent": "240 4% 13%",
  "sidebar-accent-foreground": "240 11% 96%",
  "sidebar-ring": "0 0% 100%",

  popover: "240 4% 9%",
  "popover-foreground": "240 11% 96%",
  "popover-border": "240 4% 16%",

  // The primary action is white with black text, not a colour.
  primary: "0 0% 100%",
  "primary-foreground": "0 0% 0%",

  secondary: "240 4% 13%",
  "secondary-foreground": "240 11% 96%",

  muted: "240 4% 13%",
  "muted-foreground": "240 2% 57%",

  accent: "240 4% 17%",
  "accent-foreground": "240 11% 96%",

  destructive: "0 72% 51%",
  "destructive-foreground": "0 0% 98%",

  input: "240 4% 18%",
  ring: "0 0% 100%",

  // Category and muscle colours - small signals only, never large fills.
  "chart-1": "212 96% 62%",
  "chart-2": "158 82% 48%",
  "chart-3": "43 96% 60%",
  "chart-4": "250 90% 70%",
  "chart-5": "330 85% 62%",

  // The one accent: the teal of the hero glass, the AI badge and increases.
  "sessions-cyan": "187 83% 66%",
} as const;

export type AppColor = keyof typeof appColors;

export const appFonts = {
  sans: "'Inter', sans-serif",
  // Inter only - the contrast comes from weight and size, not a second face.
  display: "'Inter', sans-serif",
  serif: "Georgia, serif",
  mono: "Menlo, monospace",
} as const;

export const appRadius = "0.75rem";

/** A token as a literal `hsl(0, 0%, 100%)`, for consumers that can't read CSS custom properties. */
export function hsl(token: AppColor): string {
  return `hsl(${appColors[token].split(" ").join(", ")})`;
}

/** A token as `#rrggbb`, for places that only reliably accept hex (web app manifest, theme-color). */
export function hex(token: AppColor): string {
  const [h, s, l] = appColors[token].split(" ").map((part) => parseFloat(part));
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
 * The tokens as CSS: fonts and radius on `:root`, colours on `.dark` (the only
 * theme - index.html hardcodes `<html class="dark">`).
 */
export function appTokensCss(): string {
  const root = [
    `  --app-font-sans: ${appFonts.sans};`,
    `  --app-font-display: ${appFonts.display};`,
    `  --app-font-serif: ${appFonts.serif};`,
    `  --app-font-mono: ${appFonts.mono};`,
    `  --radius: ${appRadius};`,
  ];
  const dark = Object.entries(appColors).map(([name, value]) => `  --${name}: ${value};`);
  return `:root {\n${root.join("\n")}\n}\n\n.dark {\n${dark.join("\n")}\n}\n`;
}
