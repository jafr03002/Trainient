import { useEffect, useState } from "react";
import { chipClass } from "@/lib/sessionsForm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type FeedbackCategory =
  | "training_days" | "exercises" | "sets" | "split" | "order"
  | "session_length" | "equipment" | "priority_muscles" | "overall_volume";

export type ProgramFeedback = {
  categories: FeedbackCategory[];
  note: string;
  // Set only when "Training days" is picked. The caller saves it to the profile
  // before regenerating - the generator reads the day count from the profile,
  // so a number left in the note alone would lose to the old value.
  trainingDays?: number;
};

const TRAINING_DAY_OPTIONS = [2, 3, 4, 5, 6];

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

// The "Not quite? Tweak something" sheet on the presentation deck's last page.
// It used to be a whole deck card that swapped its Yes/No buttons for this form,
// which left four primary-looking pills on screen; a bottom sheet keeps the
// deck's own CTA as the only one. Same markup as onboarding's goal-weight sheet.
export function ProgramFeedbackSheet({
  open,
  onClose,
  onSubmitFeedback,
  isSubmitting,
  showRegenerateNudge,
  currentTrainingDays,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitFeedback: (feedback: ProgramFeedback) => void;
  isSubmitting?: boolean;
  showRegenerateNudge?: boolean;
  currentTrainingDays: number;
}) {
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [note, setNote] = useState("");
  const [trainingDays, setTrainingDays] = useState(currentTrainingDays);
  const changingDays = categories.includes("training_days");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isSubmitting) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  function toggleCategory(category: FeedbackCategory) {
    setCategories((c) =>
      c.includes(category) ? c.filter((x) => x !== category) : [...c, category]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-feedback-title"
        className="w-full max-w-lg rounded-t-[30px] bg-card px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        data-testid="feedback-form"
      >
        <div className="mx-auto mb-5 h-[5px] w-[38px] rounded-full bg-accent" aria-hidden="true" />
        <h3 id="program-feedback-title" className="text-[22px] font-normal leading-tight tracking-[-0.01em] text-foreground">
          What would you change?
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          Pick anything that applies, or just leave a note. We'll rebuild it.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              data-testid={`feedback-category-${category}`}
              onClick={() => toggleCategory(category)}
              aria-pressed={categories.includes(category)}
              // the sheet is already bg-card, so unselected chips step up a grey
              className={cn(chipClass(categories.includes(category)), !categories.includes(category) && "bg-secondary")}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>

        {changingDays && (
          <div className="mt-4" data-testid="feedback-training-days">
            <p className="mb-2 text-[13.5px] text-muted-foreground">Days per week</p>
            <div className="flex gap-2">
              {TRAINING_DAY_OPTIONS.map((n) => (
                <button
                  key={n}
                  data-testid={`feedback-training-days-${n}`}
                  onClick={() => setTrainingDays(n)}
                  aria-pressed={trainingDays === n}
                  className={cn(chipClass(trainingDays === n), trainingDays !== n && "bg-secondary")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything specific? (optional)"
          rows={3}
          className="mt-4 w-full resize-none rounded-3xl bg-secondary px-5 py-4 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40"
          data-testid="input-feedback-note"
        />

        {showRegenerateNudge && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Programs improve as you train - consider starting and adjusting from real
            sessions instead of regenerating again.
          </p>
        )}

        <Button
          className="mt-5 h-[52px] w-full text-sm font-semibold uppercase tracking-[0.06em]"
          onClick={() => onSubmitFeedback({ categories, note: note.trim(), ...(changingDays ? { trainingDays } : {}) })}
          disabled={isSubmitting}
          data-testid="button-feedback-submit"
        >
          {isSubmitting ? "Rebuilding…" : "Rebuild my program"}
        </Button>
      </div>
    </div>
  );
}
