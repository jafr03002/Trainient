# Trainient App Design — "Sessions"

Trainient's visual language, app-wide. **Pure black canvas,
soft rounded grey cards, thin light Inter headings, pill-shaped controls, and
white-on-black for whatever is selected or primary.** It reads as a calm,
premium iOS app: almost monochrome, with one cool teal accent.

Agents building or restyling a screen should follow this file. When the doc and
the code disagree, the reference screen's code wins:

- **Reference screen:** the program page — `artifacts/traintent/src/pages/program/shared.tsx`
  (`ProgramWeekView`, `RosterRow`, `ProgramPageShell`, `ProgramBadge`, `InactiveLineageNotice`)
- **Tokens:** `artifacts/traintent/src/theme/tokens.ts` (the one source - written into `index.css` at build time, and read by Clerk's appearance and the web app manifest)
- **Helpers:** `artifacts/traintent/src/index.css` (`.sessions-glass`, `.sessions-watermark`, `.sessions-wash`, `.sessions-range`)
- **Form kit** for stepped flows (onboarding, the weekly check-in): `artifacts/traintent/src/lib/sessionsForm.ts`
- **Screenshots:** [mobile](docs/design/references/program-page-mobile.png) · [desktop](docs/design/references/program-page-desktop.png)
- **Approved mockup** (the design review this came from, open in a browser): [program-page-mockup.html](docs/design/references/program-page-mockup.html)

![Program page, mobile](docs/design/references/program-page-mobile.png)

> Relationship to Voltage: `docs/design/voltage-style.md` describes the older
> navy/electric-blue theme. It is **retired**: Sessions became the app-wide default
> in `src/theme/tokens.ts`, so every screen, dialog, popover and toast gets it
> without opting in.

---

## 1. How to apply it to a screen

Sessions is the app's **token set**, not a component library. Every semantic
Tailwind token (`bg-card`, `bg-secondary`, `text-muted-foreground`,
`border-border`, `bg-primary`, …) already resolves to it, and shadcn components
come along for free. There is no wrapper class to add: restyling a screen means
using the tokens, type scale and shapes below.

```tsx
// the page frame the program and log pages share (ProgramPageShell)
<div className="min-h-screen bg-background text-foreground">
  <div className="mx-auto max-w-3xl space-y-6 p-6">{children}</div>
</div>
```

Rules:

- **Use tokens, never hex or palette classes** (`bg-zinc-900`, `text-blue-400`).
  The only literal colours allowed are `bg-white` / `text-black` for selected
  and primary states, and `text-white/xx` on top of the hero glass.
- **No glows.** No coloured `box-shadow` halos and no `.glow-primary`. Depth comes
  from the step between surface greys, not from light.
- Keep the app's existing structure and behaviour. Sessions changes how a screen
  looks, not what it does.

## 2. Tokens (`src/theme/tokens.ts`)

| Token | HSL | Hex ≈ | Use |
|---|---|---|---|
| `--background` | `0 0% 0%` | `#000000` | the canvas |
| `--card` | `240 4% 9%` | `#161618` | primary surface: cards, grouped lists, notices |
| `--secondary` / `--muted` | `240 4% 13%` | `#1f1f22` | surface *on* a card: icon circles, the Start-workout row, inputs, badges |
| `--accent` | `240 4% 17%` | `#2a2a2e` | hover state of a `secondary` surface |
| `--border` | `240 4% 16%` | `#262629` | hairline separators only |
| `--foreground` | `240 11% 96%` | `#f5f5f7` | primary text |
| `--muted-foreground` | `240 2% 57%` | `#8e8e93` | secondary text, captions, trailing values |
| `--primary` | `0 0% 100%` | white | primary action fill (paired with black text) |
| `--primary-foreground` | `0 0% 0%` | black | text on primary |
| `--sessions-cyan` | `187 83% 66%` | `#5fe0f0` | **the only accent**: hero glass, hero icon, AI badge |

Surfaces go up in three steps: **black → card → secondary**. A control sitting on
a card uses `secondary`. A card sitting on the page uses `card`. Don't put a card
on a card of the same grey.

Category and muscle colours (`--chart-*`, `categoryMeta().token`) are still
allowed as **small signals**, like the check icon and label on a checklist row,
but never as fills for large areas.

## 3. Type

**Inter only.** Headings and `font-display` both resolve to Inter (`appFonts` in
`tokens.ts`); Space Grotesk is gone. The contrast comes from weight and size, not from a second face.

| Role | Classes |
|---|---|
| Screen title | `text-[34px] font-light leading-[1.08] tracking-[-0.025em]` (export `PROGRAM_TITLE_CLASS`) |
| Section title ("Training days", "Exercises") | `text-[21px] font-light tracking-[-0.01em]`, `mb-3` |
| Hero title | `text-2xl font-normal tracking-[-0.01em]` |
| Big stat number | `text-2xl font-light tracking-[-0.02em]` |
| Caps label (stat labels, eyebrow, CTA) | `text-[11px] uppercase tracking-[0.1em]`, up to `0.14em` for short eyebrows |
| Row title | `text-[15px] font-normal` |
| Row subtitle | `text-[12.5px] text-muted-foreground` |
| Body / notice | `text-[12.5px]` – `text-sm`, `leading-relaxed` |

Light (300) is for big display text only. Body text stays at 400–500 so it
stays readable on black. Inter 300 is loaded in `artifacts/traintent/index.html`.

## 4. Shape and spacing

- **Radii are large and soft:** hero `rounded-[30px]`, grouped list `rounded-[26px]`,
  inner row or sheet `rounded-3xl`, notice `rounded-[22px]`.
- **Pills everywhere for controls:** tabs, badges and buttons are `rounded-full`.
- **Circles for icon actions:** `h-[50px] w-[50px] rounded-full bg-secondary` with a
  20px lucide icon at `strokeWidth={1.6}`. The icon-only button *must* have `aria-label`.
- Page gutter is `p-6`, sections are `space-y-6`, and a section title sits `mb-3` above its content.
- Icons are lucide with thin strokes (`strokeWidth={1.6}`), matching the light type.

## 5. Components (as built on the program page)

**Header:** title on the left, round icon button on the right (Edit). Under the
title, a muted meta line ("Upper Lower · Week 3") followed by a pill badge.

**Badge (`ProgramBadge`):** `rounded-full px-2.5 py-1 text-[10.5px] uppercase
tracking-[0.1em] font-medium`. AI gets a cyan tint (`bg-[hsl(var(--sessions-cyan)/0.1)]`
with cyan text). Everything else gets `bg-secondary text-foreground`.

**Hero card:** one `rounded-[30px] bg-card` card in three bands:
1. `.sessions-glass` top (196px). The grey-to-teal frosted gradient, with the
   faint diagonal `.sessions-watermark` slogan ("Train with intent", `aria-hidden`).
   A 60px dark glass circle holds the icon in cyan, a small meta chip sits top
   right, and an eyebrow plus title sit bottom left in white.
2. A stats band: equal `flex-1` columns split by `border-l border-border`, each a
   big light number over a caps label.
3. The **primary action as a bottom-sheet row**: `bg-secondary rounded-3xl`
   inset `mx-2 mb-2`, with a caps title plus muted subtitle on the left and a **white
   52px play circle** on the right. The whole row is the button.

**Tabs / segmented choice:** a horizontal row of `rounded-full px-[18px] py-2.5`
pills that scrolls sideways (`overflow-x-auto`, scrollbar hidden). Selected pills
are `bg-white text-black font-medium`, the rest `bg-card text-muted-foreground`.
Set `aria-pressed` on each. Never squeeze tabs into equal columns; let them scroll.

**Inset grouped list (`RosterRow`):** the default way to show a list of items.
One `rounded-[26px] bg-card overflow-hidden` card with rows like this:

```tsx
<div className="group flex items-center pl-5">
  <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[15px] pr-5 group-last:border-b-0">
    <div className="min-w-0 flex-1">{/* title + subtitle, both truncate */}</div>
    <span className="whitespace-nowrap text-[15px] text-muted-foreground">{/* trailing value */}</span>
  </div>
</div>
```

The hairline sits on the *inner* block, so it starts at the text inset like an
iOS grouped list, and the last row has none. **No leading numbers or colour bars.**
The trailing value (sets × reps, a target) is quiet muted text, not a chip.

**Notice / info card:** `rounded-[22px] bg-card px-4 py-3.5`, a muted 16px
icon, `text-[12.5px]` muted copy, and links as `text-foreground underline underline-offset-[3px]`.

**Stat-band input row (`SetRow`, log page):** for entering numbers mid-set.
Each row is `border-t border-border px-5`, with a 52px leading column (big light
number over a caps label) and then `flex-1` columns split by `border-l border-border`.
Each column holds a **boxless** input (`bg-transparent text-[26px] font-light`,
`–` placeholder, `focus:border-b` underline) over a `text-[10px]` caps label.
The number goes from muted to white once the row is filled in. A caps hint line
("Target 80 kg × 8" plus a delta pill) sits under the band. A PR row gets a faint
cyan wash from the left and a cyan trophy.

**Primary button (standalone):** `h-[52px] rounded-full bg-primary px-8 text-sm
font-semibold uppercase tracking-[0.06em] text-primary-foreground`, which is white
with black text. Secondary actions are either an outlined pill
(`border border-foreground/90 bg-transparent`) or a `bg-secondary` pill.

## 6. Interaction and UX

- Selection is always **white fill with black text**. Don't use colour to show "selected".
- Motion stays small and quick: `framer-motion` fade plus an 8–12px slide, around 200ms,
  re-keyed when the content changes (for example switching day).
- Hover is a surface step up (`hover:bg-accent`) or text going from muted to foreground.
  Nothing scales or glows.
- Every text line inside a flex row needs `min-w-0` + `truncate` on the flexible
  child and `whitespace-nowrap` on the trailing value. Check at a 390px width.
- Keep existing `data-testid`s when restyling. Tours and tests depend on them.

## 7. Checklist for restyling a screen

1. Use the page frame (`ProgramPageShell`'s gutter and width, or the same classes).
2. Swap heading classes to the type scale above, and drop `font-bold` / `font-display` on titles.
3. Turn bordered cards into borderless `bg-card` cards with large radii. Keep hairlines only between rows.
4. Replace coloured selected states and CTAs with the white-on-black pattern.
5. Remove glows, gradient borders and coloured edge bars.
6. Render at 390px and desktop: no horizontal overflow, nothing clipped, and the icon-only buttons labelled.

**Date arc + wash (dashboard):** the top of the dashboard (`WeekStrip` in
`components/dashboard/`) is the week on a shallow arc, taken from the calendar row
of [calendar_dashboard_example.jpg](docs/design/references/calendar_dashboard_example.jpg)
but recoloured to Sessions. Seven circles, Monday-first. A logged session is a solid
white disc with a black number (the app's white-on-black "done"), a planned session
is outlined, a rest day is only its dimmed number with no circle, and today is the
larger circle with a thin white ring, its number in light 21px like the dashboard's
display numerals. The ring shows no progress; it only marks the day. Weekdays are
small tracked caps. The outer days sink (`1.6px × offset²`) and fade slightly, and
today is lifted 8px off the curve so its ring clears its neighbours. Above the arc,
the white Intent sun (`src/assets/intent-sun.png`, from [intent-logo.png](docs/design/references/intent-logo.png))
and the word "Intent" sit on the left, with a "Full month" chip on the right. Behind it,
`.sessions-wash` is a grey-to-teal light that fades into black, and the greeting
sits straight on it with no card. The wash is live (`components/dashboard/DashboardWash.tsx`):
a WebGL shader draws slow light shafts, a drifting teal pool and thin caustics
over today's column. It follows a finger, ripples on tap and tilts on Android.
`.sessions-wash` stays underneath as the fallback, and reduced motion gets one
still frame. This is the one sanctioned exception to "no glows": keep it on the
dashboard top and the calendar top (which reuses `DashboardWash`, with `sunX` aiming
the light at the selected day's column) and nowhere else. Screenshots: [mobile](docs/design/references/dashboard-mobile.png) ·
[desktop](docs/design/references/dashboard-desktop.png).

**Liquid glass (calendar):** real refraction from
[liquid-glass-web-react](https://github.com/PallavAg/liquid-glass-web-react): an SVG
`feDisplacementMap` over the content itself, not `backdrop-filter`, so it works on
iOS Safari. The rule for where it goes: **glass is only for a control that floats over
something that moves.** On a static black card it's invisible at best and
decoration at worst, and it fights the "depth comes from grey steps" rule. The calendar has
exactly one piece: the selected day, a glass lens over the month grid
(`components/calendar/MonthGrid.tsx`). It glides on a slightly underdamped spring,
stretches along its velocity, squeezes when pressed, and scrubs along a week under a
horizontal drag. The month switcher above the grid stays plain, with no pill and no glass: a muted
‹ and › at the edges and the month name centred (Jakob tried a glass pill there and
rejected it).

Don't add glass to cards, grouped lists, sheets or the tab bar. If a new screen
seems to want it, ask whether something actually moves underneath it.

**Calendar month grid:** phases are continuous `bg-white/[0.075]` bands per week row.
The ends are fully round where a phase starts or ends, and only softly rounded where a run wraps
onto the next row. The phase is named in caps at its start, with the phase colour only
in a 5px dot. A trained day is a solid white disc with a black numeral, a planned day
(fixed schedule only) is a faint outline, and today is a small white dot under its number. The
selected day's sessions sit below as an inset grouped list. Tapping the selected day
again opens its session.

## 8. Status and open work

Trainient is a **mobile app**: design for the 390px phone first. The desktop
sidebar only gets the tokens, with no design work of its own.

- Designed in Sessions: `/program` (AI + My, builder, empty states), `/progress`,
  `/log`, the dashboard (with its own `DashboardShell` for the wash), onboarding,
  the weekly check-in, Settings (the "You" tab), the mobile tab bar and the tours.
- **The mobile tab bar** is a black blurred bar: the active tab is white, the
  rest muted, and Start is a raised white disc with a black play icon.
- **Settings** is iOS inset grouped lists (Profile, Training, Calendar colours,
  Subscription, Account) with boxless right-aligned inputs, and confirms that
  open inside the group as a `bg-secondary` bottom-sheet row. Destructive
  actions are red *text*, never a red surface.
- **The weekly check-in** reuses onboarding's stacked-card kit
  (`lib/sessionsForm.ts`): full screen with no tab bar, a close button top left,
  a caps "N of M" count (no progress bar), a 1-5 scale as circles that fill white.
- **Tours** use the white Intent sun on a black disc as the avatar (the robot
  mascot now only appears on the sign-in panel).
- **The calendar** (`/calendar`) is designed: the storm wash, a plain month
  switcher, the liquid-glass day lens, phase bands, white trained-day discs, a day panel, and the
  session sheet in Sessions. Independent users get their current phase painted from
  today onwards (they have no phase history).
- **Still to design, in its own session:** the sign-in / sign-up screen (as a
  native-app screen, not a web split layout). It already picks up the tokens,
  but its layout is still the old one. The landing page is out
  of scope for an app.
- `/progress` shows the metric-card pattern: a caps label, a big light number
  and a muted delta, above a minimal axis-less chart. Its volume card is
  monochrome (top three bars white, the rest grey, cyan only for increases)
  instead of the multi-colour muscle palette.
- `/log` shows the stat-band input row (see §5). Screenshots:
  [mobile](docs/design/references/log-page-mobile.png) · [desktop](docs/design/references/log-page-desktop.png)
- The program page's **week strip** (`ScheduleStrip`) is parked. It's still in the
  code but nothing renders it, until a reworked week view is designed.
- Per-day colours (Settings → calendar colours) still paint the calendar and the
  program builder, but not the program page's view mode.
