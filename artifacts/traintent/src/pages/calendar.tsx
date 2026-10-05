import { useCallback, useRef, useState, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageSquare, Trash2, Check, ListChecks, Clock, Trophy, Info } from "lucide-react";
import { formatSessionLength, formatStartTime, countsTowardAverage } from "@/lib/sessionDuration";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWorkouts,
  useGetCalendarColors,
  useGetCurrentProgram,
  useDeleteWorkout,
  useListPrograms,
  useGetProfile,
  useUpdateProfile,
  getGetProfileQueryKey,
  getListWorkoutsQueryKey,
  getGetRecentWorkoutsQueryKey,
  getGetWorkoutStatsQueryKey,
  getGetPersonalRecordsQueryKey,
  getGetStrengthProgressQueryKey,
  getGetVolumeProgressQueryKey,
  getGetMuscleVolumeBreakdownQueryKey,
  getGetWorkoutsByDayLabelQueryKey,
} from "@workspace/api-client-react";
import { CHECKLIST_ACCENT, categoryMeta, formatDuration } from "@/lib/checklistItems";
import { phaseSolid, phaseLabel } from "@/lib/phaseColors";
import { buildDayColorOrder, dayColorHex } from "@/lib/dayColors";
import {
  addDays,
  buildPhaseRanges,
  buildCalibrationGroups,
  findPhaseRange,
  findCalibrationGroup,
  isReviewPossible,
  CALIBRATION_FAMILY,
  type PhaseRange,
} from "@/lib/calibration";
import { goalToPhase } from "@/lib/independentTargets";
import { resolveDayForDate, todayDateString, type StoredSchedule } from "@/lib/programSchedule";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";
import { DashboardWash } from "@/components/dashboard/DashboardWash";
import { MonthGrid, type MonthDay } from "@/components/calendar/MonthGrid";
import intentSun from "@/assets/intent-sun.png";

type WorkoutLog = {
  id: number;
  date: string;
  dayLabel: string | null;
  dayNumber: number;
  weekNumber: number;
  mode: string;
  exercisesLogged: any[];
  startedAt?: string | null;
  durationSeconds?: number | null;
};

type SessionModalProps = {
  session: WorkoutLog;
  allWorkouts: WorkoutLog[];
  colorHex: string;
  onClose: () => void;
  // Lets the first-run calendar tour anchor its last step on the close button,
  // which lives in here rather than on the page.
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  // ...and cut the sheet itself out of the tour's dimming backdrop, so the
  // session the user has just opened is the one bright thing on screen.
  panelRef?: RefObject<HTMLDivElement | null>;
};

const TITLE_CLASS = "text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground";
const SECTION_TITLE_CLASS = "text-[21px] font-light tracking-[-0.01em] text-foreground";
const BADGE_CLASS =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground";
// An independent user's phase has no end date - it runs until they change it.
const OPEN_END = new Date(9999, 0, 1);
const DAY_MS = 86_400_000;

// A set with no real data (weight and all rep fields zero/empty).
function isEmptySet(s: any): boolean {
  if (!s) return true;
  return !(s.weight) && !(s.reps) && !(s.repsLeft) && !(s.repsRight);
}

function exerciseHasData(ex: any): boolean {
  return Array.isArray(ex?.sets) && ex.sets.some((s: any) => !isEmptySet(s));
}

// Per-set progression delta, e.g. "+5kg" / "-2" / "–" (unchanged).
function deltaText(d: number, unit: string): string {
  if (d === 0) return "–";
  return `${d > 0 ? "+" : ""}${Math.round(d * 100) / 100}${unit}`;
}
// Sessions keeps cyan for increases only; a drop is plain muted text.
function deltaCls(d: number): string {
  return d > 0 ? "text-[hsl(var(--sessions-cyan))]" : d < 0 ? "text-muted-foreground" : "text-muted-foreground/60";
}

