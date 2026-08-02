import { useRef, useState, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageSquare, Trash2, Check, ListChecks, Clock } from "lucide-react";
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
import { phaseSolid, phaseSoft, phaseLabel } from "@/lib/phaseColors";
import { buildDayColorOrder, dayColorHex } from "@/lib/dayColors";
import {
  buildPhaseRanges,
  buildCalibrationGroups,
  findPhaseRange,
  findCalibrationGroup,
  isReviewPossible,
  CALIBRATION_FAMILY,
} from "@/lib/calibration";
import { CoachmarkTour, type CoachmarkStep } from "@/components/onboarding/CoachmarkTour";

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
};

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
function deltaCls(d: number): string {
  return d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-muted-foreground/70";
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

function SessionModal({ session, allWorkouts, colorHex, onClose, closeButtonRef }: SessionModalProps) {
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
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col bg-card border border-border rounded-t-2xl md:rounded-2xl overflow-hidden"
        >
          {/* Grab handle (mobile bottom-sheet affordance) */}
          <div className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-4 pt-2 md:pt-5 border-b border-border shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: colorHex }} />
                <span className="font-bold text-foreground text-lg">{session.dayLabel ?? "Workout"}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date(session.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                <span className="text-muted-foreground/50"> · {session.mode === "independent" ? "Independent mode" : "AI mode"}</span>
              </p>
              {/* Timing gets its own line rather than extending the date line
                  sideways. This is also the only place in the calendar that has
                  ever shown a time of day - `date` is a bare YYYY-MM-DD, so
                  `startedAt` is what makes it possible. */}
              {session.durationSeconds != null && (
                <div className="mt-1" data-testid="text-session-duration">
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {session.startedAt && (
                      <>
                        {formatStartTime(session.startedAt)}
                        <span className="text-muted-foreground/50">·</span>
                      </>
                    )}
                    {formatSessionLength(session.durationSeconds)}
                  </p>
                  {/* An overnight session is stored honestly; this stops the
                      resulting number reading as a bug. */}
                  {!countsTowardAverage(session) && (
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                      Not counted toward your average
                    </p>
                  )}
                </div>
              )}
            </div>
            <button ref={closeButtonRef} onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 pb-8 space-y-6">
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
                      className={`shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center ${
                        done ? "bg-chart-2/15 border-chart-2/50 text-chart-2" : "bg-secondary/30 border-border text-muted-foreground/50"
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : <ListChecks className="w-3 h-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className={`font-semibold text-foreground truncate ${done ? "" : "opacity-60"}`}>{ex.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-medium" style={{ color: accent }}>
                          {meta ? meta.label : "Checklist"}
                        </span>
                        {(ex.targetSeconds ?? 0) > 0 && <> · {formatDuration(ex.targetSeconds)}</>}
                        {(ex.completedRounds ?? 0) > 1 && <> · {ex.completedRounds} rounds</>}
                      </p>
                    </div>
                  </div>
                );
              }

              const prevSets = findPrevExerciseSets(ex.name);

              return (
                <div key={i} className="space-y-2">
                  {/* Exercise header */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                      {ex.muscle}
                    </span>
                    {!prevSets && (
                      <span className="text-[11px] text-muted-foreground/70">First time logging this exercise</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-foreground">{ex.name}</h3>

                  {/* Sets - with per-set progression vs the previous session */}
                  <div className="space-y-1">
                    {(ex.sets as any[])
                      .filter((s: any) => !isEmptySet(s))
                      .map((s: any, si: number) => {
                        const prev = prevSets?.find((p: any) => p.setNumber === s.setNumber);
                        const showDelta = prev && !isEmptySet(prev);
                        const wd = showDelta ? (s.weight ?? 0) - (prev.weight ?? 0) : 0;
                        const rd = showDelta ? setReps(s) - setReps(prev) : 0;
                        return (
                        <div key={si} className={`flex items-center gap-3 text-sm py-0.5 ${s.isNewPr ? "text-amber-400" : "text-muted-foreground"}`}>
                          <span className="w-12 text-xs shrink-0">Set {s.setNumber}</span>
                          <span className={`font-medium ${s.isNewPr ? "text-amber-300" : "text-foreground"}`}>
                            {s.weight}kg × {setRepsLabel(s)}
                          </span>
                          {s.isNewPr && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 uppercase tracking-wider">PR</span>}
                          {showDelta && (
                            <span className="ml-auto flex items-center gap-2 text-xs" data-testid={`set-delta-${i}-${si}`}>
                              <span className={deltaCls(wd)}>{deltaText(wd, "kg")}</span>
                              <span className={deltaCls(rd)}>{deltaText(rd, rd === 0 ? "" : " reps")}</span>
                            </span>
                          )}
                        </div>
                      );})}
                  </div>

                  {/* Per-exercise notes */}
                  {ex.notes && (
                    <div className="flex items-start gap-2 mt-2 p-3 rounded-xl bg-secondary/30 border border-border/50">
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground leading-relaxed italic">{ex.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Delete session */}
            <div className="pt-4 mt-2 border-t border-border/50">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg px-2 py-2 -mx-2 transition-colors"
                data-testid="delete-session-button"
              >
                <Trash2 className="w-4 h-4" />
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleteWorkout.isPending && setShowDeleteConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22 }}
            className="relative z-10 w-full max-w-sm bg-card border border-border rounded-t-2xl md:rounded-2xl p-5 space-y-4"
          >
            <div>
              <h3 className="font-semibold text-foreground">Delete this session?</h3>
              <p className="text-sm text-muted-foreground mt-1">
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
                className="flex-1 h-11 rounded-xl border border-border text-foreground font-medium disabled:opacity-50 hover:bg-secondary/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteWorkout.isPending}
                className="flex-1 h-11 rounded-xl bg-red-500/90 text-white font-semibold disabled:opacity-50 hover:bg-red-500 transition-colors"
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

type DayAgendaProps = {
  date: string;
  sessions: WorkoutLog[];
  colorFor: (label: string) => string;
  onSelect: (session: WorkoutLog) => void;
  onClose: () => void;
};

// Mobile-only bottom sheet: tapping a cramped day's dot row opens this to show
// every session's full label, instead of trying to fit them as text in-cell.
function DayAgendaSheet({ date, sessions, colorFor, onSelect, onClose }: DayAgendaProps) {
  const dateLabel = new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[55] flex items-end justify-center md:hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 w-full max-w-lg bg-card border border-border rounded-t-2xl overflow-hidden"
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-border" />
          </div>
          <div className="px-5 pb-4 pt-1">
            <span className="font-bold text-foreground text-base">{dateLabel}</span>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} - tap one to open
            </p>
          </div>
          <div className="px-5 pb-6 space-y-2">
            {sessions.map((session) => {
              const label = session.dayLabel ?? "Workout";
              const color = colorFor(label);
              const exerciseCount = (session.exercisesLogged as any[]).filter(exerciseHasData).length;
              return (
                <button
                  key={session.id}
                  onClick={() => onSelect(session)}
                  data-testid={`day-agenda-session-${session.id}`}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-border/60 bg-secondary/20 text-left hover:bg-secondary/40 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground truncate">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState<WorkoutLog | null>(null);
  const [dayAgenda, setDayAgenda] = useState<{ date: string; sessions: WorkoutLog[] } | null>(null);
  const workoutsQuery = useListWorkouts({ limit: 200 });
  const colorsQuery = useGetCalendarColors();
  const currentProgramQuery = useGetCurrentProgram();
  const programsQuery = useListPrograms();
  const profileQuery = useGetProfile();
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const tourGridRef = useRef<HTMLDivElement>(null);
  const tourCloseSessionRef = useRef<HTMLButtonElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const totalCells = Math.ceil((startPadding + lastDay.getDate()) / 7) * 7;

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
      text: "Here you can track and look back at your sessions - tap one to open it.",
      done: !!selectedSession,
    },
    {
      kind: "awaitAction",
      target: tourCloseSessionRef,
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

  // Independent mode has no AI-generated phase lineage - phases/calibration
  // only ever apply to AI mode (mirrors dashboard.tsx's isIndependent gate).
  // Skipping this avoids surfacing a leftover calibration phase from a
  // program lineage the user switched away from.
  const isIndependent = profileQuery.data?.mode === "independent";
  const phaseRanges = isIndependent
    ? []
    : buildPhaseRanges(programsQuery.data ?? [], profileQuery.data?.onboardingCompletedAt);
  const calibrationGroups = buildCalibrationGroups(phaseRanges);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const activeCalibrationGroup = findCalibrationGroup(calibrationGroups, todayMidnight);

  const colorMap: Record<string, string> = {};
  (colorsQuery.data ?? []).forEach((c) => { colorMap[c.dayLabel] = c.hexColor; });

  const allLabels = [...new Set(workouts.map((w) => w.dayLabel).filter(Boolean))] as string[];

  // A session's colour is the one its day wears on the program page and in the
  // editor - so the order comes from the current program's days, not from the
  // order sessions happen to have been logged in. Labels from older programs
  // (or renamed days) fall in behind them, keeping their own stable colour.
  const programLabels = ((currentProgramQuery.data?.days ?? []) as { label?: string | null }[])
    .map((d) => d?.label);
  const colorOrder = buildDayColorOrder(programLabels, allLabels);
  const colorFor = (label: string) => dayColorHex(label, colorOrder, colorMap);

  const workoutsByDate: Record<string, WorkoutLog[]> = {};
  workouts.forEach((w) => {
    if (!workoutsByDate[w.date]) workoutsByDate[w.date] = [];
    workoutsByDate[w.date].push(w);
  });

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }

  // Mobile tap on a day cell. A lone session opens straight to its detail -
  // the agenda sheet would just be an extra tap to pick the only option.
  function openDay(date: string, sessions: WorkoutLog[]) {
    if (sessions.length === 1) setSelectedSession(sessions[0]);
    else setDayAgenda({ date, sessions });
  }

  const monthName = currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const today = new Date().toISOString().split("T")[0];

  // Phases actually shown this month, post calibration-suppression - drives the
  // mobile-only color legend since in-cell phase labels are dot-only there.
  const visiblePhases = new Set<string>();
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startPadding + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) continue;
    const raw = findPhaseRange(phaseRanges, new Date(year, month, dayNum));
    if (!raw) continue;
    if (activeCalibrationGroup && !CALIBRATION_FAMILY.has(raw.phase)) continue;
    visiblePhases.add(raw.phase);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Training Calendar</h1>
        <p className="text-muted-foreground mt-1">Your session history at a glance.</p>
      </motion.div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground capitalize">{monthName}</h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div ref={tourGridRef} className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startPadding + 1;
          const isCurrentMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
          const dateStr = isCurrentMonth
            ? `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
            : "";
          const sessions = dateStr ? (workoutsByDate[dateStr] ?? []) : [];
          const isToday = dateStr === today;
          const hasNotes = sessions.some((s) =>
            (s.exercisesLogged as any[]).some((ex: any) => ex.notes)
          );
          const cellDate = isCurrentMonth ? new Date(year, month, dayNum) : null;
          const rawPhaseRange = cellDate ? findPhaseRange(phaseRanges, cellDate) : undefined;
          // Other phases stay hidden anywhere on the calendar while today is still
          // inside a calibration/calibration_review run - they're provisional until
          // the review actually happens.
          const suppressed = !!activeCalibrationGroup && !!rawPhaseRange && !CALIBRATION_FAMILY.has(rawPhaseRange.phase);
          const phaseRange = suppressed ? undefined : rawPhaseRange;
          const showPhaseChip = !!phaseRange && (dayNum === 1 || phaseRange.start.getTime() === cellDate!.getTime());
          const showReviewNudge =
            !!cellDate && !!activeCalibrationGroup && isReviewPossible(activeCalibrationGroup, cellDate);

          return (
            <div
              key={idx}
              className={`relative min-h-[72px] md:min-h-[88px] p-1.5 rounded-xl border transition-colors ${
                !isCurrentMonth
                  ? "border-transparent"
                  : isToday
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/40 bg-card/50 hover:bg-card"
              }`}
              style={phaseRange ? { background: phaseSoft(phaseRange.phase) } : undefined}
            >
              {isCurrentMonth && (
                <>
                  {showPhaseChip && phaseRange && (
                    <>
                      {/* Desktop/tablet: dot + full phase name */}
                      <div className="hidden md:flex items-center gap-1 mb-1 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: phaseSolid(phaseRange.phase) }}
                        />
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide truncate capitalize"
                          style={{ color: phaseSolid(phaseRange.phase) }}
                        >
                          {phaseLabel(phaseRange.phase)} phase
                        </span>
                      </div>
                      {/* Mobile: dot only - name isn't legible in a ~40px cell, see legend below */}
                      <span
                        className="md:hidden block w-1.5 h-1.5 rounded-full mb-1"
                        style={{ background: phaseSolid(phaseRange.phase) }}
                      />
                    </>
                  )}
                  <div className={`text-xs font-medium mb-1 flex items-center gap-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {dayNum}
                    {hasNotes && (
                      <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/60" />
                    )}
                  </div>
                  {/* Desktop/tablet: full pills, one session per row */}
                  <div className="hidden md:block space-y-0.5">
                    {sessions.map((session) => {
                      const label = session.dayLabel ?? "Workout";
                      const color = colorFor(label);
                      return (
                        <button
                          key={session.id}
                          onClick={() => setSelectedSession(session)}
                          className="w-full text-left"
                        >
                          <div
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate"
                            style={{ background: color }}
                          >
                            {label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Mobile: dots (capped at 3, +N overflow) - purely decorative, the
                      whole cell is the tap target (see the overlay button below) */}
                  {sessions.length > 0 && (
                    <div className="md:hidden flex flex-wrap items-center gap-1">
                      {sessions.slice(0, 3).map((session) => (
                        <span
                          key={session.id}
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: colorFor(session.dayLabel ?? "Workout") }}
                        />
                      ))}
                      {sessions.length > 3 && (
                        <span className="text-[9px] font-bold text-muted-foreground">+{sessions.length - 3}</span>
                      )}
                    </div>
                  )}
                  {showReviewNudge && (
                    <div className="mt-1 px-1 py-0.5 rounded text-[8px] font-semibold leading-tight text-amber-300 bg-amber-500/10 border border-amber-500/25">
                      Calibration review possible
                    </div>
                  )}
                  {/* Mobile tap target: the dots alone are a ~6px hit area, so the whole
                      cell is the button. Safe to overlay - the desktop session pills are
                      hidden at exactly the widths where this is shown. */}
                  {sessions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openDay(dateStr, sessions)}
                      aria-label={`${dayNum} ${monthName} - ${sessions.length} session${sessions.length === 1 ? "" : "s"}: ${sessions.map((s) => s.dayLabel ?? "Workout").join(", ")}`}
                      data-testid={`day-cell-button-${dateStr}`}
                      className="md:hidden absolute inset-0 rounded-xl transition-colors active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {allLabels.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2">
          {allLabels.map((label) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm" style={{ background: colorFor(label) }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Phase legend - mobile only, since in-cell phase labels are dot-only there */}
      {visiblePhases.size > 0 && (
        <div className="md:hidden flex flex-wrap gap-3 -mt-2">
          {[...visiblePhases].map((phase) => (
            <div key={phase} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: phaseSolid(phase) }} />
              <span className="capitalize">{phaseLabel(phase)} phase</span>
            </div>
          ))}
        </div>
      )}

      {/* Day agenda sheet (mobile) */}
      {dayAgenda && (
        <DayAgendaSheet
          date={dayAgenda.date}
          sessions={dayAgenda.sessions}
          colorFor={colorFor}
          onSelect={(session) => {
            setSelectedSession(session);
            setDayAgenda(null);
          }}
          onClose={() => setDayAgenda(null)}
        />
      )}

      {/* Session modal */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          allWorkouts={workouts}
          colorHex={colorFor(selectedSession.dayLabel ?? "Workout")}
          onClose={() => setSelectedSession(null)}
          closeButtonRef={showCalendarTour ? tourCloseSessionRef : undefined}
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
