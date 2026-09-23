import type { checkinsTable, programsTable } from "@workspace/db";
import { PHASE_TEMPLATES, type LongTermPhase } from "./phaseTemplate";
import { trainingWeekNumber } from "./trainingWeek";

// `weekNumber` in the API response is always the live calendar week since
// onboarding - not the stored column, which is just an insert-order ordinal
// (used internally for "find the latest program" / check-in versioning).
// `phaseSegmentIndex`/`weeksInPhaseSegment` themselves are server-internal
// phase-template bookkeeping (see lib/phaseTemplate.ts) and never leave this
// server as-is, but the "week N of M within this phase" framing they encode
// is legitimate product info - `weekInPhase`/`phaseTotalWeeks` below expose
// that derived value without leaking the raw segment index.
//
// Shared by routes/programs.ts, routes/checkins.ts and the AI job results, so
// every path that hands a program to a client shapes it identically.
export function serializeProgram(p: typeof programsTable.$inferSelect, onboardingCompletedAt: Date | null | undefined) {
  const { phaseSegmentIndex, weeksInPhaseSegment, ...rest } = p;
  const template = p.longTermPhase ? PHASE_TEMPLATES[p.longTermPhase as LongTermPhase] : null;
  const segment = template && phaseSegmentIndex != null ? template[phaseSegmentIndex] : null;
  return {
    ...rest,
    weekNumber: trainingWeekNumber(onboardingCompletedAt),
    weekInPhase: weeksInPhaseSegment,
    phaseTotalWeeks: segment?.maxWeeks ?? null,
    days: rest.days as object[],
    generatedAt: p.generatedAt.toISOString(),
  };
}

export type SerializedProgram = ReturnType<typeof serializeProgram>;

export function serializeCheckin(c: typeof checkinsTable.$inferSelect) {
  return {
    ...c,
    submittedAt: c.submittedAt.toISOString(),
  };
}
