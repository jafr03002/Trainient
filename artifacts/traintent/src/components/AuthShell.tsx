import type { ReactNode } from "react";
import { Link } from "wouter";
import { CoachRobot } from "@/components/CoachRobot";

// Blueprint grid texture for the brand panel, fading out radially. Built from
// the border token so it re-skins with the theme.
const gridTexture = {
  backgroundImage:
    "linear-gradient(hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.35) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  maskImage: "radial-gradient(80% 80% at 70% 30%, black, transparent 75%)",
  WebkitMaskImage: "radial-gradient(80% 80% at 70% 30%, black, transparent 75%)",
} as const;

function StatPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

// Split auth layout: Clerk form on the left, Voltage brand panel on the right
// (slogan, Coach, stat pills). On mobile the panel collapses to a compact
// slogan card above the form.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background lg:grid lg:grid-cols-[46fr_54fr]">
      {/* Form column */}
      <div className="flex min-h-[100dvh] flex-col px-6 py-6 lg:px-10 lg:py-8">
        <Link href="/" className="flex items-center gap-2.5 font-display text-base font-bold">
          <span className="glow-primary flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-base font-bold text-primary-foreground">
            T
          </span>
          Trainient
        </Link>

        {/* Mobile slogan card */}
        <div className="relative mt-5 min-h-24 overflow-hidden rounded-xl border border-primary/25 bg-card bg-[radial-gradient(120%_140%_at_100%_100%,hsl(var(--primary)/0.2),transparent_60%)] p-4 pr-20 lg:hidden">
          <div className="font-display text-lg font-bold leading-snug tracking-tight">
            Trainient. Train with <span className="text-primary">intent</span>.
          </div>
          <p className="mt-1 max-w-56 text-xs text-muted-foreground">
            AI-generated programs that adapt to you.
          </p>
          <span className="absolute bottom-2 right-3">
            <CoachRobot size={46} />
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">{children}</div>
      </div>

      {/* Brand panel (desktop only) */}
      <div className="relative hidden overflow-hidden border-l border-border bg-sidebar bg-[radial-gradient(110%_90%_at_85%_100%,hsl(var(--primary)/0.22),transparent_60%)] lg:flex lg:flex-col lg:p-11">
        <div aria-hidden className="absolute inset-0 opacity-50" style={gridTexture} />
        <div className="relative mt-auto">
          <div className="flex flex-wrap items-end gap-5">
            <span className="pb-1 drop-shadow-[0_14px_24px_hsl(var(--primary)/0.35)]">
              <CoachRobot size={86} />
            </span>
            <div className="font-display text-4xl font-bold leading-[1.14] tracking-tight xl:text-5xl">
              Trainient.
              <br />
              Train with <span className="text-primary">intent</span>.
            </div>
          </div>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">AI-generated programs</span> built
            around your goals, honest session logging, and progression you can actually see — with
            Coach adjusting the plan every week.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <StatPill>
              <b className="font-display text-sm font-semibold text-foreground">12</b> week streak{" "}
              <span className="font-semibold text-chart-2">▲</span>
            </StatPill>
            <StatPill>
              <b className="font-display text-sm font-semibold text-foreground">+7.5 kg</b> squat{" "}
              <span className="text-chart-3">🏆 PR</span>
            </StatPill>
            <StatPill>
              <b className="font-display text-sm font-semibold text-foreground">94%</b> sessions
              completed
            </StatPill>
          </div>
        </div>
      </div>
    </div>
  );
}
