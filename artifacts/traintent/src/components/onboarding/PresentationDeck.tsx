import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { Program } from "@workspace/api-client-react";
import { MuscleVolumeChart } from "@/components/onboarding/MuscleVolumeChart";
import { ProgramHighlights } from "@/components/onboarding/ProgramHighlights";
import { SatisfactionGate, type ProgramFeedback } from "@/components/onboarding/SatisfactionGate";
import { formatSplitType } from "@/lib/utils";

type ProgramDay = Program["days"][number];

// Rotating per-day accent, keyed by the day's position in the split so the same
// day is the same color in the schedule strip and the session list.
const DAY_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Which weekdays a program with N training days lands on - rest days spread out
// rather than all bunched at the end. Falls back to the first N weekdays.
const SCHEDULE_SLOTS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function scheduleFor(days: ProgramDay[]): (ProgramDay | null)[] {
  const slots = SCHEDULE_SLOTS[days.length] ?? days.map((_, i) => i);
  const week: (ProgramDay | null)[] = Array(7).fill(null);
  slots.forEach((weekdayIndex, i) => {
    if (days[i]) week[weekdayIndex] = days[i];
  });
  return week;
}

type Phase = { weeks: string; title: string; motive: string; color: string };

// A light, template-driven arc keyed to the user's goal. Not model-generated -
// it frames the long game so week one doesn't feel like the whole plan. Every
// arc opens with a short calibration window (the AI's own shortTermPhase enum
// includes "calibration" for the same reason: the first couple of weeks are
// about learning how this client actually responds, not chasing numbers yet).
function timelineFor(goal: string, goalWeight?: number | null, weightUnit?: string): Phase[] {
  const c = ["#64748b", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981"];
  const unit = weightUnit ?? "kg";
  const goalWeeks = goalWeight != null ? ` · Goal ${goalWeight}${unit}` : "";
  const goalMotive = goalWeight != null ? ` and check in against your goal weight of ${goalWeight}${unit}` : "";
  const byGoal: Record<string, Phase[]> = {
    hypertrophy: [
      { weeks: "Weeks 1–3", title: "Calibration", motive: "We dial in your calories and see how your body responds to training before pushing intensity - this sets the true starting point for everything after.", color: c[0] },
      { weeks: "Weeks 4–7", title: "Foundation", motive: "Groove the main lifts and build the work capacity heavier training will demand.", color: c[1] },
      { weeks: "Weeks 8–15", title: "Growth block", motive: "Progressive overload where it counts - your widest muscle-building window.", color: c[2] },
      { weeks: "Weeks 16–21", title: "Intensify", motive: "Heavier loads and tighter rest turn new size into strength.", color: c[3] },
      { weeks: `Week 22 →${goalWeeks}`, title: "Deload & reassess", motive: `Recover, retest your lifts${goalMotive}, then build the next block on fresh numbers.`, color: c[4] },
    ],
    strength: [
      { weeks: "Weeks 1–3", title: "Calibration", motive: "We dial in your calories and see how your body responds to training before pushing intensity - this sets the true starting point for everything after.", color: c[0] },
      { weeks: "Weeks 4–7", title: "Foundation", motive: "Dial in technique and build a base you can load heavily later.", color: c[1] },
      { weeks: "Weeks 8–15", title: "Build", motive: "Add weight to the bar week over week on your main lifts.", color: c[2] },
      { weeks: "Weeks 16–21", title: "Peak", motive: "Fewer reps, heavier loads - express the strength you've built.", color: c[3] },
      { weeks: `Week 22 →${goalWeeks}`, title: "Deload & reassess", motive: `Back off, retest your maxes${goalMotive}, then start the next cycle.`, color: c[4] },
    ],
    fat_loss: [
      { weeks: "Weeks 1–3", title: "Calibration", motive: "We dial in your calories and see how your body responds to the deficit before pushing intensity - this sets the true starting point for everything after.", color: c[0] },
      { weeks: "Weeks 4–7", title: "Foundation", motive: "Build the habit and work capacity while your calories settle in.", color: c[1] },
      { weeks: "Weeks 8–15", title: "Lean out", motive: "Hold strength while the deficit does its job - protect your muscle.", color: c[2] },
      { weeks: "Weeks 16–21", title: "Refine", motive: "Keep intensity high and tighten up as you near your target.", color: c[3] },
      { weeks: `Week 22 →${goalWeeks}`, title: "Reassess", motive: `Reset, review the numbers${goalMotive}, and plan the next phase.`, color: c[4] },
    ],
    general: [
      { weeks: "Weeks 1–3", title: "Calibration", motive: "We dial in your calories and see how your body responds to training before pushing intensity - this sets the true starting point for everything after.", color: c[0] },
      { weeks: "Weeks 4–7", title: "Foundation", motive: "Build the routine and groove the movements.", color: c[1] },
      { weeks: "Weeks 8–15", title: "Build", motive: "Progress steadily across strength and conditioning.", color: c[2] },
      { weeks: "Weeks 16–21", title: "Challenge", motive: "Push a little harder as the basics become second nature.", color: c[3] },
      { weeks: `Week 22 →${goalWeeks}`, title: "Reassess", motive: `Check in on your goals${goalMotive}, and set up the next block.`, color: c[4] },
    ],
  };
  return byGoal[goal] ?? byGoal.general;
}

// A short narrative sentence weaving the current monitoring parameters
// together, instead of a terse label grid - reads like a coach's note rather
// than a stats readout.
function rightNowSentence(program: Program): string {
  const parts: string[] = [];
  if (program.shortTermPhase) parts.push(`you're in your ${program.shortTermPhase.replace(/_/g, " ")} phase`);
  if (program.energyBalance) parts.push(`eating in a ${program.energyBalance.replace(/_/g, " ")}`);
  let sentence = parts.length ? `Right now, ${parts.join(", ")}.` : "";

  const tail: string[] = [];
  if (program.dailyStepTarget) tail.push(`aim for ${program.dailyStepTarget} daily steps`);
  if (program.cardioIntensity) tail.push(`keep cardio ${program.cardioIntensity.level}`);
  if (tail.length) {
    const [first, second] = tail;
    sentence += ` ${first.charAt(0).toUpperCase()}${first.slice(1)}${second ? `, and ${second}` : ""}.`;
  }
  return sentence;
}

function SessionRow({ day, color }: { day: ProgramDay; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${open ? "border-primary/40" : "border-border"} bg-secondary/20`}
      data-testid={`session-row-${day.dayNumber}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-3 text-left"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-sm font-semibold text-foreground">{day.label}</span>
        <span className="text-xs text-muted-foreground truncate">· {day.focus}</span>
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{day.exercises.length} exercises</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-3 pb-2.5 pl-[30px]"
        >
          {day.exercises.map((ex) => (
            <div
              key={ex.name}
              className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0"
            >
              <span className="text-foreground">{ex.name}</span>
              <span className="text-muted-foreground shrink-0">{ex.sets} × {ex.reps}</span>
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
  onSatisfied,
  onSubmitFeedback,
  isSubmitting,
  showRegenerateNudge,
  error,
}: {
  program: Program;
  goal: string;
  weightUnit?: string;
  onSatisfied: () => void;
  onSubmitFeedback: (feedback: ProgramFeedback) => void;
  isSubmitting?: boolean;
  showRegenerateNudge?: boolean;
  error?: boolean;
}) {
  const [card, setCard] = useState(0);

  useEffect(() => {
    setCard(0);
  }, [program.id, program.generatedAt]);

  const days = program.days;
  const week = scheduleFor(days);
  const phases = timelineFor(goal, program.longTermGoalWeight, weightUnit);

  const cards = ["program", "timeline", "balance", "sessions", "gate"] as const;
  const total = cards.length;
  const isLast = card === total - 1;

  return (
    <div className="w-full max-w-lg">
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setCard(i)}
              aria-label={`Card ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === card ? "w-6 bg-primary" : "w-1.5 bg-secondary"}`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
          {card + 1} / {total}
        </span>
      </div>

      <div className="min-h-[420px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={card}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            className="space-y-5"
          >
            {/* CARD 1 - Program & split */}
            {cards[card] === "program" && (
              <>
                <div className="text-xs font-semibold tracking-wider uppercase text-primary">Your program</div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-3">{program.programName}</h2>
                  <div className="flex flex-wrap gap-2">
                    {program.splitType
                      .split(/[\/,]/)
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .map((part) => formatSplitType(part))
                      .map((part, i) => (
                        <span key={i} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {part}
                        </span>
                      ))}
                  </div>
                </div>
                <ProgramHighlights highlights={program.programHighlights} />
              </>
            )}

            {/* CARD 2 - Timeline */}
            {cards[card] === "timeline" && (
              <>
                <div className="text-xs font-semibold tracking-wider uppercase text-primary">Your journey</div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1">The road to your goal</h2>
                  <p className="text-sm text-muted-foreground">
                    {program.longTermGoalWeight != null
                      ? `You're building toward ${program.longTermGoalWeight}${weightUnit ?? "kg"} - this is a long game, and week one is just the start. Here's how your training gets you there.`
                      : "This is a long game - week one is just the start. Here's how your training evolves."}
                  </p>
                </div>
                <div className="relative pl-7">
                  <div
                    className="absolute left-2 top-2 bottom-2 w-0.5 rounded-full"
                    style={{ background: `linear-gradient(${phases.map((p) => p.color).join(",")})` }}
                  />
                  {phases.map((p, i) => (
                    <div key={p.title} className="relative pb-5 last:pb-0" style={{ color: p.color }}>
                      <span
                        className="absolute -left-[26px] top-1 w-3 h-3 rounded-full border-2 border-background"
                        style={{ background: p.color, boxShadow: `0 0 0 2px ${p.color}` }}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-muted-foreground">{p.weeks}</span>
                        {i === 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-1.5 py-0.5">
                            You are here
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mt-0.5 mb-0.5">{p.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{p.motive}</p>
                    </div>
                  ))}
                </div>
                {(program.shortTermPhase || program.energyBalance || program.cardioIntensity || program.dailyStepTarget) && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/15" data-testid="deck-monitoring">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1.5">Right now</div>
                    <p className="text-xs text-foreground leading-relaxed">{rightNowSentence(program)}</p>
                  </div>
                )}
              </>
            )}

            {/* CARD 3 - Balance & schedule */}
            {cards[card] === "balance" && (
              <>
                <div className="text-xs font-semibold tracking-wider uppercase text-primary">Balance &amp; schedule</div>
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Weekly volume</h3>
                  <MuscleVolumeChart days={days} />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Your week</h3>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd} className="text-center text-[10px] font-medium text-muted-foreground pb-0.5">{wd}</div>
                    ))}
                    {week.map((day, i) => (
                      <div
                        key={i}
                        className="min-h-[52px] rounded-lg border border-border/50 bg-card/50 p-1"
                      >
                        {day && (
                          <div
                            className="text-[8.5px] font-semibold text-white rounded px-1 py-0.5 leading-tight [overflow-wrap:anywhere]"
                            style={{ background: dayColor(day.dayNumber - 1) }}
                          >
                            {day.label}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {days.length} training days a week, with rest spread between them.
                  </p>
                </div>
              </>
            )}

            {/* CARD 4 - Sessions */}
            {cards[card] === "sessions" && (
              <>
                <div className="text-xs font-semibold tracking-wider uppercase text-primary">Your week's sessions</div>
                <p className="text-sm text-muted-foreground">Tap any session to see the full exercise list.</p>
                <div className="space-y-2">
                  {days.map((day) => (
                    <SessionRow key={day.dayNumber} day={day} color={dayColor(day.dayNumber - 1)} />
                  ))}
                </div>
              </>
            )}

            {/* CARD 5 - Gate */}
            {cards[card] === "gate" && (
              <>
                <div className="text-xs font-semibold tracking-wider uppercase text-primary">Ready?</div>
                {error && (
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    Something went wrong regenerating your program. Please try again.
                  </div>
                )}
                <SatisfactionGate
                  onSatisfied={onSatisfied}
                  onSubmitFeedback={onSubmitFeedback}
                  isSubmitting={isSubmitting}
                  showRegenerateNudge={showRegenerateNudge}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setCard((c) => Math.max(0, c - 1))}
          disabled={card === 0}
          className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
          data-testid="deck-back"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {!isLast && (
          <button
            onClick={() => setCard((c) => Math.min(total - 1, c + 1))}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
            data-testid="deck-next"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
