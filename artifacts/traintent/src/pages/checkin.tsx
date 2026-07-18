import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, ChevronRight } from "lucide-react";
import { useSubmitCheckin } from "@workspace/api-client-react";
import { getGetCurrentProgramQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Checkin() {
  const [, setLocation] = useLocation();
  const submitCheckin = useSubmitCheckin();
  const queryClient = useQueryClient();
  const [weekNumber] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  });

  const [energy, setEnergy] = useState(7);
  const [sleep, setSleep] = useState(7);
  const [hungerAppetite, setHungerAppetite] = useState(3);
  const [offDayDeviation, setOffDayDeviation] = useState<boolean | null>(null);
  const [soreness, setSoreness] = useState("");
  const [completion, setCompletion] = useState("");
  const [exerciseIssues, setExerciseIssues] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [didntGoWell, setDidntGoWell] = useState("");
  const [sleepDecline, setSleepDecline] = useState("");
  const [digestionIssues, setDigestionIssues] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ aiMessage: string } | null>(null);

  const canSubmit = !!soreness && !!completion && offDayDeviation !== null;

  async function handleSubmit() {
    if (!canSubmit) return;
    const res = await submitCheckin.mutateAsync({
      data: {
        weekNumber,
        energy,
        sleep,
        hungerAppetite,
        offDayDeviation: offDayDeviation!,
        soreness,
        completion,
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
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
    <div className="p-6 max-w-xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Weekly check-in</h1>
        <p className="text-muted-foreground mt-1">
          Your AI coach uses these answers, alongside everything you logged this week, to reprogram next week's training and nutrition.
        </p>
      </motion.div>

      {/* Recovery */}
      <Section title="Recovery">
        <SliderRow
          testId="question-energy"
          label="Overall energy this week"
          value={energy}
          min={1}
          max={10}
          onChange={setEnergy}
          lowLabel="Drained"
          highLabel="Energised"
          sliderTestId="slider-energy"
        />
        <SliderRow
          testId="question-sleep"
          label="Average sleep quality"
          value={sleep}
          min={1}
          max={10}
          onChange={setSleep}
          lowLabel="Terrible"
          highLabel="Perfect"
          sliderTestId="slider-sleep"
        />
        <div data-testid="question-soreness">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Muscle soreness going into sessions
          </label>
          <ChipRow
            options={["Low", "Moderate", "High"]}
            value={soreness}
            onSelect={setSoreness}
            testIdPrefix="chip-soreness"
          />
        </div>
        <div data-testid="question-sleep-decline">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Was there a decline in sleep duration or quality this week? If so, why?
          </label>
          <textarea
            value={sleepDecline}
            onChange={(e) => setSleepDecline(e.target.value)}
            placeholder="Optional - e.g. late nights, stress, travel..."
            rows={2}
            className={textareaClass}
            data-testid="input-sleep-decline"
          />
        </div>
      </Section>

      {/* Appetite & nutrition */}
      <Section title="Appetite & nutrition">
        <SliderRow
          testId="question-hunger"
          label="Current hunger & appetite"
          value={hungerAppetite}
          min={1}
          max={5}
          onChange={setHungerAppetite}
          lowLabel="No appetite"
          highLabel="Ravenous"
          sliderTestId="slider-hunger"
        />
        <div data-testid="question-offday">
          <label className="text-sm font-semibold text-foreground block mb-1">
            Any off days where you deviated from your calorie intake and did not log it?
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Be honest - if the data isn't reliable, your coach won't change your calories off it.
          </p>
          <div className="flex gap-2">
            {[
              { label: "No", val: false },
              { label: "Yes", val: true },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setOffDayDeviation(o.val)}
                data-testid={`chip-offday-${o.label.toLowerCase()}`}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  offDayDeviation === o.val
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div data-testid="question-digestion">
          <label className="text-sm font-semibold text-foreground block mb-3">Any issues with digestion?</label>
          <textarea
            value={digestionIssues}
            onChange={(e) => setDigestionIssues(e.target.value)}
            placeholder="Optional - bloating, discomfort, etc."
            rows={2}
            className={textareaClass}
            data-testid="input-digestion"
          />
        </div>
      </Section>

      {/* Training */}
      <Section title="Training">
        <div data-testid="question-completion">
          <label className="text-sm font-semibold text-foreground block mb-3">Did you complete all sessions?</label>
          <ChipRow
            options={["Yes", "Mostly", "No"]}
            value={completion}
            onSelect={setCompletion}
            testIdPrefix="chip-completion"
          />
        </div>
        <div data-testid="question-exercise-issues">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Any issues with exercises? (mind-muscle connection, joint or muscle pain)
          </label>
          <textarea
            value={exerciseIssues}
            onChange={(e) => setExerciseIssues(e.target.value)}
            placeholder="Optional - which exercise, and what you felt..."
            rows={2}
            className={textareaClass}
            data-testid="input-exercise-issues"
          />
        </div>
      </Section>

      {/* Reflection */}
      <Section title="Reflection">
        <div data-testid="question-went-well">
          <label className="text-sm font-semibold text-foreground block mb-3">What went well this week?</label>
          <textarea
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            placeholder="Wins worth repeating..."
            rows={2}
            className={textareaClass}
            data-testid="input-went-well"
          />
        </div>
        <div data-testid="question-didnt-go-well">
          <label className="text-sm font-semibold text-foreground block mb-3">
            What did not go well and can be improved?
          </label>
          <textarea
            value={didntGoWell}
            onChange={(e) => setDidntGoWell(e.target.value)}
            placeholder="What you'd like your coach to help resolve..."
            rows={2}
            className={textareaClass}
            data-testid="input-didnt-go-well"
          />
        </div>
        <div data-testid="question-notes">
          <label className="text-sm font-semibold text-foreground block mb-3">Anything else for your AI coach?</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional - anything else that affected your training..."
            rows={2}
            className={textareaClass}
            data-testid="input-checkin-notes"
          />
        </div>
      </Section>

      {submitCheckin.isError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Something went wrong. Please try again.
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitCheckin.isPending}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
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
    </div>
  );
}

const textareaClass =
  "w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      {children}
    </motion.div>
  );
}

function SliderRow({
  testId,
  label,
  value,
  min,
  max,
  onChange,
  lowLabel,
  highLabel,
  sliderTestId,
}: {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
  sliderTestId: string;
}) {
  return (
    <div data-testid={testId}>
      <label className="text-sm font-semibold text-foreground block mb-1">{label}</label>
      <div className="flex items-center gap-4 mt-3">
        <span className="text-3xl font-bold text-primary w-10">{value}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 accent-primary"
          data-testid={sliderTestId}
        />
        <span className="text-xs text-muted-foreground w-4">{max}</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
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
          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
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
