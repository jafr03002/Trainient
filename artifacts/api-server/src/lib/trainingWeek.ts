// A program's or workout log's "week number" must reflect real calendar time
// since the user started training, not just how many times a program row has
// been (re)created - otherwise it gets stuck at 1 for anyone who doesn't
// regenerate/check in on a strict weekly cadence.
export function trainingWeekNumber(onboardingCompletedAt: Date | null | undefined, at: Date = new Date()): number {
  if (!onboardingCompletedAt) return 1;
  const days = Math.floor((at.getTime() - onboardingCompletedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(days / 7) + 1);
}
