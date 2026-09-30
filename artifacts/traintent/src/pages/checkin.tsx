import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import {
  useGetCheckinAdherence,
  getGetCurrentProgramQueryKey,
  type SessionAdherence,
  type CheckinResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  TITLE_CLASS,
  LEDE_CLASS,
  CAPS_CLASS,
  ERROR_TEXT_CLASS,
  PRIMARY_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
  optionCardClass,
} from "@/lib/sessionsForm";
import { useCheckinJob } from "@/hooks/useAiJob";

// One question per screen, mirroring the onboarding flow - the old
// single-screen form asked for a dozen answers at once, which nobody enjoys
// filling in.
type StepKey =
  | "energy"
  | "sleep"
  | "sleepDecline"
  | "soreness"
  | "sessions"
  | "missedReason"
  | "exerciseIssues"
  | "hunger"
  | "offDay"
  | "digestion"
  | "wentWell"
  | "didntGoWell"
  | "notes";

// The missed-session step only exists when the client came up short, so the
// flow is 12 steps on a full week and 13 on a short one. Deriving the list (as
// onboarding's stepsFor(mode) does) keeps the "N of M" count correct for free.
function stepsFor(adherence: SessionAdherence | undefined): StepKey[] {
  const cameUpShort = !!adherence && adherence.loggedSessions < adherence.plannedSessions;
  return [
    "energy",
    "sleep",
    "sleepDecline",
    "soreness",
    "sessions",
    ...(cameUpShort ? (["missedReason"] as StepKey[]) : []),
    "exerciseIssues",
    "hunger",
    "offDay",
    "digestion",
    "wentWell",
    "didntGoWell",
    "notes",
  ];
}

const ENERGY_LABELS = ["Drained", "Low", "OK", "Good", "Great"];
const SLEEP_LABELS = ["Terrible", "Poor", "OK", "Good", "Great"];
const HUNGER_LABELS = ["None", "Low", "Normal", "High", "Ravenous"];

const MISSED_REASONS = [
  { value: "forgot_to_log", label: "I trained it, I just forgot to log it" },
  { value: "time", label: "Skipped - time or life got in the way" },
  { value: "fatigue", label: "Skipped - felt too beat up" },
  { value: "injury", label: "Skipped - injury or pain" },
  { value: "other", label: "Skipped - something else" },
] as const;

