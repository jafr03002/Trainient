// The Sessions form kit: the type, buttons, choice cards and pill inputs the
// stepped flows (onboarding, the weekly check-in) are built from - one
// question per screen, a thin light title, grey cards that flip white when
// picked, an outlined Back pill and a white Continue pill. See
// TrainientAppDesign.md.
import { cn } from "@/lib/utils";

export const TITLE_CLASS = "text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground";
export const LEDE_CLASS = "mt-2.5 mb-8 text-[13.5px] leading-relaxed text-muted-foreground";
export const CAPS_CLASS = "text-[11px] uppercase tracking-[0.14em] text-muted-foreground";
export const LABEL_CLASS = "mb-2 ml-1 block text-[13px] text-foreground";
export const ERROR_TEXT_CLASS = "mt-2 ml-1 text-[13px] font-medium text-destructive";
export const PRIMARY_BUTTON_CLASS =
  "inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold uppercase tracking-[0.06em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground";
export const OUTLINE_BUTTON_CLASS =
  "inline-flex h-[52px] items-center justify-center gap-1.5 rounded-full border border-foreground/90 bg-transparent px-6 text-sm font-medium uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

// A full-width choice card: grey at rest, white with black text once picked.
export function optionCardClass(selected: boolean) {
  return cn(
    "w-full rounded-3xl px-5 py-[18px] text-left transition-colors",
    selected ? "bg-white text-black" : "bg-card text-foreground hover:bg-secondary",
  );
}

export function optionSubClass(selected: boolean) {
  return cn("mt-0.5 text-[13px] leading-snug", selected ? "text-black/60" : "text-muted-foreground");
}

// A multi-select pill. `invalid` marks a picked pill that breaks a rule (too many rest days).
export function chipClass(selected: boolean, invalid = false) {
  return cn(
    "rounded-full px-[17px] py-2.5 text-sm whitespace-nowrap transition-colors",
    invalid
      ? "bg-destructive/15 text-destructive font-medium"
      : selected
        ? "bg-white text-black font-medium"
        : "bg-card text-muted-foreground hover:text-foreground",
  );
}

export function inputClass(invalid: boolean, extra?: string) {
  return cn(
    "h-[52px] w-full min-w-0 rounded-full bg-card px-5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1",
    invalid ? "ring-1 ring-destructive focus:ring-destructive" : "focus:ring-foreground/40",
    extra,
  );
}

// A pill field holding an input plus a trailing unit ("kcal / day").
export function suffixFieldClass(invalid: boolean) {
  return cn(
    "flex h-[52px] items-center gap-2 rounded-full bg-card px-5",
    invalid ? "ring-1 ring-destructive" : "focus-within:ring-1 focus-within:ring-foreground/40",
  );
}
