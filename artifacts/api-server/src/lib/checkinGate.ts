// When a weekly check-in is allowed. There is none during calibration: leaving
// calibration is the calibration review's job - a separate readiness check
// (exercises found, form settled, nothing hurting), not a check-in. The first
// check-in opens a week after that review; from then on the normal weekly
// cadence applies.
//
// The review is read off the program rows rather than stored: it is the moment
// the AI lineage first left calibration, i.e. the oldest row of the run of
// non-calibration rows that directly follows the newest calibration row. So
// whatever ends calibration (the review, once it is built) only has to write
// the next phase's program row for this gate to follow.
//
// Mirrored in the web app's lib/calibration.ts (checkinGate) - keep the two in
// step.

export const FIRST_CHECKIN_AFTER_REVIEW_DAYS = 7;

export type CheckinGate =
  | { open: true }
  | { open: false; reason: "calibration" }
  | { open: false; reason: "after_review"; opensAt: Date };

export function checkinGate(
  aiPrograms: { shortTermPhase: string | null; generatedAt: Date }[],
  latestCheckinAt: Date | null,
  now: Date = new Date(),
): CheckinGate {
  const newestFirst = [...aiPrograms].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  if (newestFirst.length === 0) return { open: true };
  if (newestFirst[0]!.shortTermPhase === "calibration") return { open: false, reason: "calibration" };

  let reviewAt: Date | null = null;
  let sawCalibration = false;
  for (const p of newestFirst) {
    if (p.shortTermPhase === "calibration") {
      sawCalibration = true;
      break;
    }
    reviewAt = p.generatedAt;
  }
  // A lineage that never had a calibration row predates it - nothing to wait for.
  if (!sawCalibration || !reviewAt) return { open: true };
  if (latestCheckinAt && latestCheckinAt.getTime() >= reviewAt.getTime()) return { open: true };

  const opensAt = new Date(reviewAt.getTime() + FIRST_CHECKIN_AFTER_REVIEW_DAYS * 86_400_000);
  return now.getTime() >= opensAt.getTime() ? { open: true } : { open: false, reason: "after_review", opensAt };
}

export function checkinGateMessage(gate: Exclude<CheckinGate, { open: true }>): string {
  return gate.reason === "calibration"
    ? "Check-ins start after your calibration review"
    : `Your first check-in opens on ${gate.opensAt.toISOString().slice(0, 10)}`;
}
