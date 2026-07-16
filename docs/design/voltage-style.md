# Voltage — Trainient visual style

The app-wide dark theme. **Electric blue on navy-black**, geometric display type,
soft rounded surfaces, and a subtle glow on primary actions. This file is the
source of truth: build and review every page against it, not against a mockup.

The foundation ships in two files — everything else consumes it:

- `src/index.css` — design tokens (`.dark` block), fonts, `--radius`, `--shadow-glow`, heading font, `.glow-primary`
- `src/components/ui/button.tsx` — primary button glow

Because pages use the semantic Tailwind tokens (`bg-card`, `text-primary`,
`border-border`, `text-muted-foreground`, …), the token change re-skins them
automatically. Page work is **cleanup of anything that bypasses the tokens.**

---

## Tokens (already live in `.dark`)

| Token | HSL | Use |
|---|---|---|
| `--background` | `224 47% 4%` | page background (navy-black) |
| `--card` / `--popover` | `224 42% 7%` | cards, sheets, popovers |
| `--sidebar` | `224 44% 6%` | left nav / mobile tab bar |
| `--border` | `217 40% 17%` | all hairline borders |
| `--foreground` | `210 40% 98%` | primary text |
| `--muted` / `--secondary` / `--accent` | `222 32% 14–16%` | input fills, chips, subtle surfaces |
| `--muted-foreground` | `214 22% 64%` | secondary text, labels |
| `--primary` | `212 96% 62%` | **electric blue** — CTAs, active nav, links, focus ring |
| `--ring` | `212 96% 62%` | focus rings |
| `--chart-2` | `158 82% 48%` | success / green (goal progress, checks) |
| `--chart-3` | `43 96% 60%` | amber / achievements (PRs, trophies) |
| `--chart-4` | `250 90% 70%` | violet (phase accents) |

**Never hardcode these as hex or `blue-500`/`amber-400`/`green-500` Tailwind
palette classes.** Use the token: `text-primary`, `text-chart-2`,
`bg-primary/10`, `border-primary/25`, etc.

## Type

- **Body:** Inter (`font-sans`) — unchanged.
- **Display / headings:** Space Grotesk. Applied automatically to `h1–h4`.
  For non-semantic headings (stat numbers, big figures rendered as `<div>`),
  add `font-display` explicitly. Opt a heading out with `font-sans`.

## Shape & finish

- `--radius` is `.75rem` (12px). Keep using `rounded-lg` / `rounded-xl` — do
  not hardcode pixel radii.
- **Glow** is the signature. Primary CTAs get it for free via `<Button>`. For
  raw `bg-primary` buttons and the dashboard hero, add `glow-primary`.
- Hero / featured cards: a faint primary radial wash is on-brand, e.g.
  `bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.18),transparent_55%)]`
  over `bg-card`, with `border-primary/25`.

## Do / don't

- ✅ `text-primary`, `bg-card`, `border-border`, `text-muted-foreground`, `text-chart-2`
- ✅ `glow-primary` on the main CTA of a screen (one, not every button)
- ✅ `font-display` on large numerals and page/section headings
- ❌ hex colors, `blue-*`/`amber-*`/`green-*`/`slate-*` palette classes, hardcoded `#rrggbb`
- ❌ pixel radii like `rounded-[8px]`
- ❌ glow on every button — it stops meaning "primary action"

---

## Per-page cleanup checklist (Phase 1 — one agent per route)

Routes: `dashboard`, `program`, `log`, `progress`, `calendar`, `settings`, `onboarding`.

For each page:

1. **Hunt hardcoded colors.** grep the page + its components for:
   `text-amber`, `text-blue`, `text-green`, `text-slate`, `bg-blue`, `#` hex,
   `rgb(`, `rgba(`. Replace with the matching token (amber→`chart-3`,
   green→`chart-2`, blue→`primary`).
2. **Headline font.** Give the page title and any large stat numbers
   `font-display` (semantic `h1–h4` already inherit it).
3. **Primary CTA.** Exactly one glowing primary action per screen
   (`glow-primary` or `<Button>`); demote the rest to `secondary`/`ghost`.
4. **Radius.** Replace any `rounded-[Npx]` with `rounded-lg`/`rounded-xl`.
5. **Verify.** Run the app and screenshot the page in dark mode (the only mode);
   confirm no muddy/low-contrast text on the new navy background.

## Cross-cutting (Phase 2 — single agent, do last)

- `src/lib/phaseColors.ts` — reconcile `phaseSolid`/`phaseSoft` with the token
  palette so phase pills read as violet/blue/green, not off-brand hues.
- Chart palettes (`components/ui/chart.tsx` + any Recharts usage) — ensure they
  pull `--chart-1…5`.
- Overlays: `CoachmarkTour`, `CalibrationWalkthrough` — check contrast on navy.

## Agent working rules

- **Branch from `main` only after the foundation PR lands** — otherwise you'll
  re-derive colors and drift.
- One route per agent, each in its **own git worktree** to avoid collisions.
- Cite this file; don't eyeball the mockup.
- Gate each PR through `no-mistakes` with the agent overridden to `claude.exe`
  and `--skip=test,lint` (repo has no test/lint command); validate visually.
