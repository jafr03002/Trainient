import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import {
  useSubmitCheckin,
  useGetCheckinAdherence,
  getGetCurrentProgramQueryKey,
  type SessionAdherence,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
// onboarding's stepsFor(mode) does) keeps the progress bar and "Step N of M"
// correct for free.
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
  const submitCheckin = useSubmitCheckin();
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
  const progress = ((safeStep + 1) / totalSteps) * 100;

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

  async function handleSubmit() {
    const res = await submitCheckin.mutateAsync({
      data: {
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
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
    setResult({ aiMessage: res.aiMessage });
  }

  if (result) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Check-in submitted</h1>
            <p className="text-muted-foreground mt-1">Your AI coach has reviewed your week.</p>
          </div>

          <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-sm font-semibold text-primary mb-2 uppercase tracking-wider">Coach message</p>
            <p className="text-foreground leading-relaxed">{result.aiMessage}</p>
          </div>

          <button
            onClick={() => setLocation("/program")}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            data-testid="button-see-updated-program"
          >
            See updated program
            <ChevronRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="w-full h-1 bg-secondary/40">
        <motion.div
          className="h-full bg-primary"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-xs text-muted-foreground mb-8 font-medium tracking-wider uppercase">
            Step {safeStep + 1} of {totalSteps}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
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
                  <div className="space-y-2">
                    {MISSED_REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setMissedReason(r.value)}
                        data-testid={`radio-missed-${r.value}`}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm text-left transition-all ${
                          missedReason === r.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                            missedReason === r.value ? "border-primary bg-primary" : "border-muted-foreground/60"
                          }`}
                        />
                        {r.label}
                      </button>
                    ))}
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
                  <div className="flex gap-2">
                    {[
                      { label: "No", val: false },
                      { label: "Yes", val: true },
                    ].map((o) => (
                      <button
                        key={o.label}
                        onClick={() => setOffDayDeviation(o.val)}
                        data-testid={`chip-offday-${o.label.toLowerCase()}`}
                        className={`flex-1 py-3.5 rounded-xl border text-sm font-medium transition-all ${
                          offDayDeviation === o.val
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
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
            <div className="mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              Something went wrong. Please try again.
            </div>
          )}

          <div className="flex items-center gap-3 mt-10">
            {safeStep > 0 && (
              <button
                onClick={() => setStep(safeStep - 1)}
                className="h-12 px-5 rounded-xl border border-border text-muted-foreground font-semibold hover:text-foreground transition-colors flex items-center"
                data-testid="button-back"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={submitCheckin.isPending}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-submit-checkin"
              >
                {submitCheckin.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Your AI coach is reviewing your week...
                  </>
                ) : (
                  "Submit check-in"
                )}
              </button>
            ) : (
              <button
                onClick={() => setStep(safeStep + 1)}
                disabled={!canAdvance()}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center disabled:opacity-50"
                data-testid="button-continue"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const textareaClass =
  "w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none";

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
      <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
      {hint && <p className="text-muted-foreground mb-8">{hint}</p>}
      <div className={hint ? "" : "mt-8"}>{children}</div>
    </div>
  );
}

// Five buttons, each carrying its own meaning. Replaces the old 1-10 slider,
// where the two end captions sat under the track and nothing told you what a 7
// was supposed to mean.
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
    <div className="grid grid-cols-5 gap-1.5">
      {labels.map((label, i) => {
        const n = i + 1;
        const selected = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            data-testid={`${testIdPrefix}-${n}`}
            className="text-center min-w-0"
          >
            <div
              className={`rounded-xl border-2 py-3.5 text-xl font-bold transition-all ${
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {n}
            </div>
            <div className={`text-[0.7rem] mt-2 leading-tight break-words ${selected ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              {label}
            </div>
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
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o.toLowerCase())}
          data-testid={`${testIdPrefix}-${o.toLowerCase()}`}
          className={`flex-1 py-3.5 rounded-xl border text-sm font-medium transition-all ${
            value === o.toLowerCase()
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// Read-only: adherence is derived from what was logged, not asked for. The
// server recomputes it on submit, so this is a preview of what the coach sees.
function SessionsSummary({ query }: { query: { isLoading: boolean; data: SessionAdherence | undefined } }) {
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="sessions-loading">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking what you logged...
      </div>
    );
  }
  const a = query.data;
  if (!a) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="sessions-unavailable">
        We couldn't read your training week - your coach will work from your answers alone.
      </p>
    );
  }
  return (
    <div className="p-5 rounded-xl bg-primary/5 border border-primary/20" data-testid="sessions-summary">
      <p className="text-xl font-bold text-foreground">
        You logged <span className="text-primary">{a.loggedSessions} of {a.plannedSessions}</span> sessions
      </p>
      <div className="mt-4 space-y-2">
        {a.loggedDays.map((d) => (
          <div key={`logged-${d.dayNumber}`} className="flex items-center gap-2.5 text-sm">
            <Check className="w-4 h-4 text-primary shrink-0" />
            <span className="min-w-0 break-words">{d.label}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">{d.date}</span>
          </div>
        ))}
        {a.missingDays.map((d) => (
          <div key={`missing-${d.dayNumber}`} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <X className="w-4 h-4 text-destructive shrink-0" />
            <span className="min-w-0 break-words">{d.label}</span>
            <span className="ml-auto text-xs shrink-0">not logged</span>
          </div>
        ))}
      </div>
      {a.extraSessions > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          Plus {a.extraSessions} extra session{a.extraSessions === 1 ? "" : "s"} beyond your program days.
        </p>
      )}
    </div>
  );
}
