import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
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
  const [soreness, setSoreness] = useState("");
  const [completion, setCompletion] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ aiMessage: string } | null>(null);

  async function handleSubmit() {
    if (!soreness || !completion) return;
    const res = await submitCheckin.mutateAsync({
      data: { weekNumber, energy, sleep, soreness, completion, notes: notes || null },
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
        <p className="text-muted-foreground mt-1">5 questions. Your AI coach uses these to adjust next week's program.</p>
      </motion.div>

      <div className="space-y-8">
        {/* Q1 Energy */}
        <div data-testid="question-energy">
          <label className="text-sm font-semibold text-foreground block mb-1">
            Q1 — Overall energy this week
          </label>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-3xl font-bold text-primary w-10">{energy}</span>
            <input
              type="range" min={1} max={10} value={energy}
              onChange={(e) => setEnergy(parseInt(e.target.value))}
              className="flex-1 accent-primary"
              data-testid="slider-energy"
            />
            <span className="text-xs text-muted-foreground w-4">10</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Drained</span><span>Energised</span>
          </div>
        </div>

        {/* Q2 Sleep */}
        <div data-testid="question-sleep">
          <label className="text-sm font-semibold text-foreground block mb-1">
            Q2 — Average sleep quality
          </label>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-3xl font-bold text-primary w-10">{sleep}</span>
            <input
              type="range" min={1} max={10} value={sleep}
              onChange={(e) => setSleep(parseInt(e.target.value))}
              className="flex-1 accent-primary"
              data-testid="slider-sleep"
            />
            <span className="text-xs text-muted-foreground w-4">10</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Terrible</span><span>Perfect</span>
          </div>
        </div>

        {/* Q3 Soreness */}
        <div data-testid="question-soreness">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Q3 — Muscle soreness going into sessions
          </label>
          <div className="flex gap-2">
            {["Low", "Moderate", "High"].map((s) => (
              <button
                key={s}
                onClick={() => setSoreness(s.toLowerCase())}
                data-testid={`chip-soreness-${s.toLowerCase()}`}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  soreness === s.toLowerCase()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Q4 Completion */}
        <div data-testid="question-completion">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Q4 — Did you complete all sessions?
          </label>
          <div className="flex gap-2">
            {["Yes", "Mostly", "No"].map((c) => (
              <button
                key={c}
                onClick={() => setCompletion(c.toLowerCase())}
                data-testid={`chip-completion-${c.toLowerCase()}`}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  completion === c.toLowerCase()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Q5 Notes */}
        <div data-testid="question-notes">
          <label className="text-sm font-semibold text-foreground block mb-3">
            Q5 — Any notes for your AI coach?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — mention anything that affected your training..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            data-testid="input-checkin-notes"
          />
        </div>
      </div>

      {submitCheckin.isError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Something went wrong. Please try again.
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!soreness || !completion || submitCheckin.isPending}
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
