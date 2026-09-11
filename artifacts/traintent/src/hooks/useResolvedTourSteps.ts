import { useEffect, useRef, useState } from "react";
import type { CoachmarkStep } from "@/components/onboarding/CoachmarkTour";

/**
 * Returns a resolver that drops tour steps whose target can't be found, and
 * freezes the survivors for the life of the tour.
 *
 * A step pointing at a nav link resolves through layout.tsx's `getEl`, which
 * returns null when that link isn't in the bar - the tab bar carries fewer tabs
 * than it used to, so Calendar can simply not be there. An anchored step with
 * no element renders nothing at all: no bubble, no ring and no Next to press,
 * which strands the whole tour on a step the user can't see.
 *
 * Resolving is deferred by one commit because refs attach after render, and the
 * result is latched per tour: a step appearing or disappearing halfway through
 * would renumber "Step 2 of 4" under the user mid-tour.
 *
 * The resolver is handed back as a function rather than taking the steps
 * directly so it can be called once, above a page's early returns, and applied
 * further down where the steps are actually built.
 */
export function useTourSteps(): (key: string, steps: CoachmarkStep[], enabled: boolean) => CoachmarkStep[] {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const frozen = useRef<Record<string, CoachmarkStep[]>>({});

  return (key, steps, enabled) => {
    if (!enabled || !mounted) return [];
    return (frozen.current[key] ??= steps.filter((step) => step.kind === "center" || !!step.target.current));
  };
}