function isUnilateralSet(s: any): boolean {
  return s && (s.repsLeft != null || s.repsRight != null);
}

// Comparable rep count: lower of the two sides for unilateral sets (section 7).
function setReps(s: any): number {
  if (isUnilateralSet(s)) return Math.min(s.repsLeft ?? 0, s.repsRight ?? 0);
  return s.reps ?? 0;
}

// Display label, e.g. "8" or "8L / 7R".
function setRepsLabel(s: any): string {
  if (isUnilateralSet(s)) return `${s.repsLeft ?? 0}L / ${s.repsRight ?? 0}R`;
  return `${s.reps ?? 0}`;
}

function sessionSummary(session: WorkoutLog): string {
  const exercises = (session.exercisesLogged as any[]).filter(exerciseHasData);
  const sets = exercises.reduce((n, ex) => n + (ex.sets as any[]).filter((s) => !isEmptySet(s)).length, 0);
  const parts = [`${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`];
  if (sets > 0) parts.push(`${sets} set${sets === 1 ? "" : "s"}`);
  if (session.durationSeconds != null) parts.push(formatSessionLength(session.durationSeconds));
  return parts.join(" · ");
}

function SessionModal({ session, allWorkouts, colorHex, onClose, closeButtonRef, panelRef }: SessionModalProps) {
  const exercises = session.exercisesLogged as any[];
  const queryClient = useQueryClient();
  const deleteWorkout = useDeleteWorkout();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    try {
      await deleteWorkout.mutateAsync({ id: session.id });
    } catch {
      return; // deleteWorkout.isError drives the inline error message below.
    }
    queryClient.invalidateQueries({ queryKey: getListWorkoutsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentWorkoutsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPersonalRecordsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStrengthProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetVolumeProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMuscleVolumeBreakdownQueryKey() });
    if (session.dayLabel) {
      queryClient.invalidateQueries({ queryKey: getGetWorkoutsByDayLabelQueryKey() });
    }
    setShowDeleteConfirm(false);
    onClose();
  }

  // Most recent session strictly before this one (by date, then id) that has
  // real data for the given exercise - skips empty/abandoned sessions.
  function findPrevExerciseSets(name: string): any[] | null {
    const priors = allWorkouts
      .filter((w) => w.id !== session.id)
      .filter((w) => w.date < session.date || (w.date === session.date && w.id < session.id))
      .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
    for (const w of priors) {
      const ex = (w.exercisesLogged as any[]).find((e: any) => e.name === name);
      if (ex && exerciseHasData(ex)) return ex.sets as any[];
    }
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg max-h-[88dvh] flex flex-col bg-card rounded-t-[30px] md:rounded-[30px] overflow-hidden pb-[env(safe-area-inset-bottom)] md:pb-0"
        >
          {/* Grab handle (mobile bottom-sheet affordance) */}
          <div className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-accent" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-2 md:pt-6 border-b border-border shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorHex }} />
                <span className={`${SECTION_TITLE_CLASS} truncate`}>{session.dayLabel ?? "Workout"}</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                {new Date(session.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                <span className="text-muted-foreground/60"> · {session.mode === "independent" ? "Independent mode" : "AI mode"}</span>
              </p>
              {/* Timing gets its own line rather than extending the date line
                  sideways. This is also the only place in the calendar that has
                  ever shown a time of day - `date` is a bare YYYY-MM-DD, so
                  `startedAt` is what makes it possible. */}
              {session.durationSeconds != null && (
                <div className="mt-1" data-testid="text-session-duration">
                  <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                    {session.startedAt && (
                      <>
                        {formatStartTime(session.startedAt)}
                        <span className="text-muted-foreground/60">·</span>
                      </>
                    )}
                    {formatSessionLength(session.durationSeconds)}
                  </p>
                  {/* An overnight session is stored honestly; this stops the
                      resulting number reading as a bug. */}
                  {!countsTowardAverage(session) && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Not counted toward your average
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close session"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={1.6} />
            </button>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-8 space-y-7">
            {exercises.map((ex: any, i: number) => {
              // A logged checklist item has no sets and no muscle, so it gets a
              // compact line of its own rather than an empty muscle pill above an
              // empty set list.
              if (ex.kind === "checklist") {
                const meta = categoryMeta(ex.category);
                const accent = meta?.token ?? CHECKLIST_ACCENT;
                const done = (ex.completedRounds ?? 0) > 0;
                return (
                  <div key={i} className="flex items-center gap-3 min-w-0" data-testid={`session-checklist-${i}`}>
                    <span
                      className={`shrink-0 grid h-8 w-8 place-items-center rounded-full bg-secondary ${done ? "text-chart-2" : "text-muted-foreground/60"}`}
                    >
                      {done ? <Check className="w-4 h-4" strokeWidth={2} /> : <ListChecks className="w-4 h-4" strokeWidth={1.6} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-[15px] text-foreground truncate ${done ? "" : "opacity-60"}`}>{ex.name}</h3>
                      <p className="text-[12.5px] text-muted-foreground truncate">
                        <span style={{ color: accent }}>{meta ? meta.label : "Checklist"}</span>
                        {(ex.targetSeconds ?? 0) > 0 && <> · {formatDuration(ex.targetSeconds)}</>}
                        {(ex.completedRounds ?? 0) > 1 && <> · {ex.completedRounds} rounds</>}
                      </p>
                    </div>
                  </div>
                );
              }

              const prevSets = findPrevExerciseSets(ex.name);

              return (
                <div key={i}>
                  {/* Exercise header */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground whitespace-nowrap">
                      {ex.muscle}
                    </span>
                    {!prevSets && (
                      <span className="text-[11px] text-muted-foreground truncate">First time logging this exercise</span>
                    )}
                  </div>
                  <h3 className="mt-2 text-[17px] font-normal text-foreground">{ex.name}</h3>

                  {/* Sets - with per-set progression vs the previous session */}
                  <div className="mt-2 rounded-[22px] bg-secondary/60 overflow-hidden empty:hidden">
                    {(ex.sets as any[])
                      .filter((s: any) => !isEmptySet(s))
                      .map((s: any, si: number) => {
                        const prev = prevSets?.find((p: any) => p.setNumber === s.setNumber);
                        const showDelta = prev && !isEmptySet(prev);
                        const wd = showDelta ? (s.weight ?? 0) - (prev.weight ?? 0) : 0;
                        const rd = showDelta ? setReps(s) - setReps(prev) : 0;
                        return (
                          <div
                            key={si}
                            className={`group flex items-center pl-4 ${
                              s.isNewPr ? "bg-[linear-gradient(90deg,hsl(var(--sessions-cyan)/0.14),transparent_70%)]" : ""
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-2.5 pr-4 text-sm group-last:border-b-0">
                              <span className="w-11 shrink-0 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">Set {s.setNumber}</span>
                              <span className="whitespace-nowrap text-foreground tabular-nums">
                                {s.weight}kg × {setRepsLabel(s)}
                              </span>
                              {s.isNewPr && (
                                <span className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--sessions-cyan))]">
                                  <Trophy className="h-3.5 w-3.5" strokeWidth={1.6} />
                                  PR
                                </span>
                              )}
                              {showDelta && (
                                <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs tabular-nums" data-testid={`set-delta-${i}-${si}`}>
                                  <span className={deltaCls(wd)}>{deltaText(wd, "kg")}</span>
                                  <span className={deltaCls(rd)}>{deltaText(rd, rd === 0 ? "" : " reps")}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Per-exercise notes */}
                  {ex.notes && (
                    <div className="flex items-start gap-2.5 mt-2 rounded-[18px] bg-secondary/60 px-4 py-3">
                      <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.6} />
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{ex.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Delete session - destructive is red text, never a red surface */}
            <div className="pt-4 border-t border-border">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-sm text-destructive rounded-full px-3 py-2 -mx-3 transition-colors hover:bg-secondary"
                data-testid="delete-session-button"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                Delete session
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !deleteWorkout.isPending && setShowDeleteConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm bg-card rounded-t-[30px] md:rounded-[30px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6 space-y-5"
          >
            <div>
              <h3 className={SECTION_TITLE_CLASS}>Delete this session?</h3>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground mt-1.5">
                All PRs and data from this session will be deleted. This can't be undone.
              </p>
            </div>
            {deleteWorkout.isError && (
              <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteWorkout.isPending}
                className="flex-1 h-[52px] rounded-full border border-foreground/90 text-sm font-semibold uppercase tracking-[0.06em] text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteWorkout.isPending}
                className="flex-1 h-[52px] rounded-full bg-secondary text-sm font-semibold uppercase tracking-[0.06em] text-destructive disabled:opacity-50 transition-colors hover:bg-accent"
                data-testid="confirm-delete-session"
              >
                {deleteWorkout.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "Week 2 of 8" for a phase on a given day; an open-ended phase has no "of".
function phaseWeek(range: PhaseRange, on: Date): { week: number; total: number | null } {
  const week = Math.floor((on.getTime() - range.start.getTime()) / (7 * DAY_MS)) + 1;
  const total = range.end.getTime() >= OPEN_END.getTime() ? null : Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS + 1) / 7;
  return { week, total: total == null ? null : Math.ceil(total) };
}

export default function Calendar() {
  const now = new Date();
  const todayStr = todayDateString(now);
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedSession, setSelectedSession] = useState<WorkoutLog | null>(null);
  const [sunX, setSunX] = useState<number | undefined>(undefined);
  const workoutsQuery = useListWorkouts({ limit: 200 });
  const colorsQuery = useGetCalendarColors();
  const currentProgramQuery = useGetCurrentProgram();
  const programsQuery = useListPrograms();
  const profileQuery = useGetProfile();
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const shellRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const tourGridRef = useRef<HTMLDivElement>(null);
  const tourCloseSessionRef = useRef<HTMLButtonElement>(null);
  const tourSessionPanelRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = (firstDay.getDay() + 6) % 7;

  const workouts = (workoutsQuery.data ?? []) as WorkoutLog[];

  // Final leg of the walkthrough, handed over from the dashboard's "open up your
  // calendar" nudge once the user has logged a session. Both steps are ones the
  // user has to carry out - open a session, then close it again - so the tour
  // ends having actually shown them a past session rather than describing one.
  const showCalendarTour =
    !!profileQuery.data && !profileQuery.data.calendarTourSeenAt && workouts.length > 0;
  const calendarTourSteps: CoachmarkStep[] = [
    {
      kind: "awaitAction",
      target: tourGridRef,
      text: "Here you can track and look back at your sessions - tap a white day, then its session to open it.",
      done: !!selectedSession,
    },
    {
      kind: "awaitAction",
      target: tourCloseSessionRef,
      // Ring the close button, but light up the whole sheet: the point of the
      // step is the session itself, so it shouldn't sit under the scrim.
      spotlight: tourSessionPanelRef,
      text: "And here's that past session in full - tap here to close it.",
      done: !selectedSession,
    },
  ];
  function finishCalendarTour() {
    updateProfile.mutate(
      { data: { calendarTourSeenAt: new Date().toISOString() } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() }) }
    );
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // AI mode paints its program's phase lineage. Independent mode has no phase
  // history - only the phase the user has set now (the targets box) - so it's
  // painted from today onwards and runs open-ended, until they change it.
  // Skipping the AI lineage for independent users also avoids surfacing a
  // leftover calibration phase from a program lineage they switched away from.
  const isIndependent = profileQuery.data?.mode === "independent";
  const phaseRanges: PhaseRange[] = !profileQuery.data
    ? []
    : isIndependent
    ? [{ phase: goalToPhase(profileQuery.data.goal), start: todayMidnight, end: OPEN_END }]
    : buildPhaseRanges(programsQuery.data ?? [], profileQuery.data.onboardingCompletedAt);
  const calibrationGroups = buildCalibrationGroups(phaseRanges);
  const activeCalibrationGroup = findCalibrationGroup(calibrationGroups, todayMidnight);

  // Other phases stay hidden anywhere on the calendar while today is still
  // inside a calibration/calibration_review run - they're provisional until
  // the review actually happens.
  function visiblePhaseOn(date: Date): PhaseRange | undefined {
    const raw = findPhaseRange(phaseRanges, date);
    if (!raw) return undefined;
    if (activeCalibrationGroup && !CALIBRATION_FAMILY.has(raw.phase)) return undefined;
    return raw;
  }

  const colorMap: Record<string, string> = {};
  (colorsQuery.data ?? []).forEach((c) => { colorMap[c.dayLabel] = c.hexColor; });

  const allLabels = [...new Set(workouts.map((w) => w.dayLabel).filter(Boolean))] as string[];

  // A session's colour is the one its day wears on the program page and in the
  // editor - so the order comes from the current program's days, not from the
  // order sessions happen to have been logged in. Labels from older programs
  // (or renamed days) fall in behind them, keeping their own stable colour.
  const programDays = ((currentProgramQuery.data?.days ?? []) as { label?: string | null; dayNumber?: number }[]);
  const colorOrder = buildDayColorOrder(programDays.map((d) => d?.label), allLabels);
  const colorFor = (label: string) => dayColorHex(label, colorOrder, colorMap);

  // Only a fixed weekly schedule can say what a future day holds.
  const schedule = (currentProgramQuery.data?.schedule ?? null) as StoredSchedule | null;
  const plannedLabelOn = (date: string): string | null => {
    if (schedule?.mode !== "fixed") return null;
    const n = resolveDayForDate(schedule, currentProgramQuery.data?.startDate ?? null, date);
    if (n == null) return null;
    return programDays.find((d) => d.dayNumber === n)?.label ?? null;
  };

  const workoutsByDate: Record<string, WorkoutLog[]> = {};
  workouts.forEach((w) => {
    (workoutsByDate[w.date] ??= []).push(w);
  });

  const monthName = currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthOnly = currentDate.toLocaleDateString("en-GB", { month: "long" });

  const days: MonthDay[] = Array.from({ length: lastDay.getDate() }, (_, i) => {
    const day = i + 1;
    const date = dateKey(year, month, day);
    const cellDate = new Date(year, month, day);
    const sessions = workoutsByDate[date] ?? [];
    const range = visiblePhaseOn(cellDate);
    const isPast = date < todayStr;
    const planned = sessions.length === 0 && !isPast ? plannedLabelOn(date) : null;
    const phaseStart = !!range && range.start.getTime() === cellDate.getTime();
    const phaseEnd = !!range && range.end.getTime() === cellDate.getTime();
    const what = sessions.length
      ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}: ${sessions.map((s) => s.dayLabel ?? "Workout").join(", ")}`
      : planned
      ? `planned: ${planned}`
      : isPast
      ? "rest day"
      : "nothing planned";
    return {
      date,
      day,
      isToday: date === todayStr,
      isPast,
      trained: sessions.length > 0,
      planned: !!planned,
      phase: range?.phase ?? null,
      phaseStart,
      phaseNamed: !!range && (phaseStart || day === 1),
      phaseEnd,
      ariaLabel: `${day} ${monthOnly}${range ? `, ${phaseLabel(range.phase)} phase` : ""} - ${what}`,
    };
  });

  const sessionsInMonth = days.reduce((n, d) => n + (workoutsByDate[d.date]?.length ?? 0), 0);

  function goToMonth(next: Date) {
    const first = new Date(next.getFullYear(), next.getMonth(), 1);
    setCurrentDate(first);
    // Land on today in this month, otherwise the 1st.
    const inMonth = todayStr.startsWith(dateKey(first.getFullYear(), first.getMonth(), 1).slice(0, 7));
    setSelectedDate(inMonth ? todayStr : dateKey(first.getFullYear(), first.getMonth(), 1));
  }
  const prevMonth = () => goToMonth(new Date(year, month - 1, 1));
  const nextMonth = () => goToMonth(new Date(year, month + 1, 1));
  const goToday = () => goToMonth(now);
  const viewingThisMonth = year === now.getFullYear() && month === now.getMonth();

  const selectedSessions = workoutsByDate[selectedDate] ?? [];
  const selectedDay = days.find((d) => d.date === selectedDate);
  const selectedDateObj = new Date(year, month, selectedDay?.day ?? 1);
  const selectedPlanned = selectedDay?.planned ? plannedLabelOn(selectedDate) : null;
  const selectedRange = selectedDay ? visiblePhaseOn(selectedDateObj) : undefined;

  function activateDay(date: string) {
    const sessions = workoutsByDate[date] ?? [];
    if (sessions.length === 1) setSelectedSession(sessions[0]);
  }

  // The storm's light follows the selected day's column across the screen.
  const onColumnChange = useCallback((x: number) => {
    const shell = shellRef.current;
    const grid = gridWrapRef.current;
    if (!shell || !grid) return;
    const sr = shell.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    if (!sr.width) return;
    setSunX((gr.left - sr.left + x * gr.width) / sr.width);
  }, []);

  // Today's phase, for the "you're in a bulk" badge.
  const todayRange = visiblePhaseOn(todayMidnight);
  const todayWeek = todayRange ? phaseWeek(todayRange, todayMidnight) : null;

  const reviewFrom = activeCalibrationGroup ? addDays(activeCalibrationGroup.start, 7) : null;
  const reviewOpen = !!activeCalibrationGroup && isReviewPossible(activeCalibrationGroup, todayMidnight);

  return (
    <div
      ref={shellRef}
      className="relative min-h-page overflow-hidden bg-background text-foreground -mt-[env(safe-area-inset-top)] pt-[env(safe-area-inset-top)]"
    >
      <DashboardWash className="absolute inset-x-0 top-0 h-[420px]" sunX={sunX} />

      <div className="relative mx-auto max-w-3xl space-y-6 p-6">
        {/* Brand opposite "Today", as on the dashboard */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-[7px]">
            <img src={intentSun} alt="" className="h-5 w-5" />
            <span className="text-base font-normal tracking-[-0.005em] text-white">Intent</span>
          </span>
          <button
            type="button"
            onClick={goToday}
            disabled={viewingThisMonth && selectedDate === todayStr}
            className="rounded-full bg-white/[0.08] px-3.5 py-2 text-[13px] text-white backdrop-blur-md transition-colors hover:bg-white/[0.14] disabled:opacity-40"
            data-testid="calendar-today"
          >
            Today
          </button>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <h1 className={TITLE_CLASS}>Calendar</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[13.5px] text-white/70">
              {sessionsInMonth} session{sessionsInMonth === 1 ? "" : "s"} in {monthOnly}
            </span>
            {todayRange && (
              <span className={`${BADGE_CLASS} bg-white/[0.08] backdrop-blur-md`} data-testid="calendar-current-phase">
                {/* The phase colour survives as a small signal only. */}
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: phaseSolid(todayRange.phase) }} />
                {phaseLabel(todayRange.phase)} phase
                {todayWeek && todayWeek.total != null && (
                  <span className="text-white/60">· week {todayWeek.week} of {todayWeek.total}</span>
                )}
              </span>
            )}
          </div>
        </motion.div>

        {/* Month switcher: just the arrows and the month, straight on the storm.
            The -mx lines the chevrons up with the grid's outer columns. */}
        <div className="-mx-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition-colors hover:text-white active:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.6} />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={monthName}
              initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="text-[17px] font-normal tracking-[-0.01em] text-white"
              aria-live="polite"
            >
              {monthName}
            </motion.h2>
          </AnimatePresence>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition-colors hover:text-white active:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </div>

        <div ref={tourGridRef} className="space-y-6">
          <div ref={gridWrapRef}>
            <div className="mb-1.5 grid grid-cols-7" aria-hidden>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="text-center text-[10.5px] uppercase tracking-[0.1em] text-white/55">
                  {d}
                </div>
              ))}
            </div>
            <MonthGrid
              padding={startPadding}
              days={days}
              selected={selectedDate}
              onSelect={setSelectedDate}
              onActivate={activateDay}
              onColumnChange={onColumnChange}
            />
          </div>

          {activeCalibrationGroup && reviewFrom && (
            <div className="flex items-start gap-2.5 rounded-[22px] bg-card px-4 py-3.5">
              <Info className="mt-px h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {reviewOpen
                  ? "Calibration review possible - it happens with your weekly check-in."
                  : `Calibration review possible from ${reviewFrom.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`}
              </p>
            </div>
          )}

          {/* The selected day: what happened (or is planned) on it */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={selectedDate}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              aria-live="polite"
            >
              <div className="mb-3">
                <h2 className={`${SECTION_TITLE_CLASS} truncate`}>
                  {selectedDate === todayStr
                    ? "Today"
                    : selectedDateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                {selectedRange && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: phaseSolid(selectedRange.phase) }} />
                    <span className="truncate">
                      <span className="capitalize">{phaseLabel(selectedRange.phase)}</span> phase
                      {phaseWeek(selectedRange, selectedDateObj).total != null && <> · week {phaseWeek(selectedRange, selectedDateObj).week}</>}
                    </span>
                  </p>
                )}
              </div>

              {selectedSessions.length > 0 ? (
                <div className="overflow-hidden rounded-[26px] bg-card">
                  {selectedSessions.map((session) => {
                    const label = session.dayLabel ?? "Workout";
                    const hasNotes = (session.exercisesLogged as any[]).some((ex: any) => ex.notes);
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSession(session)}
                        data-testid={`day-agenda-session-${session.id}`}
                        className="group flex w-full items-center pl-5 text-left transition-colors hover:bg-accent/50 active:bg-accent/60"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[15px] pr-5 group-last:border-b-0">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(label) }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] text-foreground">{label}</span>
                            <span className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                              {sessionSummary(session)}
                              {hasNotes && <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.6} aria-label="Has notes" />}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-[26px] bg-card px-5 py-[15px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-foreground">
                      {selectedPlanned ?? (selectedDate < todayStr ? "Rest day" : "Nothing planned")}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {selectedPlanned
                        ? selectedDate === todayStr
                          ? "Planned for today - start it from the tab bar"
                          : "Planned session"
                        : selectedDate < todayStr
                        ? "No session logged"
                        : "No session on your schedule"}
                    </span>
                  </span>
                </div>
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      </div>

      {/* Session modal */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          allWorkouts={workouts}
          colorHex={colorFor(selectedSession.dayLabel ?? "Workout")}
          onClose={() => setSelectedSession(null)}
          closeButtonRef={showCalendarTour ? tourCloseSessionRef : undefined}
          panelRef={showCalendarTour ? tourSessionPanelRef : undefined}
        />
      )}

      {/* Rendered after the session modal deliberately: both sit at z-[60], so
          painting the tour last is what keeps its bubble on top of the open
          session rather than behind it. */}
      {showCalendarTour && (
        <CoachmarkTour steps={calendarTourSteps} onDone={finishCalendarTour} testIdPrefix="calendar-tour" />
      )}
    </div>
  );
}
