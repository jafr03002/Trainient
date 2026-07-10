import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Brain, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProfile, useGenerateProgram, useGetProfile, type Program, type UserProfileInputInjurySeverity } from "@workspace/api-client-react";
import { MUSCLE_OPTIONS } from "@/lib/muscles";
import { GeneratingScreen } from "@/components/onboarding/GeneratingScreen";
import { PresentationDeck } from "@/components/onboarding/PresentationDeck";
import { type ProgramFeedback } from "@/components/onboarding/SatisfactionGate";
import { toast } from "@/hooks/use-toast";

const GOALS = [
  { value: "gain_weight", label: "Gain weight", sub: "Build muscle in a surplus" },
  { value: "lose_weight", label: "Lose weight", sub: "Lean out while keeping muscle" },
  { value: "general", label: "General fitness", sub: "Overall health & consistency" },
];

// Goals that ask for a long-term target weight (via a popup on selection).
const WEIGHT_GOALS = new Set(["gain_weight", "lose_weight"]);

// Older profiles stored these slugs; alias them so review/label lookups still resolve.
const LEGACY_GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Build muscle",
  strength: "Get stronger",
  fat_loss: "Lose fat & get lean",
};

function goalLabel(value: string): string | undefined {
  return GOALS.find((g) => g.value === value)?.label ?? LEGACY_GOAL_LABELS[value];
}

const ACTIVITY = [
  { value: "low", label: "Low", sub: "Fewer than 6,000 steps a day" },
  { value: "moderate", label: "Moderate", sub: "6,000 – 9,999 steps a day" },
  { value: "high", label: "High", sub: "10,000 – 12,500+ steps a day" },
];

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const INJURY_SEVERITY = [
  { value: "low", label: "Low", sub: "Mild discomfort - doesn't stop you training as normal" },
  { value: "medium", label: "Medium", sub: "Noticeable pain - some movements need to be avoided or modified" },
  { value: "high", label: "High", sub: "Significant pain or limitation - needs major changes, possibly medical clearance" },
];

const EXPERIENCE = [
  { value: "beginner", label: "Beginner", sub: "Under 1 year or returning after a long break" },
  { value: "intermediate", label: "Intermediate", sub: "1–3 years consistent training" },
  { value: "advanced", label: "Advanced", sub: "3+ years consistent training" },
];

const EQUIPMENT = [
  "Full gym", "Dumbbells only", "Barbell & rack", "Cable machines",
  "Smith machine", "Resistance bands", "Pull-up bar", "Home gym", "No equipment",
];

const MUSCLES = [...MUSCLE_OPTIONS, "No preference"];

// Everyone gets mode + the profile basics also editable later in Settings
// (name, age, weight). Everything else is AI-coaching input - it's only
// meaningful when the AI is the one building/adjusting your program, so
// Independent mode skips straight to the review step.
type StepKey =
  | "mode" | "name" | "bodyStats"
  | "goal" | "experience" | "activity" | "trainingDays" | "preferredRestDays" | "equipment" | "details" | "priorityMuscles"
  | "review";

function stepsFor(mode: string): StepKey[] {
  const base: StepKey[] = ["mode", "name", "bodyStats"];
  if (mode === "ai") {
    return [...base, "goal", "experience", "activity", "trainingDays", "preferredRestDays", "equipment", "details", "priorityMuscles", "review"];
  }
  return [...base, "review"];
}

type FormState = {
  mode: string;
  name: string;
  goal: string;
  goalWeight: string;
  experience: string;
  activityLevel: string;
  trainingDays: number;
  preferredRestDays: string[];
  equipment: string[];
  age: string;
  sex: string;
  weight: string;
  weightUnit: string;
  injuries: string;
  injurySeverity: string;
  priorityMuscles: string[];
};

