import { useEffect, useState } from "react";
import { ACTIVE_SESSION_EVENT, resolveActiveSession } from "@/lib/workoutSession";

export type ActiveSessionSummary = {
  programId: string | number;
  dayNumber: number;
  /** Epoch ms the session clock started; null for drafts written before timing existed. */
  startedAt: number | null;
};

// Collapsed to a string so re-reads that find the same session don't re-render.
function readKey(userId: string | undefined): string {
  if (!userId) return "";
  const active = resolveActiveSession(userId);
  if (!active) return "";
  const { programId, dayNumber } = active.pointer;
  return JSON.stringify([programId, dayNumber, active.draft.startedAt ?? null]);
}

/**
 * The workout session in progress, if any, for surfaces outside the log page
 * (the tab bar). Read-only: it never starts, resumes or clears a session.
 *
 * Re-reads when this tab writes or clears the pointer (ACTIVE_SESSION_EVENT),
 * when another tab does (`storage`), when the app comes back to the foreground
 * (a draft may have aged past DRAFT_MAX_AGE_MS meanwhile), and whenever
 * `location` changes.
 */
export function useActiveSession(userId: string | undefined, location: string): ActiveSessionSummary | null {
  const [key, setKey] = useState(() => readKey(userId));

  useEffect(() => {
    const refresh = () => setKey(readKey(userId));
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(ACTIVE_SESSION_EVENT, refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(ACTIVE_SESSION_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, location]);

  if (!key) return null;
  const [programId, dayNumber, startedAt] = JSON.parse(key) as [string | number, number, number | null];
  return { programId, dayNumber, startedAt };
}
