// Hard-coded short-term phase progression per long-term goal (see
// lib/knowledge/ti-program-generation.md, "## Goal evaluation with timeline
// setups template"). The AI never chooses which phase comes next - it only
// recommends whether to stay in the current phase segment or advance, and
// the server clamps that recommendation to the segment's min/max week
// bounds. This guarantees the phase sequence itself can never be invented,
// skipped, or reordered by the model.

import type { longTermPhaseFor } from "./programMonitoring";

export type ShortTermPhase = "calibration" | "bulk" | "maintenance" | "reverse_diet" | "diet" | "mini_cut" | "deload";
export type EnergyBalance = "surplus" | "maintenance" | "deficit" | "high_deficit";
export type LongTermPhase = ReturnType<typeof longTermPhaseFor>;

export type PhaseSegment = {
  phase: ShortTermPhase;
  minWeeks: number;
  maxWeeks: number | null; // null = unbounded ("maintenance forever")
  deload?: { everyWeeks: number }; // periodic 1-week overlay, bulk only
};

export const PHASE_TEMPLATES: Record<LongTermPhase, PhaseSegment[]> = {
  gain_weight: [
    { phase: "calibration", minWeeks: 1, maxWeeks: 3 },
    { phase: "bulk", minWeeks: 18, maxWeeks: 26, deload: { everyWeeks: 8 } },
  ],
  lose_weight: [
    { phase: "calibration", minWeeks: 1, maxWeeks: 3 },
    { phase: "mini_cut", minWeeks: 4, maxWeeks: 6 },
    { phase: "deload", minWeeks: 1, maxWeeks: 1 },
    { phase: "diet", minWeeks: 4, maxWeeks: 14 },
    // Nothing defined after diet on purpose - reverse_diet is a known gap
    // here, deferred to a future "reassess goals" feature.
  ],
  maintain: [
    { phase: "calibration", minWeeks: 1, maxWeeks: 3 },
    { phase: "maintenance", minWeeks: 1, maxWeeks: null },
  ],
};

export function energyBalanceForPhase(phase: ShortTermPhase): EnergyBalance {
  switch (phase) {
    case "bulk":
    case "reverse_diet":
      return "surplus";
    case "diet":
      return "deficit";
    case "mini_cut":
      return "high_deficit";
    default:
      return "maintenance"; // calibration, maintenance, deload
  }
}

export const INITIAL_PHASE_STATE = { segmentIndex: 0, weeksInSegment: 1 };

// One check-in's worth of progression. Called with the prior stored state
// and the AI's stay/advance recommendation; returns the new state. Advancing
// early (before minWeeks) is never allowed; staying past maxWeeks is never
// allowed. Once the template's last segment is reached, nothing advances
// further - the counter just holds (a future "reassess goals" feature is
// what's meant to break out of this, not this code).
export function resolvePhaseProgression(
  template: PhaseSegment[],
  priorSegmentIndex: number,
  priorWeeksInSegment: number,
  aiRecommendation: "stay" | "advance",
): { segmentIndex: number; weeksInSegment: number } {
  const segment = template[priorSegmentIndex]!;
  const weeksInSegment = priorWeeksInSegment + 1;
  const isTerminal = priorSegmentIndex === template.length - 1;

  if (isTerminal) {
    return {
      segmentIndex: priorSegmentIndex,
      weeksInSegment: segment.maxWeeks != null ? Math.min(weeksInSegment, segment.maxWeeks) : weeksInSegment,
    };
  }

  const canAdvance = weeksInSegment >= segment.minWeeks;
  const mustAdvance = segment.maxWeeks != null && weeksInSegment >= segment.maxWeeks;
  const shouldAdvance = mustAdvance || (canAdvance && aiRecommendation === "advance");

  return shouldAdvance
    ? { segmentIndex: priorSegmentIndex + 1, weeksInSegment: 1 }
    : { segmentIndex: priorSegmentIndex, weeksInSegment };
}

// Applies the bulk-only periodic deload overlay on top of the resolved
// segment. Pure/stateless - the underlying segment pointer and week counter
// are untouched by this; deload is a display-layer override for that one
// week only, reverting to the segment's own phase the following week.
export function effectivePhase(
  template: PhaseSegment[],
  segmentIndex: number,
  weeksInSegment: number,
): { shortTermPhase: ShortTermPhase; energyBalance: EnergyBalance } {
  const segment = template[segmentIndex]!;
  const isDeloadWeek = !!segment.deload && weeksInSegment > 0 && weeksInSegment % segment.deload.everyWeeks === 0;
  const phase = isDeloadWeek ? "deload" : segment.phase;
  return { shortTermPhase: phase, energyBalance: energyBalanceForPhase(phase) };
}
