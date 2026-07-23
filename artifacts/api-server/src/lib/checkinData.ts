// Builds the "everything logged the past week" evidence block the weekly
// check-in feeds to the AI, expressed in the exact variables the reprogramming
// reference (lib/knowledge/ti-check-in-engine.md) reasons about: averageWeight
// (vs last week), caloriesPerDay, stepCounts, cardioCompleted, sessions logged
// vs planned, progressionAcrossSets, sessionComments. Everything is condensed to compact
// lines rather than raw arrays - the same signal a coach glances at, cheap to
// interpolate into the prompt.

import {
  type LoggedExercise,
  type WorkoutLogRow,
  exerciseProgressions,
  muscleVolumeLatestWeek,
} from "./workoutAnalysis";
import { daysAgoStr, inWindow } from "./dateWindow";
import { formatAdherence, type SessionAdherence } from "./sessionAdherence";

type BodyweightLog = { date: string; weight: number; weightUnit: string };
type DailyLog = {
  date: string;
  calories: number | null;
  steps: number | null;
  cardioType: string | null;
  cardioMinutes: number | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export type CheckinEvidence = {
  averageWeight: number | null;
  averageWeightLastWeek: number | null;
  weightUnit: string;
  text: string;
};

// `today` is the check-in date (YYYY-MM-DD). This week = the 7 days ending today;
// last week = the 7 days before that.
export function buildCheckinEvidence(args: {
  today: string;
  bodyweightLogs: BodyweightLog[];
  dailyLogs: DailyLog[];
  workoutLogs: WorkoutLogRow[];
  // Precomputed by lib/sessionAdherence.ts and reused verbatim so the client and
  // the model are shown the same numbers.
  adherence: SessionAdherence;
  missedSessionReason: string | null;
}): CheckinEvidence {
  const { today, bodyweightLogs, dailyLogs, workoutLogs, adherence, missedSessionReason } = args;
  const weightUnit = bodyweightLogs[0]?.weightUnit ?? "kg";

  const thisStart = daysAgoStr(today, 6); // inclusive 7-day window ending today
  const lastEnd = daysAgoStr(today, 7);
  const lastStart = daysAgoStr(today, 13);

  const thisWeekWeights = bodyweightLogs.filter((l) => inWindow(l.date, thisStart, today)).map((l) => l.weight);
  const lastWeekWeights = bodyweightLogs.filter((l) => inWindow(l.date, lastStart, lastEnd)).map((l) => l.weight);
  const averageWeight = avg(thisWeekWeights);
  const averageWeightLastWeek = avg(lastWeekWeights);

  const thisWeekDaily = dailyLogs.filter((l) => inWindow(l.date, thisStart, today));
  const caloriesPerDay = avg(thisWeekDaily.map((l) => l.calories).filter((c): c is number => c != null));
  const stepCounts = avg(thisWeekDaily.map((l) => l.steps).filter((s): s is number => s != null));
  const cardioDays = thisWeekDaily.filter((l) => l.cardioType && (l.cardioMinutes ?? 0) > 0);
  const cardioMinutesTotal = cardioDays.reduce((s, l) => s + (l.cardioMinutes ?? 0), 0);

  const thisWeekSessions = workoutLogs.filter((l) => inWindow(l.date, thisStart, today));

  const progressions = exerciseProgressions(workoutLogs);
  const { volume: muscleVolume } = muscleVolumeLatestWeek(workoutLogs);

  // Session comments = workout-level notes + any per-exercise notes the client
  // left this week (both are free text the coach should read).
  const comments: string[] = [];
  for (const log of thisWeekSessions) {
    const anyLog = log as WorkoutLogRow & { notes?: string | null };
    if (anyLog.notes) comments.push(`${log.date}: ${anyLog.notes}`);
    for (const ex of (log.exercisesLogged as (LoggedExercise & { notes?: string | null })[]) ?? []) {
      if (ex.notes) comments.push(`${log.date} · ${ex.name}: ${ex.notes}`);
    }
  }

  const fmt = (n: number | null, digits = 0) => (n == null ? "no data" : n.toFixed(digits));
  const weightDeltaLine =
    averageWeight != null && averageWeightLastWeek != null
      ? `${(averageWeight - averageWeightLastWeek >= 0 ? "+" : "")}${(averageWeight - averageWeightLastWeek).toFixed(2)} ${weightUnit} vs last week`
      : "not enough data for a week-over-week change";

  const progressionLines = progressions.length
    ? progressions
        .slice(0, 12)
        .map((p) => {
          const trigger =
            p.stalledStreak >= 4
              ? " [RULE 1 STALL TRIGGER: 4+ sessions no e1RM progress]"
              : p.progressedStreak >= 4
                ? " [RULE 1 PROGRESS TRIGGER: 4+ sessions progressing]"
                : "";
          const delta = p.prevE1rm != null ? `${p.latestE1rm} vs prev ${p.prevE1rm}` : `${p.latestE1rm} (first session)`;
          return `  - ${p.exercise} (${p.muscle}): e1RM ${delta}; progressed streak ${p.progressedStreak}, stalled streak ${p.stalledStreak}${trigger}`;
        })
        .join("\n")
    : "  - No performed working sets logged in the recent window.";

  const muscleVolumeLine = Object.keys(muscleVolume).length
    ? Object.entries(muscleVolume)
        .sort((a, b) => b[1] - a[1])
        .map(([m, v]) => `${m} ${Math.round(v)}`)
        .join(", ")
    : "no data";

  const text = `Everything the client logged the past week (evaluate these alongside the questionnaire):
- averageWeight (this week): ${fmt(averageWeight, 1)} ${weightUnit} (${weightDeltaLine}); last week avg: ${fmt(averageWeightLastWeek, 1)} ${weightUnit}
- caloriesPerDay (avg over ${thisWeekDaily.filter((l) => l.calories != null).length} logged days): ${fmt(caloriesPerDay)} kcal
- stepCounts (avg over ${thisWeekDaily.filter((l) => l.steps != null).length} logged days): ${fmt(stepCounts)} steps
- cardioCompleted: ${cardioDays.length} session(s), ${cardioMinutesTotal} min total
${formatAdherence(adherence, missedSessionReason)}
- progressionAcrossSets (per-exercise e1RM = weight × (1 + reps/30), oldest→newest sessions):
${progressionLines}
- muscle volume this week (Σ weight × reps of working sets): ${muscleVolumeLine}
- sessionComments: ${comments.length ? "\n  · " + comments.join("\n  · ") : "none"}`;

  return { averageWeight, averageWeightLastWeek, weightUnit, text };
}