export default function Checkin() {
  const [, setLocation] = useLocation();
  const submitCheckin = useCheckinJob();
  const queryClient = useQueryClient();
  // 404s until an AI-generated program exists; the sessions step handles that.
  const adherenceQuery = useGetCheckinAdherence();
  const adherence = adherenceQuery.data;

  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [sleepDecline, setSleepDecline] = useState("");
  const [soreness, setSoreness] = useState("");
  const [missedReason, setMissedReason] = useState("");
  const [exerciseIssues, setExerciseIssues] = useState("");
  const [hungerAppetite, setHungerAppetite] = useState(0);
  const [offDayDeviation, setOffDayDeviation] = useState<boolean | null>(null);
  const [digestionIssues, setDigestionIssues] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [didntGoWell, setDidntGoWell] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ aiMessage: string } | null>(null);

  const steps = stepsFor(adherence);
  // The adherence query resolving can add or drop the missedReason step. Clamp
  // rather than letting `step` point past the end of a now-shorter flow.
  const safeStep = Math.min(step, steps.length - 1);
  const currentStep = steps[safeStep]!;
  const totalSteps = steps.length;
  const isLastStep = safeStep === totalSteps - 1;

  function canAdvance(): boolean {
    switch (currentStep) {
      case "energy": return energy > 0;
      case "sleep": return sleep > 0;
      case "soreness": return !!soreness;
      case "missedReason": return !!missedReason;
      case "hunger": return hungerAppetite > 0;
      case "offDay": return offDayDeviation !== null;
      default: return true;
    }
  }

  // A check-in submitted on an earlier visit that was still being reviewed
  // when the app closed: wait for that one rather than asking the week again.
  const [resuming, setResuming] = useState(submitCheckin.resumable);
  useEffect(() => {
    if (!submitCheckin.resumable) return;
    void finish(submitCheckin.resume()).finally(() => setResuming(false));
    // Mount only: `resumable` is read once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(job: Promise<CheckinResult>) {
    try {
      const res = await job;
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
      setResult({ aiMessage: res.aiMessage });
    } catch {
      // A failure shows in the error banner (submitCheckin.error). Leaving the
      // page mid-review isn't one: the job carries on and resumes next visit.
    }
  }

  async function handleSubmit() {
    await finish(
      submitCheckin.run({
        energy,
        sleep,
        hungerAppetite,
        offDayDeviation: offDayDeviation!,
        soreness,
        // Only meaningful when the missed-session step was shown.
        missedSessionReason: (missedReason || null) as never,
        exerciseIssues: exerciseIssues || null,
        wentWell: wentWell || null,
        didntGoWell: didntGoWell || null,
        sleepDecline: sleepDecline || null,
        digestionIssues: digestionIssues || null,
        notes: notes || null,
      }),
    );
  }

  // The check-in runs full screen (layout.tsx hides the tab bar here), so it
  // carries its own way out.
  const closeButton = (
    <button
      onClick={() => setLocation("/dashboard")}
      aria-label="Close check-in"
      className="grid h-10 w-10 place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      data-testid="button-close-checkin"
    >
      <X className="h-5 w-5" strokeWidth={1.6} />
    </button>
  );

  if (result) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6 pt-6">
          <div>
            <h1 className={TITLE_CLASS}>Check-in submitted</h1>
            <p className={cn(LEDE_CLASS, "mb-0")}>Your AI coach has reviewed your week.</p>
          </div>

          <div className="rounded-[26px] bg-card p-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--sessions-cyan))]">Coach message</div>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground">{result.aiMessage}</p>
          </div>

          <button
            onClick={() => setLocation("/program")}
            className={cn(PRIMARY_BUTTON_CLASS, "w-full")}
            data-testid="button-see-updated-program"
          >
            See updated program
            <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </motion.div>
      </div>
    );
  }

  if (resuming) {
    return (
      <div className="min-h-page flex flex-col items-center justify-center gap-3 px-4 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Your AI coach is reviewing your week...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-page flex-col">
      <div className="flex items-center justify-between px-6 pt-4">
        {closeButton}
        {/* Progress is the caps count only - no bar (see TrainientAppDesign.md). */}
        <div className={CAPS_CLASS}>
          {safeStep + 1} of {totalSteps}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-6 py-10">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === "energy" && (
                <Question title="How was your energy this week?" testId="question-energy">
                  <Scale5 value={energy} onChange={setEnergy} labels={ENERGY_LABELS} testIdPrefix="scale-energy" />
                </Question>
              )}

              {currentStep === "sleep" && (
                <Question title="How was your sleep quality?" testId="question-sleep">
                  <Scale5 value={sleep} onChange={setSleep} labels={SLEEP_LABELS} testIdPrefix="scale-sleep" />
                </Question>
              )}

              {currentStep === "sleepDecline" && (
                <Question
                  title="Was there a decline in sleep duration or quality?"
                  hint="If so, what caused it? Leave blank if nothing changed."
                  testId="question-sleep-decline"
                >
                  <textarea
                    value={sleepDecline}
                    onChange={(e) => setSleepDecline(e.target.value)}
                    placeholder="Late nights, stress, travel..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-sleep-decline"
                  />
                </Question>
              )}

              {currentStep === "soreness" && (
                <Question
                  title="How sore were you going into sessions?"
                  hint="Your coach reads this as the fatigue signal when deciding whether to add or pull back volume."
                  testId="question-soreness"
                >
                  <ChipRow options={["Low", "Moderate", "High"]} value={soreness} onSelect={setSoreness} testIdPrefix="chip-soreness" />
                </Question>
              )}

              {currentStep === "sessions" && (
                <Question title="Your training week" testId="question-sessions">
                  <SessionsSummary query={adherenceQuery} />
                </Question>
              )}

              {currentStep === "missedReason" && adherence && (
                <Question
                  title={
                    adherence.missingDays.length === 1
                      ? `What happened with ${adherence.missingDays[0]!.label}?`
                      : "What happened with the sessions you didn't log?"
                  }
                  hint="If you trained it and just didn't log it, say so - your coach won't cut your training for a logging gap."
                  testId="question-missed-reason"
                >
                  <div className="grid grid-cols-1 gap-2.5">
                    {MISSED_REASONS.map((r) => {
                      const selected = missedReason === r.value;
                      return (
                        <button
                          key={r.value}
                          onClick={() => setMissedReason(r.value)}
                          aria-pressed={selected}
                          data-testid={`radio-missed-${r.value}`}
                          className={cn(optionCardClass(selected), "text-[15px]")}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </Question>
              )}

              {currentStep === "exerciseIssues" && (
                <Question
                  title="Any issues with exercises?"
                  hint="Mind-muscle connection, joint or muscle pain - name the exercise and what you felt."
                  testId="question-exercise-issues"
                >
                  <textarea
                    value={exerciseIssues}
                    onChange={(e) => setExerciseIssues(e.target.value)}
                    placeholder="Which exercise, and what you felt..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-exercise-issues"
                  />
                </Question>
              )}

              {currentStep === "hunger" && (
                <Question title="How was your hunger and appetite?" testId="question-hunger">
                  <Scale5 value={hungerAppetite} onChange={setHungerAppetite} labels={HUNGER_LABELS} testIdPrefix="scale-hunger" />
                </Question>
              )}

              {currentStep === "offDay" && (
                <Question
                  title="Any off days where you deviated from your calories and didn't log it?"
                  hint="Be honest - if the data isn't reliable, your coach won't change your calories off it."
                  testId="question-offday"
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: "No", val: false },
                      { label: "Yes", val: true },
                    ].map((o) => {
                      const selected = offDayDeviation === o.val;
                      return (
                        <button
                          key={o.label}
                          onClick={() => setOffDayDeviation(o.val)}
                          aria-pressed={selected}
                          data-testid={`chip-offday-${o.label.toLowerCase()}`}
                          className={cn(optionCardClass(selected), "text-center text-base font-medium")}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </Question>
              )}

              {currentStep === "digestion" && (
                <Question title="Any issues with digestion?" testId="question-digestion">
                  <textarea
                    value={digestionIssues}
                    onChange={(e) => setDigestionIssues(e.target.value)}
                    placeholder="Bloating, discomfort..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-digestion"
                  />
                </Question>
              )}

              {currentStep === "wentWell" && (
                <Question title="What went well this week?" testId="question-went-well">
                  <textarea
                    value={wentWell}
                    onChange={(e) => setWentWell(e.target.value)}
                    placeholder="Wins worth repeating..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-went-well"
                  />
                </Question>
              )}

              {currentStep === "didntGoWell" && (
                <Question title="What didn't go well, and can be improved?" testId="question-didnt-go-well">
                  <textarea
                    value={didntGoWell}
                    onChange={(e) => setDidntGoWell(e.target.value)}
                    placeholder="What you'd like your coach to help resolve..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-didnt-go-well"
                  />
                </Question>
              )}

              {currentStep === "notes" && (
                <Question title="Anything else for your coach?" testId="question-notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything else that affected your training..."
                    rows={4}
                    className={textareaClass}
                    data-testid="input-checkin-notes"
                  />
                </Question>
              )}
            </motion.div>
          </AnimatePresence>

          {submitCheckin.isError && (
            <p className={cn(ERROR_TEXT_CLASS, "mt-6")}>{submitCheckin.error}</p>
          )}

          <div className="mt-10 flex items-center gap-3">
            {safeStep > 0 && (
              <button
                onClick={() => setStep(safeStep - 1)}
                className={OUTLINE_BUTTON_CLASS}
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={submitCheckin.isPending}
                className={cn(PRIMARY_BUTTON_CLASS, "min-w-0 flex-1 px-5")}
                data-testid="button-submit-checkin"
              >
                {submitCheckin.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span className="truncate">Reviewing your week...</span>
                  </>
                ) : (
                  "Submit check-in"
                )}
              </button>
            ) : (
              <button
                onClick={() => setStep(safeStep + 1)}
                disabled={!canAdvance()}
                className={cn(PRIMARY_BUTTON_CLASS, "flex-1")}
                data-testid="button-continue"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const textareaClass =
  "w-full resize-none rounded-3xl bg-card px-5 py-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40";

function Question({
  title,
  hint,
  testId,
  children,
}: {
  title: string;
  hint?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <h2 className={TITLE_CLASS}>{title}</h2>
      {hint ? <p className={LEDE_CLASS}>{hint}</p> : <div className="mb-8" />}
      {children}
    </div>
  );
}

// Five circles, each carrying its own meaning - filled white once picked.
// Replaces the old 1-10 slider, where the two end captions sat under the track
// and nothing told you what a 7 was supposed to mean.
function Scale5({
  value,
  onChange,
  labels,
  testIdPrefix,
}: {
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const selected = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-pressed={selected}
            aria-label={`${n} - ${label}`}
            data-testid={`${testIdPrefix}-${n}`}
            className="group flex min-w-0 flex-col items-center"
          >
            <span
              className={cn(
                "grid aspect-square w-full max-w-[60px] place-items-center rounded-full text-2xl font-light tabular-nums transition-colors",
                selected ? "bg-white text-black" : "bg-card text-muted-foreground group-hover:bg-secondary group-hover:text-foreground",
              )}
            >
              {n}
            </span>
            <span className={cn("mt-2 break-words text-center text-[11px] leading-tight", selected ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ChipRow({
  options,
  value,
  onSelect,
  testIdPrefix,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {options.map((o) => {
        const selected = value === o.toLowerCase();
        return (
          <button
            key={o}
            onClick={() => onSelect(o.toLowerCase())}
            aria-pressed={selected}
            data-testid={`${testIdPrefix}-${o.toLowerCase()}`}
            className={cn(optionCardClass(selected), "px-2 text-center text-[15px] font-medium")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// Read-only: adherence is derived from what was logged, not asked for. The
// server recomputes it on submit, so this is a preview of what the coach sees.
function SessionsSummary({ query }: { query: { isLoading: boolean; data: SessionAdherence | undefined } }) {
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="sessions-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking what you logged...
      </div>
    );
  }
  const a = query.data;
  if (!a) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="sessions-unavailable">
        We couldn't read your training week - your coach will work from your answers alone.
      </p>
    );
  }
  return (
    <div data-testid="sessions-summary">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-[34px] font-light tracking-[-0.02em] tabular-nums">
          {a.loggedSessions}
          <span className="text-muted-foreground"> / {a.plannedSessions}</span>
        </span>
        <span className={CAPS_CLASS}>sessions logged</span>
      </div>
      {/* Inset grouped list, as on the program page. */}
      <div className="overflow-hidden rounded-[26px] bg-card">
        {a.loggedDays.map((d) => (
          <SummaryRow key={`logged-${d.dayNumber}`} icon={<Check className="h-4 w-4 text-[hsl(var(--sessions-cyan))]" strokeWidth={1.8} />} label={d.label} trailing={d.date ?? ""} />
        ))}
        {a.missingDays.map((d) => (
          <SummaryRow key={`missing-${d.dayNumber}`} icon={<X className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />} label={d.label} trailing="not logged" muted />
        ))}
      </div>
      {a.extraSessions > 0 && (
        <p className="mt-3 ml-1 text-[12.5px] text-muted-foreground">
          Plus {a.extraSessions} extra session{a.extraSessions === 1 ? "" : "s"} beyond your program days.
        </p>
      )}
    </div>
  );
}

function SummaryRow({ icon, label, trailing, muted }: { icon: ReactNode; label: string; trailing: string; muted?: boolean }) {
  return (
    <div className="group flex items-center pl-5">
      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[15px] pr-5 group-last:border-b-0">
        <span className="shrink-0">{icon}</span>
        <span className={cn("min-w-0 flex-1 truncate text-[15px]", muted && "text-muted-foreground")}>{label}</span>
        <span className="whitespace-nowrap text-[13px] text-muted-foreground">{trailing}</span>
      </div>
    </div>
  );
}
