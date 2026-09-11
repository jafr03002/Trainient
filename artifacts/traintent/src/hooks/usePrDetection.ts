import { useEffect, useRef, useState } from "react";
import { estimatedOneRepMax, isEmptySet } from "@/lib/sessionLogs";

export type PrFlash = { id: number; exercise: string; weight: number };

type SetNumbers = { weight: number; reps: number; repsLeft: number; repsRight: number };

/**
 * Judges each completed set against the client's prior best e1RM for that
 * exercise and raises a `PrFlash` toast for a genuine new record.
 *
 * The baseline is drawn from saved history (previous sessions only; the
 * in-progress session isn't saved yet) plus the server's PRs. A set can only be
 * a PR if it beats a set from an earlier session, so an exercise the user has
 * never logged has no baseline to beat and its first sets are never PRs - a
 * first-ever log is a baseline, not a record.
 */
export function usePrDetection(history: any[] | undefined, personalRecords: any[] | undefined) {
  const [prFlashes, setPrFlashes] = useState<PrFlash[]>([]);
  const flashIdRef = useRef(0);

  // Prior all-time best score per exercise, plus the set of exercises that have
  // ever been logged before.
  const prBaselineRef = useRef<Record<string, number>>({});
  const priorLoggedRef = useRef<Set<string>>(new Set());
  const sessionBestRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const best: Record<string, number> = {};
    const seen = new Set<string>();
    for (const log of (history ?? []) as any[]) {
      for (const ex of (log.exercisesLogged as any[]) ?? []) {
        const key = ex.name?.toLowerCase();
        if (!key || !Array.isArray(ex.sets)) continue;
        for (const s of ex.sets) {
          if (isEmptySet(s)) continue;
          seen.add(key);
          const reps = s.repsLeft != null || s.repsRight != null
            ? Math.min(s.repsLeft ?? 0, s.repsRight ?? 0)
            : (s.reps ?? 0);
          const score = estimatedOneRepMax(s.weight ?? 0, reps);
          if (score > (best[key] ?? 0)) best[key] = score;
        }
      }
    }
    // Genuine PRs from the server may reach back past history's 200-log window;
    // fold them in so the baseline never regresses for very active users.
    for (const pr of personalRecords ?? []) {
      const key = pr.exercise.toLowerCase();
      seen.add(key);
      const score = estimatedOneRepMax(pr.maxWeight, pr.reps ?? 0);
      if (score > (best[key] ?? 0)) best[key] = score;
    }
    prBaselineRef.current = best;
    priorLoggedRef.current = seen;
  }, [history, personalRecords]);

  /**
   * Whether a just-completed set is a new PR. `wasPr` is whether that same set
   * was already flagged, so re-typing a PR set doesn't flash the toast again.
   */
  function judgeSet(name: string, isUnilateral: boolean, set: SetNumbers, wasPr: boolean): boolean {
    const nameKey = name.toLowerCase();
    const reps = isUnilateral ? Math.min(set.repsLeft, set.repsRight) : set.reps;
    const score = estimatedOneRepMax(set.weight, reps);
    const baseline = prBaselineRef.current[nameKey] ?? 0;
    const sessionBest = sessionBestRef.current[nameKey] ?? 0;
    const currentBest = Math.max(baseline, sessionBest);
    // Only a PR when it beats a set from an earlier session. The first time an
    // exercise is ever logged there is nothing to beat, so it is not a PR.
    const hasPrior = priorLoggedRef.current.has(nameKey);
    const isNewPr = hasPrior && score > currentBest;

    if (isNewPr && !wasPr) {
      sessionBestRef.current[nameKey] = score;
      const id = ++flashIdRef.current;
      setPrFlashes((f) => [...f, { id, exercise: name, weight: set.weight }]);
      setTimeout(() => setPrFlashes((f) => f.filter((x) => x.id !== id)), 4000);
    }
    return isNewPr;
  }

  return { prFlashes, judgeSet };
}
