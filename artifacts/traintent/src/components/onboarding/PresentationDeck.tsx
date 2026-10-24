import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Flag } from "lucide-react";
import type { Program } from "@workspace/api-client-react";
import { ProgramFeedbackSheet, type ProgramFeedback } from "@/components/onboarding/SatisfactionGate";
import { LetterDock, LetterWash, PageDots, PageHead, Say } from "@/components/onboarding/letter";
import { formatSplitType } from "@/lib/utils";
import { WEEKDAY_LABELS, type StoredSchedule } from "@/lib/programSchedule";
import intentSun from "@/assets/intent-sun.png";

type ProgramDay = Program["days"][number];

// The deck reads as a short letter from the coach (the "Coach's letter"
// direction from the post-generation /lavish review): every page opens with
// one sentence built from the program, facts in white and the connecting words
// in grey. The full storm wash and the Intent sun only bookend it - the letter
// and the "Happy with it?" page - and the pages between get a colourless wash.
const PAGES = ["letter", "program", "journey", "volume", "sessions", "happy"] as const;

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Exercise muscles arrive as the AI wrote them ("Upper Back") or as progress
// keys ("upperBack"), so both the label and the priority match go through one
// normalisation.
const muscleKey = (m: string) => m.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/\s+/g, " ").trim();
const muscleLabel = (m: string) => capitalise(muscleKey(m));

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// This card used to invent its own week from a hardcoded SCHEDULE_SLOTS lookup
// keyed on the day COUNT, which ignored the rest days the client had just been
// asked for and was never persisted - so the schedule shown here was not the one
// they would go on to train. It now renders the real programs.schedule the server
// derived from their stated rest days.
function weekFromSchedule(program: Program, days: ProgramDay[]): (ProgramDay | null)[] {
  const schedule = (program.schedule as StoredSchedule | null) ?? null;
  const byNumber = new Map(days.map((d) => [d.dayNumber, d]));
  if (schedule?.mode === "fixed" && schedule.slots.length === 7) {
    return schedule.slots.map((n) => (n != null ? byNumber.get(n) ?? null : null));
  }
  // A rotating cycle has no fixed week to draw. Generation only ever produces
  // fixed schedules, so this is the unscheduled/legacy fallback: lay the days out
  // in order and let the caption say only how many there are.
  const week: (ProgramDay | null)[] = Array(7).fill(null);
  days.slice(0, 7).forEach((d, i) => { week[i] = d; });
  return week;
}

type Phase = { phase: string; weeks: string; length?: string; title: string; motive: string; deloads?: boolean };

// Mirrors the hard-set per-goal phase sequence the server enforces
// (api-server/src/lib/phaseTemplate.ts's PHASE_TEMPLATES, see
// lib/knowledge/ti-program-generation.md). Kept as a separate, hand-written
// copy rather than a shared import - traintent and api-server are separate
// workspace packages, and this is display-only (the source of truth for
// what phase a client is actually in is program.shortTermPhase).
//
// Calibration is presented as about a week with no week count: most clients
// finish it inside the first week, even though the window can run longer. The
// phases after it are numbered from week 2 to match.
function timelineFor(goal: string): Phase[] {
  const calibration: Phase = { phase: "calibration", weeks: "First", title: "Calibration", motive: "Find your footing while we dial in your calories." };
  const longTermPhase = goal === "gain_weight" || goal === "lose_weight" ? goal : "maintain";
  const byGoal: Record<string, Phase[]> = {
    gain_weight: [
      calibration,
      { phase: "bulk", weeks: "Weeks 2–27", length: "26 wk", title: "Bulk", motive: "A steady surplus to build size.", deloads: true },
    ],
    lose_weight: [
      calibration,
      { phase: "mini_cut", weeks: "Weeks 2–7", length: "6 wk", title: "Mini cut", motive: "A short, sharp push to start the fat loss." },
      { phase: "deload", weeks: "Week 8", length: "1 wk", title: "Deload", motive: "A week at maintenance to recover." },
      { phase: "diet", weeks: "Weeks 9–22", length: "14 wk", title: "Diet", motive: "A steady deficit, all the way down." },
    ],
    maintain: [
      calibration,
      { phase: "maintenance", weeks: "Week 2 →", title: "Maintenance", motive: "Steady training at maintenance until you change your goal." },
    ],
  };
  return byGoal[longTermPhase]!;
}

const GOAL_WEEK: Record<string, number> = { gain_weight: 27, lose_weight: 22 };