const INITIAL: FormState = {
  mode: "",
  name: "",
  goal: "",
  goalWeight: "",
  experience: "",
  activityLevel: "",
  trainingDays: 4,
  preferredRestDays: [],
  equipment: [],
  age: "",
  sex: "",
  weight: "",
  weightUnit: "kg",
  injuries: "",
  injurySeverity: "",
  priorityMuscles: [],
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [showGoalWeight, setShowGoalWeight] = useState(false);
  const [phase, setPhase] = useState<"form" | "generating" | "presentation">("form");
  const [program, setProgram] = useState<Program | null>(null);
  const [regenerateCount, setRegenerateCount] = useState(0);
  // Tracks which review-step button was clicked so only that one shows a
  // spinner - both call the same createProfile mutation, so isPending alone
  // can't tell them apart.
  const [finishAction, setFinishAction] = useState<"generate" | "later" | null>(null);
  const [, setLocation] = useLocation();
  const createProfile = useCreateProfile();
  const generateProgram = useGenerateProgram();
  const profileQuery = useGetProfile();

  // A profile that's in AI mode but missing goal/experience means AI
  // coaching was never set up - either the user onboarded through
  // Independent mode (which skips those questions entirely) and later
  // switched modes in Settings, or a previous AI setup attempt didn't
  // finish. Either way, mode/name/bodyStats are already saved, so resume
  // straight into the AI-only questions instead of re-asking for them.
  const resumeInitRef = useRef(false);
  useEffect(() => {
    if (resumeInitRef.current || profileQuery.isLoading) return;
    resumeInitRef.current = true;
    const profile = profileQuery.data;
    if (!profile || profile.mode !== "ai" || (profile.goal && profile.experience)) return;

    setForm((f) => ({
      ...f,
      mode: "ai",
      name: profile.name ?? "",
      age: profile.age != null ? String(profile.age) : "",
      sex: profile.sex ?? "",
      weight: profile.weight != null ? String(profile.weight) : "",
      weightUnit: profile.weightUnit ?? "kg",
    }));
    setStep(stepsFor("ai").indexOf("goal"));
  }, [profileQuery.isLoading, profileQuery.data]);

  // Recomputed from form.mode on every render - switching modes (only
  // possible while on the first step) never clears already-entered fields,
  // it just changes which steps are shown, so going back to Independent
  // after filling in AI questions (or vice versa) keeps everything intact.
  const steps = stepsFor(form.mode);
  const currentStep = steps[step];
  const totalSteps = steps.length;
  const progress = ((step + 1) / totalSteps) * 100;

  // A user may keep at most (7 - trainingDays + 1) days free: the strict number
  // of off-days plus one day of scheduling slack. More than that can't be
  // programmed around their committed days.
  const maxPreferredRestDays = 7 - form.trainingDays + 1;
  const tooManyPreferredRestDays = form.preferredRestDays.length > maxPreferredRestDays;

  function canAdvance() {
    switch (currentStep) {
      case "mode": return !!form.mode;
      case "goal": return !!form.goal;
      case "experience": return !!form.experience;
      case "preferredRestDays": return !tooManyPreferredRestDays;
      case "equipment": return form.equipment.length > 0;
      default: return true;
    }
  }

  // Selecting a weight goal opens the target-weight popup; picking General
  // fitness clears any previously entered target.
  function selectGoal(value: string) {
    setForm((f) => ({ ...f, goal: value, goalWeight: WEIGHT_GOALS.has(value) ? f.goalWeight : "" }));
    if (WEIGHT_GOALS.has(value)) setShowGoalWeight(true);
  }

  function togglePreferredRestDay(value: string) {
    setForm((f) => ({
      ...f,
      preferredRestDays: f.preferredRestDays.includes(value)
        ? f.preferredRestDays.filter((d) => d !== value)
        : [...f.preferredRestDays, value],
    }));
  }

  function toggleEquipment(item: string) {
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(item)
        ? f.equipment.filter((e) => e !== item)
        : [...f.equipment, item],
    }));
  }

  function toggleMuscle(item: string) {
    setForm((f) => {
      if (item === "No preference") return { ...f, priorityMuscles: ["No preference"] };
      const filtered = f.priorityMuscles.filter((m) => m !== "No preference");
      if (filtered.includes(item)) {
        return { ...f, priorityMuscles: filtered.filter((m) => m !== item) };
      }
      if (filtered.length >= 3) return f;
      return { ...f, priorityMuscles: [...filtered, item] };
    });
  }

  // `generateNow` only matters in AI mode - Independent mode never generates
  // here regardless, it always lands on /dashboard and builds a program later
  // from /program's own empty state.
  async function handleFinish(generateNow: boolean) {
    try {
      await createProfile.mutateAsync({
        data: {
          mode: form.mode,
          name: form.name || undefined,
          goal: form.goal,
          goalWeight: form.goalWeight ? parseFloat(form.goalWeight) : undefined,
          experience: form.experience,
          activityLevel: form.activityLevel || undefined,
          trainingDays: form.trainingDays,
          preferredRestDays: form.preferredRestDays,
          equipment: form.equipment,
          age: form.age ? parseInt(form.age) : undefined,
          sex: form.sex || undefined,
          weight: form.weight ? parseFloat(form.weight) : undefined,
          weightUnit: form.weightUnit,
          injuries: form.injuries || undefined,
          injurySeverity: form.injuries ? (form.injurySeverity || undefined) as UserProfileInputInjurySeverity | undefined : undefined,
          priorityMuscles: form.priorityMuscles,
        },
      });

      if (form.mode === "ai" && generateNow) {
        setPhase("generating");
        const result = await generateProgram.mutateAsync({});
        setProgram(result);
        setPhase("presentation");
      } else {
        if (form.mode === "ai") {
          toast({
            title: "Profile saved",
            description: "You can generate your program any time from My Program.",
          });
        }
        setLocation("/dashboard");
      }
    } catch {
      setPhase("form");
      setFinishAction(null);
    }
  }

  async function handleRegenerateFeedback(feedback: ProgramFeedback) {
    setPhase("generating");
    setRegenerateCount((c) => c + 1);
    try {
      const result = await generateProgram.mutateAsync({ data: { feedback } });
      setProgram(result);
    } catch {
      // keep the previous program on screen; the error banner below reports it
    }
    setPhase("presentation");
  }

  const isPending = createProfile.isPending || generateProgram.isPending;
  const isLastStep = step === totalSteps - 1;

  const variants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  const selectedMuscleCount = form.priorityMuscles.filter((m) => m !== "No preference").length;

  if (phase === "generating") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <GeneratingScreen />
        </div>
      </div>
    );
  }

  if (phase === "presentation" && program) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center px-4 py-12">
          <PresentationDeck
            program={program}
            goal={form.goal}
            weightUnit={form.weightUnit}
            onSatisfied={() => setLocation("/dashboard")}
            onSubmitFeedback={handleRegenerateFeedback}
            isSubmitting={generateProgram.isPending}
            showRegenerateNudge={regenerateCount >= 3}
            error={generateProgram.isError}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showGoalWeight && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60"
          onClick={() => setShowGoalWeight(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-primary/40 bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground mb-1">What weight do you want to reach?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Saved as your long-term goal weight
              {form.weight ? ` (now: ${form.weight} ${form.weightUnit})` : ""}. You can skip this.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                autoFocus
                value={form.goalWeight}
                onChange={(e) => setForm((f) => ({ ...f, goalWeight: e.target.value }))}
                placeholder={`Target ${form.weightUnit}`}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                data-testid="input-goal-weight"
              />
              <div className="flex rounded-xl border border-border overflow-hidden">
                {["kg", "lbs"].map((u) => (
                  <button
                    key={u}
                    data-testid={`goal-weight-unit-${u}`}
                    onClick={() => setForm((f) => ({ ...f, weightUnit: u }))}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      form.weightUnit === u
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => { setForm((f) => ({ ...f, goalWeight: "" })); setShowGoalWeight(false); }}
                data-testid="button-skip-goal-weight"
              >
                Skip
              </Button>
              <Button
                className="flex-1 h-11"
                onClick={() => setShowGoalWeight(false)}
                data-testid="button-save-goal-weight"
              >
                Save target
              </Button>
            </div>
          </div>
        </div>
      )}
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
            Step {step + 1} of {totalSteps}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22 }}
            >
              {/* Mode selection */}
              {currentStep === "mode" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">How do you want to train?</h2>
                  <p className="text-muted-foreground mb-8">Choose your mode - you can switch later in Settings.</p>
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      data-testid="mode-ai"
                      onClick={() => setForm((f) => ({ ...f, mode: "ai" }))}
                      className={`p-5 rounded-xl border text-left transition-all ${
                        form.mode === "ai"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                          <Brain className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-foreground text-lg">AI Coach</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        AI builds your program, monitors progress, and adjusts weekly based on your check-ins
                      </p>
                    </button>

                    <button
                      data-testid="mode-independent"
                      onClick={() => setForm((f) => ({ ...f, mode: "independent" }))}
                      className={`p-5 rounded-xl border text-left transition-all ${
                        form.mode === "independent"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                          <User className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-foreground text-lg">Independent</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        You're in control. Build your own program, log your sessions, and track progression yourself - no AI involved
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              {currentStep === "name" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">What should we call you?</h2>
                  <p className="text-muted-foreground mb-8">Optional - you can change this later in Settings.</p>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    data-testid="input-name"
                  />
                </div>
              )}

              {/* Body stats - age + weight, same as what's editable in Settings */}
              {currentStep === "bodyStats" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Body stats</h2>
                  <p className="text-muted-foreground mb-8">Optional - you can change this later in Settings.</p>
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Age</label>
                      <input
                        type="number"
                        value={form.age}
                        onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                        placeholder="e.g. 28"
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                        data-testid="input-age"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Weight</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={form.weight}
                          onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                          placeholder="e.g. 80"
                          className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          data-testid="input-weight"
                        />
                        <div className="flex rounded-xl border border-border overflow-hidden">
                          {["kg", "lbs"].map((u) => (
                            <button
                              key={u}
                              data-testid={`unit-${u}`}
                              onClick={() => setForm((f) => ({ ...f, weightUnit: u }))}
                              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                                form.weightUnit === u
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Goal - AI mode only */}
              {currentStep === "goal" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">What's your main goal?</h2>
                  <p className="text-muted-foreground mb-8">
                    Shapes your program and targets. Every option is built around building or keeping muscle.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {GOALS.map((g) => (
                      <button
                        key={g.value}
                        data-testid={`goal-${g.value}`}
                        onClick={() => selectGoal(g.value)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.goal === g.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-foreground hover:border-border/80 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="font-semibold">{g.label}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{g.sub}</div>
                        {form.goal === g.value && WEIGHT_GOALS.has(g.value) && (
                          <div className="mt-2 flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Goal weight:</span>
                            <span className="font-medium text-foreground">
                              {form.goalWeight ? `${form.goalWeight} ${form.weightUnit}` : "Not set"}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="text-primary underline underline-offset-2"
                              data-testid="link-edit-goal-weight"
                              onClick={(e) => { e.stopPropagation(); setShowGoalWeight(true); }}
                            >
                              Edit
                            </span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity level - AI mode only */}
              {currentStep === "activity" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">How active are your days?</h2>
                  <p className="text-muted-foreground mb-8">
                    Outside of training - this tells your coach how much you recover and burn.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {ACTIVITY.map((a) => (
                      <button
                        key={a.value}
                        data-testid={`activity-${a.value}`}
                        onClick={() => setForm((f) => ({ ...f, activityLevel: f.activityLevel === a.value ? "" : a.value }))}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.activityLevel === a.value
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="font-semibold text-foreground">{a.label}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{a.sub}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground flex gap-2">
                    <span>💡</span>
                    <span>Not sure? Your phone's built-in step tracker (Apple Health, Google Fit, Samsung Health) shows your daily average.</span>
                  </div>
                </div>
              )}

              {/* Experience - AI mode only */}
              {currentStep === "experience" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Your experience level</h2>
                  <p className="text-muted-foreground mb-8">Honest answers lead to better programs.</p>
                  <div className="grid grid-cols-1 gap-3">
                    {EXPERIENCE.map((e) => (
                      <button
                        key={e.value}
                        data-testid={`experience-${e.value}`}
                        onClick={() => setForm((f) => ({ ...f, experience: e.value }))}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.experience === e.value
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="font-semibold text-foreground">{e.label}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{e.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Training days - AI mode only */}
              {currentStep === "trainingDays" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Training days per week</h2>
                  <p className="text-muted-foreground mb-8">How many days can you commit to?</p>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-5xl font-bold text-primary">{form.trainingDays}</span>
                    <span className="text-muted-foreground">days / week</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    value={form.trainingDays}
                    onChange={(e) => setForm((f) => ({ ...f, trainingDays: parseInt(e.target.value) }))}
                    className="w-full accent-primary mb-4"
                    data-testid="training-days-slider"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mb-6">
                    {[2, 3, 4, 5, 6].map((n) => <span key={n}>{n}</span>)}
                  </div>
                </div>
              )}

              {/* Preferred rest days - AI mode only */}
              {currentStep === "preferredRestDays" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Any preferred rest days?</h2>
                  <p className="text-muted-foreground mb-8">
                    You picked {form.trainingDays} training days - choose the days you'd like to keep free. Optional.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {WEEKDAYS.map((d) => {
                      const selected = form.preferredRestDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          data-testid={`rest-${d.value}`}
                          onClick={() => togglePreferredRestDay(d.value)}
                          className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                            selected
                              ? tooManyPreferredRestDays
                                ? "border-destructive bg-destructive/10 text-destructive"
                                : "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  {tooManyPreferredRestDays ? (
                    <p className="text-xs font-medium text-destructive" data-testid="text-rest-warning">
                      Too many rest days to program around your {form.trainingDays} training days - remove one to continue.
                    </p>
                  ) : form.preferredRestDays.length === maxPreferredRestDays ? (
                    <p className="text-xs font-medium text-amber-500" data-testid="text-rest-warning">
                      That's the most rest days you can keep free with {form.trainingDays} training days.
                    </p>
                  ) : form.preferredRestDays.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No preference - your coach schedules your days.
                    </p>
                  ) : null}
                </div>
              )}

              {/* Equipment - AI mode only */}
              {currentStep === "equipment" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Available equipment</h2>
                  <p className="text-muted-foreground mb-8">Select everything you have access to.</p>
                  <div className="flex flex-wrap gap-2">
                    {EQUIPMENT.map((item) => (
                      <button
                        key={item}
                        data-testid={`equipment-${item.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => toggleEquipment(item)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                          form.equipment.includes(item)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sex + injuries - AI mode only, only meaningful for the AI prompt */}
              {currentStep === "details" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">A bit more for your AI coach</h2>
                  <p className="text-muted-foreground mb-8">Optional - helps tailor your program.</p>
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Sex <span className="text-muted-foreground font-normal">(optional)</span></label>
                      <div className="flex gap-2">
                        {["Male", "Female"].map((s) => (
                          <button
                            key={s}
                            data-testid={`sex-${s.toLowerCase()}`}
                            onClick={() => setForm((f) => ({
                              ...f,
                              sex: f.sex === s.toLowerCase() ? "" : s.toLowerCase(),
                            }))}
                            className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                              form.sex === s.toLowerCase()
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Injuries or limitations</label>
                      <textarea
                        value={form.injuries}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          injuries: e.target.value,
                          injurySeverity: e.target.value ? f.injurySeverity : "",
                        }))}
                        placeholder="e.g. bad lower back, knee pain"
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                        data-testid="input-injuries"
                      />
                    </div>
                    {form.injuries && (
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">
                          How bad is it? <span className="text-muted-foreground font-normal">(optional)</span>
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                          {INJURY_SEVERITY.map((s) => (
                            <button
                              key={s.value}
                              data-testid={`injury-severity-${s.value}`}
                              onClick={() => setForm((f) => ({
                                ...f,
                                injurySeverity: f.injurySeverity === s.value ? "" : s.value,
                              }))}
                              className={`p-4 rounded-xl border text-left transition-all ${
                                form.injurySeverity === s.value
                                  ? "border-primary bg-primary/10"
                                  : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                              }`}
                            >
                              <div className="font-semibold text-foreground">{s.label}</div>
                              <div className="text-sm text-muted-foreground mt-0.5">{s.sub}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Priority muscles - AI mode only */}
              {currentStep === "priorityMuscles" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Priority muscle groups</h2>
                  <p className="text-muted-foreground mb-8">Pick up to 3. Extra volume goes here.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {MUSCLES.map((m) => (
                      <button
                        key={m}
                        data-testid={`muscle-${m.toLowerCase()}`}
                        onClick={() => toggleMuscle(m)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                          form.priorityMuscles.includes(m)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.priorityMuscles.includes("No preference")
                      ? "No preference selected"
                      : `${selectedMuscleCount} / 3 selected`}
                  </p>
                </div>
              )}

              {/* Review & finish */}
              {currentStep === "review" && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {form.mode === "ai" ? "Ready to build your program" : "You're all set"}
                  </h2>
                  <p className="text-muted-foreground mb-8">
                    {form.mode === "ai"
                      ? "Here's what your AI coach will use."
                      : "Your profile is ready. Head to My Program to build your first program."}
                  </p>
                  <div className="space-y-3 mb-8">
                    {[
                      { label: "Mode", value: form.mode === "ai" ? "AI Coach" : "Independent" },
                      form.name && { label: "Name", value: form.name },
                      form.goal && { label: "Goal", value: goalLabel(form.goal) },
                      form.goalWeight && { label: "Goal weight", value: `${form.goalWeight} ${form.weightUnit}` },
                      form.experience && { label: "Experience", value: EXPERIENCE.find((e) => e.value === form.experience)?.label },
                      form.activityLevel && { label: "Activity level", value: ACTIVITY.find((a) => a.value === form.activityLevel)?.label },
                      form.mode === "ai" && { label: "Training days", value: `${form.trainingDays} days/week` },
                      form.preferredRestDays.length > 0 && { label: "Rest days", value: form.preferredRestDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(", ") },
                      form.equipment.length > 0 && { label: "Equipment", value: form.equipment.join(", ") },
                      form.age && { label: "Age", value: form.age },
                      form.sex && { label: "Sex", value: form.sex },
                      form.weight && { label: "Weight", value: `${form.weight} ${form.weightUnit}` },
                      form.injuries && { label: "Injuries", value: form.injuries },
                      form.injuries && form.injurySeverity && { label: "Severity", value: INJURY_SEVERITY.find((s) => s.value === form.injurySeverity)?.label },
                      form.priorityMuscles.length > 0 && { label: "Priority muscles", value: form.priorityMuscles.join(", ") },
                    ]
                      .filter(Boolean)
                      .map((item: any) => (
                        <div key={item.label} className="flex items-start gap-4 py-3 border-b border-border/50 last:border-0">
                          <span className="text-sm text-muted-foreground w-36 shrink-0">{item.label}</span>
                          <span className="text-sm text-foreground font-medium">{item.value}</span>
                        </div>
                      ))}
                  </div>

                  {(createProfile.isError || generateProgram.isError) && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">
                      Something went wrong. Please try again.
                    </div>
                  )}

                  {form.mode === "ai" ? (
                    <div className="space-y-3">
                      <Button
                        className="w-full h-12 text-base font-semibold"
                        onClick={() => { setFinishAction("generate"); handleFinish(true); }}
                        disabled={isPending}
                        data-testid="button-generate-program"
                      >
                        {isPending && finishAction === "generate" ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            {createProfile.isPending ? "Saving profile..." : "Building your program..."}
                          </>
                        ) : (
                          "Generate program"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-11 text-sm font-semibold"
                        onClick={() => { setFinishAction("later"); handleFinish(false); }}
                        disabled={isPending}
                        data-testid="button-generate-later"
                      >
                        {isPending && finishAction === "later" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving profile...
                          </>
                        ) : (
                          "Generate program later"
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        You can generate your program any time from My Program.
                      </p>
                    </div>
                  ) : (
                    <Button
                      className="w-full h-12 text-base font-semibold"
                      onClick={() => { setFinishAction("later"); handleFinish(false); }}
                      disabled={isPending}
                      data-testid="button-generate-program"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Saving profile...
                        </>
                      ) : (
                        "Get started"
                      )}
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {!isLastStep && (
            <div className="flex items-center gap-3 mt-10">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  className="h-11"
                  data-testid="button-back"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                className="flex-1 h-11"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance()}
                data-testid="button-continue"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {isLastStep && step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              className="h-11 mt-4 w-full"
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
