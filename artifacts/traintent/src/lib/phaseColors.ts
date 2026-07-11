// One fixed hue per short-term phase (ProgramShortTermPhase, see
// api-server/src/lib/phaseTemplate.ts's ShortTermPhase). Single source so the
// calendar, dashboard, and program page all render the same phase in the
// same color instead of drifting out of sync with each other.
export const PHASE_HUES: Record<string, { h: number; s: number; l: number }> = {
  calibration: { h: 199, s: 89, l: 48 },
  calibration_review: { h: 210, s: 70, l: 60 },
  bulk: { h: 142, s: 71, l: 45 },
  maintenance: { h: 38, s: 92, l: 50 },
  reverse_diet: { h: 160, s: 84, l: 39 },
  diet: { h: 350, s: 75, l: 55 },
  mini_cut: { h: 24, s: 90, l: 55 },
  deload: { h: 217, s: 91, l: 60 },
};

export function phaseSolid(phase: string): string {
  const c = PHASE_HUES[phase];
  return c ? `hsl(${c.h}, ${c.s}%, ${c.l}%)` : "#6b7280";
}

export function phaseSoft(phase: string): string {
  const c = PHASE_HUES[phase];
  return c ? `hsla(${c.h}, ${c.s}%, ${c.l}%, 0.16)` : "rgba(107, 114, 128, 0.16)";
}

export function phaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}