// Deload during a bulk is a display-only overlay on the bulk segment (see
// phaseTemplate.ts's effectivePhase), not its own timeline row - so a
// reported "deload" phase should still highlight the bulk row for that goal.
function isCurrentPhase(phase: string, shortTermPhase: string | null | undefined, goal: string): boolean {
  if (!shortTermPhase) return false;
  if (shortTermPhase === "deload" && goal === "gain_weight") return phase === "bulk";
  return phase === shortTermPhase;
}

function computeWeeklyVolume(days: ProgramDay[]): { muscle: string; sets: number }[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const ex of day.exercises) {
      // Checklist items carry no muscle and their `sets` is a round count, not
      // training volume - including them would add an empty-labelled row.
      if (ex.kind === "checklist" || !ex.muscle) continue;
      const key = muscleKey(ex.muscle);
      totals.set(key, (totals.get(key) ?? 0) + ex.sets);
    }
  }
  return Array.from(totals.entries())
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

function SessionRow({ day }: { day: ProgramDay }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border py-4 last:border-b-0" data-testid={`session-row-${day.dayNumber}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full min-w-0 items-baseline gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[21px] font-light tracking-[-0.01em] text-foreground">{day.label}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{day.focus}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground">{day.exercises.length} exercises</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-0.5">
          {day.exercises.map((ex) => (
            <div key={ex.name} className="flex items-center justify-between gap-3 py-1 text-[13.5px]">
              <span className="min-w-0 truncate text-foreground/85">{ex.name}</span>
              <span className="whitespace-nowrap text-muted-foreground">{ex.sets} × {ex.reps}</span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function PresentationDeck({
  program,
  goal,
  weightUnit,
  name,
  priorityMuscles = [],
  onSatisfied,
  onSubmitFeedback,
  isSubmitting,
  showRegenerateNudge,
  error,
}: {
  program: Program;
  goal: string;
  weightUnit?: string;
  name?: string;
  priorityMuscles?: string[];
  onSatisfied: () => void;
  onSubmitFeedback: (feedback: ProgramFeedback) => void;
  isSubmitting?: boolean;
  showRegenerateNudge?: boolean;
  error?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [tweaking, setTweaking] = useState(false);

  useEffect(() => {
    setPage(0);
    setTweaking(false);
  }, [program.id, program.generatedAt]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const days = program.days;
  const unit = weightUnit ?? "kg";
  const goalWeight = program.longTermGoalWeight;
  const week = weekFromSchedule(program, days);
  const isRealSchedule = (program.schedule as StoredSchedule | null)?.mode === "fixed";
  const phases = timelineFor(goal);
  const currentIndex = Math.max(0, phases.findIndex((p) => isCurrentPhase(p.phase, program.shortTermPhase, goal)));

  const focus = priorityMuscles.filter((m) => m !== "No preference");
  const focusKeys = new Set(focus.map(muscleKey));
  const focusText = joinWithAnd(focus.map((m) => muscleKey(m)));
  const split = program.splitType
    .split(/[\/,]/)
    .map((part) => formatSplitType(part.trim()).toLowerCase())
    .filter(Boolean)
    .join(" / ");

  const volume = computeWeeklyVolume(days);
  const totalSets = volume.reduce((sum, v) => sum + v.sets, 0);
  const maxSets = Math.max(1, ...volume.map((v) => v.sets));
  const durations = days.map((d) => d.estimatedDurationMinutes).filter((m): m is number => m != null);
  const avgMinutes = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const durationText = avgMinutes == null ? null : avgMinutes >= 50 && avgMinutes <= 70 ? "an hour" : `${Math.round(avgMinutes / 5) * 5} minutes`;

  const highlights = program.programHighlights.filter((h) => !/calibrat/i.test(`${h.title} ${h.detail}`));

  const current = PAGES[page];
  const isLast = page === PAGES.length - 1;
  const bookend = current === "letter" || current === "happy";
  const longTerm = goal === "gain_weight" ? "bulk" : goal === "lose_weight" ? "cut" : null;

  return (
    <div className="relative min-h-page w-full bg-background text-foreground">
      <LetterWash bookend={bookend} />

      <div className="relative mx-auto flex max-w-lg justify-end px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <PageDots count={PAGES.length} index={page} onSelect={setPage} />
      </div>

      <div className="relative mx-auto max-w-lg px-6 pb-44 pt-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
          >
            {current === "letter" && (
              <div className="pt-16" data-testid="deck-letter">
                <img src={intentSun} alt="" className="h-12 w-12" />
                <Say className="mt-6 text-[32px] leading-[1.2]">
                  <b>{name ? `${name}, your plan is ready.` : "Your plan is ready."}</b>
                </Say>
                <Say className="mt-4 text-[22px] leading-[1.38]">
                  <b>{capitalise(numberWord(days.length))} days a week</b>, {split}.{" "}
                  {longTerm ? (
                    <>
                      You're heading into a <b>{longTerm}{goalWeight != null ? ` toward ${goalWeight} ${unit}` : ""}</b>
                    </>
                  ) : (
                    <>You'll train at <b>maintenance</b></>
                  )}
                  {focus.length ? (
                    <>, with extra focus on your <b>{focusText}</b>.</>
                  ) : (
                    "."
                  )}
                </Say>
              </div>
            )}

            {current === "program" && (
              <>
                <PageHead title="Program">
                  {focus.length ? (
                    <>Built around your <b>{focusText}</b>, on the <b>{numberWord(days.length)} days</b> you have.</>
                  ) : (
                    <>Built for the <b>{numberWord(days.length)} days</b> you have.</>
                  )}
                </PageHead>
                <div className="mt-6 text-[19px] font-light text-muted-foreground">{program.programName}</div>
                <div className="mt-3 space-y-2" data-testid="list-program-highlights">
                  {focus.length > 0 && (
                    <div className="rounded-3xl bg-card px-5 py-4">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--sessions-cyan))]">Your focus</div>
                      <h3 className="text-[15px] font-normal text-foreground">{capitalise(joinWithAnd(focus.map(muscleKey)))} come first</h3>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">They get extra sets every week, so they grow ahead of the rest.</p>
                    </div>
                  )}
                  {highlights.map((h) => (
                    <div key={h.title} className="rounded-3xl bg-card px-5 py-4">
                      <h3 className="text-[15px] font-normal text-foreground">{h.title}</h3>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{h.detail}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {current === "journey" && (
              <>
                <PageHead title="Your journey">
                  Start with <b>a week of calibration</b>,{" "}
                  {goal === "gain_weight" ? (
                    goalWeight != null ? <>then a <b>bulk</b> all the way to <b>{goalWeight} {unit}</b>.</> : <>then a <b>bulk</b> to build size.</>
                  ) : goal === "lose_weight" ? (
                    goalWeight != null ? <>then <b>step by step</b> down to <b>{goalWeight} {unit}</b>.</> : <>then <b>step by step</b> down.</>
                  ) : (
                    <>then <b>steady training</b> at maintenance.</>
                  )}
                </PageHead>
                <div className="mt-8" data-testid="deck-timeline">
                  {phases.map((p, i) => {
                    const now = i === currentIndex;
                    return (
                      <div key={p.phase} className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-x-3.5">
                        <div className="relative flex justify-center">
                          <span
                            className={`absolute left-1/2 top-[22px] -bottom-1.5 w-0.5 -translate-x-1/2 ${
                              now
                                ? "bg-gradient-to-b from-white to-white/15"
                                : "bg-[repeating-linear-gradient(to_bottom,hsl(var(--accent))_0_5px,transparent_5px_10px)]"
                            }`}
                          />
                          {now ? (
                            <span className="relative mt-px h-[18px] w-[18px] rounded-full bg-white shadow-[0_0_0_4px_hsl(var(--background)),0_0_0_5px_rgb(255_255_255/0.35),0_0_0_10px_hsl(var(--background)),0_0_0_11px_rgb(255_255_255/0.12)]" />
                          ) : (
                            <span className="relative mt-1 h-3 w-3 rounded-full border-2 border-muted-foreground/60 bg-background" />
                          )}
                        </div>
                        <div className="min-w-0 pb-6">
                          <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                            <span>{p.weeks}</span>
                            {p.length && (
                              <span className={`rounded-full px-2.5 py-0.5 text-[12px] normal-case tracking-normal ${now ? "bg-white text-black" : "bg-card"}`}>
                                {p.length}
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1 text-[19px] font-normal text-foreground">{p.title}</h3>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.motive}</p>
                          {now && (
                            <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--sessions-cyan))]">You start here</div>
                          )}
                          {p.deloads && (
                            <>
                              <div className="mt-2.5 flex items-center gap-1" aria-hidden>
                                {[0, 1, 2, 3, 4, 5, 6].map((t) => (
                                  <span key={t} className={`h-[3px] rounded-full ${t % 2 ? "w-2 bg-muted-foreground" : "flex-1 bg-secondary"}`} />
                                ))}
                              </div>
                              <div className="mt-1.5 text-[11px] text-muted-foreground/80">Deload week every 8 weeks</div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {goalWeight != null && GOAL_WEEK[goal] && (
                    <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-3.5">
                      <span className="grid h-[30px] w-[30px] place-items-center rounded-full border-[1.5px] border-white">
                        <Flag className="h-3.5 w-3.5 text-white" strokeWidth={2} />
                      </span>
                      <div>
                        <div className="text-[30px] font-extralight leading-none tracking-[-0.02em]">{goalWeight} {unit}</div>
                        <div className="mt-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Goal · week {GOAL_WEEK[goal]}</div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {current === "volume" && (
              <>
                <PageHead title="Volume">
                  {focus.length ? (
                    <><b>{totalSets} hard sets</b> a week, with extra for your <b>{focusText}</b>.</>
                  ) : (
                    <><b>{totalSets} hard sets</b> a week, spread across every muscle.</>
                  )}
                </PageHead>
                <div className="mt-5" data-testid="chart-muscle-volume-onboarding">
                  {volume.map(({ muscle, sets }) => {
                    const prioritised = focusKeys.has(muscle);
                    return (
                      <div key={muscle} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                        <span className={`w-[104px] shrink-0 truncate text-[13.5px] ${prioritised ? "text-foreground" : "text-foreground/80"}`}>
                          {muscleLabel(muscle)}
                          {prioritised && <span className="text-[hsl(var(--sessions-cyan))]"> ·</span>}
                        </span>
                        <span className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-card">
                          <span
                            className={`block h-full rounded-full ${prioritised ? "bg-white" : "bg-muted-foreground"}`}
                            style={{ width: `${(sets / maxSets) * 100}%` }}
                          />
                        </span>
                        <span className="w-6 shrink-0 text-right text-[13px] text-muted-foreground">{sets}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-7 mb-2.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Your week</div>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_LABELS.map((wd) => (
                    <div key={wd} className="pb-0.5 text-center text-[10px] font-medium text-muted-foreground">{wd}</div>
                  ))}
                  {week.map((day, i) =>
                    day ? (
                      <div key={i} className="min-h-[56px] min-w-0 rounded-xl bg-card px-1 py-1.5">
                        <div className="break-words text-[9.5px] font-medium leading-tight text-foreground">{day.label}</div>
                      </div>
                    ) : (
                      <div key={i} className="min-h-[56px] rounded-xl border border-border" />
                    ),
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {isRealSchedule
                    ? `${days.length} training days a week, on the days you kept free.`
                    : `${days.length} training days a week, with rest spread between them.`}
                </p>
              </>
            )}

            {current === "sessions" && (
              <>
                <PageHead title="Sessions">
                  <b>{capitalise(numberWord(days.length))} sessions</b>
                  {durationText ? <>, about <b>{durationText}</b> each.</> : "."}
                </PageHead>
                <div className="mt-5">
                  {days.map((day) => (
                    <SessionRow key={day.dayNumber} day={day} />
                  ))}
                </div>
              </>
            )}

            {current === "happy" && (
              <div className="pt-16" data-testid="satisfaction-gate">
                <img src={intentSun} alt="" className="h-16 w-16" />
                <Say className="mt-6 text-[32px] leading-[1.2]"><b>Happy with it?</b></Say>
                <Say className="mt-4 text-[20px] leading-[1.4]">
                  You can change anything before you start. Once you're training, I'll adjust it from your real sessions.
                </Say>
                {error && (
                  <div className="mt-6 rounded-[22px] bg-card px-4 py-3.5 text-[13px] text-destructive">
                    Something went wrong rebuilding your program. Please try again.
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <LetterDock
        label={current === "letter" ? "Show me" : isLast ? "Yes, let's go" : "Next"}
        onNext={() => (isLast ? onSatisfied() : setPage((p) => Math.min(PAGES.length - 1, p + 1)))}
        onBack={page > 0 ? () => setPage((p) => Math.max(0, p - 1)) : undefined}
        disabled={isLast && isSubmitting}
        nextTestId={isLast ? "button-satisfied-yes" : "deck-next"}
        backTestId="deck-back"
      >
        {isLast && (
          <p className="mt-3.5 text-center text-[13px] text-muted-foreground">
            Not quite?{" "}
            <button
              onClick={() => setTweaking(true)}
              className="text-foreground underline underline-offset-[3px]"
              data-testid="button-satisfied-no"
            >
              Tweak something
            </button>
          </p>
        )}
      </LetterDock>

      <ProgramFeedbackSheet
        open={tweaking}
        onClose={() => setTweaking(false)}
        onSubmitFeedback={onSubmitFeedback}
        isSubmitting={isSubmitting}
        showRegenerateNudge={showRegenerateNudge}
        currentTrainingDays={days.length}
      />
    </div>
  );
}
