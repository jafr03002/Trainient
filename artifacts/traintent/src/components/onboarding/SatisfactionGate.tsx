import { useState } from "react";
import { chipClass } from "@/lib/sessionsForm";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FeedbackCategory =
  | "training_days" | "exercises" | "sets" | "split" | "order"
  | "session_length" | "equipment" | "priority_muscles" | "overall_volume";

export type ProgramFeedback = {
  categories: FeedbackCategory[];
  note: string;
};

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  training_days: "Training days",
  exercises: "Exercises",
  sets: "Sets",
  split: "Split",
  order: "Exercise order",
  session_length: "Session length",
  equipment: "Equipment",
  priority_muscles: "Priority muscles",
  overall_volume: "Overall volume",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeedbackCategory[];

export function SatisfactionGate({
  onSatisfied,
  onSubmitFeedback,
  isSubmitting,
  showRegenerateNudge,
}: {
  onSatisfied: () => void;
  onSubmitFeedback: (feedback: ProgramFeedback) => void;
  isSubmitting?: boolean;
  showRegenerateNudge?: boolean;
}) {
  const [askingWhy, setAskingWhy] = useState(false);
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [note, setNote] = useState("");

  function toggleCategory(category: FeedbackCategory) {
    setCategories((c) =>
      c.includes(category) ? c.filter((x) => x !== category) : [...c, category]
    );
  }

  function handleSubmit() {
    onSubmitFeedback({ categories, note: note.trim() });
  }

  if (!askingWhy) {
    return (
      <div data-testid="satisfaction-gate">
        <h2 className="text-[21px] font-light tracking-[-0.01em] text-foreground mb-2">Happy with this program?</h2>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-6">
          You can tweak anything before you get started.
        </p>
        <div className="flex gap-3">
          <Button
            className="flex-1 h-[52px]"
            onClick={onSatisfied}
            data-testid="button-satisfied-yes"
          >
            <ThumbsUp className="w-4 h-4 mr-2" />
            Yes, let's go
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-[52px]"
            onClick={() => setAskingWhy(true)}
            data-testid="button-satisfied-no"
          >
            <ThumbsDown className="w-4 h-4 mr-2" />
            Not quite
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="feedback"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        data-testid="feedback-form"
      >
        <h2 className="text-[21px] font-light tracking-[-0.01em] text-foreground mb-2">What would you change?</h2>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-6">
          Pick anything that applies, or just leave a note.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              data-testid={`feedback-category-${category}`}
              onClick={() => toggleCategory(category)}
              aria-pressed={categories.includes(category)}
              className={chipClass(categories.includes(category))}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything specific? (optional)"
          rows={3}
          className="w-full px-5 py-4 rounded-3xl bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40 resize-none mb-4"
          data-testid="input-feedback-note"
        />

        {showRegenerateNudge && (
          <div className="px-4 py-3.5 rounded-[22px] bg-card text-[12.5px] leading-relaxed text-muted-foreground mb-4">
            Programs improve as you train - consider starting and adjusting from real
            sessions instead of regenerating again.
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-[52px]"
            onClick={() => setAskingWhy(false)}
            disabled={isSubmitting}
            data-testid="button-feedback-back"
          >
            Back
          </Button>
          <Button
            className="flex-1 h-[52px]"
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-testid="button-feedback-submit"
          >
            {isSubmitting ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
