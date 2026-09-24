import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Brain, User, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProfile, useGenerateProgram, useGetCurrentProgram, getGetCurrentProgramQueryKey, getGetProfileQueryKey, useGetProfile, useSetProgramStartDate, type Program, type UserProfileInputInjurySeverity } from "@workspace/api-client-react";
import { MUSCLE_OPTIONS } from "@/lib/muscles";
import { CARDIO_DAYS, orderCardioDays } from "@/lib/independentTargets";
import { FIELD_LIMITS, MAX_PROFILE_NAME, rangeError } from "@/lib/fieldLimits";
import { GeneratingScreen } from "@/components/onboarding/GeneratingScreen";
import { PresentationDeck } from "@/components/onboarding/PresentationDeck";
import { CommitmentScreen } from "@/components/onboarding/CommitmentScreen";
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

// A target weight that points the opposite way to the chosen goal is a typo,
// not a plan - you can't gain weight by aiming below where you are now. Returns
// the message to show, or null when there's nothing to complain about (no
// weight goal, or either weight left blank). Both weights always share
// form.weightUnit, so they're directly comparable.
function goalWeightConflict(
  form: Pick<FormState, "goal" | "weight" | "goalWeight" | "weightUnit">,
): string | null {
  if (!WEIGHT_GOALS.has(form.goal)) return null;
  // Range before direction: "-50 is below your current 1500" is a useless thing to
  // say about a number that was never a weight in the first place.
  const outOfRange = rangeError(form.goalWeight, FIELD_LIMITS.goalWeight);
  if (outOfRange) return outOfRange;
  const current = parseFloat(form.weight);
  const target = parseFloat(form.goalWeight);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;

  const unit = form.weightUnit;
  if (target === current) {
    const direction = form.goal === "gain_weight" ? "above" : "below";
    return `That's your current weight (${current} ${unit}), so there's nothing to reach. Enter a target ${direction} it, or pick General fitness instead.`;
  }
  if (form.goal === "gain_weight" && target < current) {
    return `You picked Gain weight, but ${target} ${unit} is below your current ${current} ${unit} - that's losing weight. Enter a target above ${current} ${unit}, or switch your goal to Lose weight.`;
  }
  if (form.goal === "lose_weight" && target > current) {
    return `You picked Lose weight, but ${target} ${unit} is above your current ${current} ${unit} - that's gaining weight. Enter a target below ${current} ${unit}, or switch your goal to Gain weight.`;
  }
  return null;
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
// (name, age, weight), plus the goal - Independent users don't get a program
// built for them, but their goal and target weight still drive the dashboard's
// progress tracking. Everything else is AI-coaching input - only meaningful
// when the AI is the one building/adjusting your program - so Independent mode
// goes from the goal straight to the review step.
type StepKey =
  | "mode" | "name" | "bodyStats" | "goal"
  | "experience" | "activity" | "trainingDays" | "preferredRestDays" | "equipment" | "details" | "priorityMuscles"
  | "targets" | "review";

function stepsFor(mode: string): StepKey[] {
  const base: StepKey[] = ["mode", "name", "bodyStats", "goal"];
  if (mode === "ai") {
    return [...base, "experience", "activity", "trainingDays", "preferredRestDays", "equipment", "details", "priorityMuscles", "review"];
  }
  // Independent users get no AI-built program, so they set their own daily
  // targets here (optional - the box is editable later on the dashboard).
  return [...base, "targets", "review"];
}

// A rough daily-calorie starting point so the targets step isn't a blank
// staring contest - maintenance ~= 30 kcal/kg, nudged for the chosen goal.
// It's only a suggestion; the user overwrites or clears it freely.
//
// The result is clamped because a suggestion is worse than no suggestion when it's
// absurd: an unclamped 30 kcal/kg pre-filled 20,000 kcal/day off a mistyped body
// weight. The body-weight field is range-checked now too, so this is the second
// line of defence rather than the only one.
const SUGGESTED_CALORIES_MIN = 1200;
const SUGGESTED_CALORIES_MAX = 5000;

function suggestCalories(weightStr: string, weightUnit: string, goal: string): number {
  const w = parseFloat(weightStr);
  const kg = Number.isFinite(w) ? (weightUnit === "lbs" ? w / 2.2046 : w) : 75;
  let cals = kg * 30;
  if (goal === "lose_weight") cals -= 400;
  else if (goal === "gain_weight") cals += 300;
  const rounded = Math.round(cals / 50) * 50;
  return Math.min(Math.max(rounded, SUGGESTED_CALORIES_MIN), SUGGESTED_CALORIES_MAX);
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
  dailyCalorieTarget: string;
  dailyStepTarget: string;
  cardioDays: string[];
  cardioMinutes: string;
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
  dailyCalorieTarget: "",
  dailyStepTarget: "",
  cardioDays: [],
  cardioMinutes: "",
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [showGoalWeight, setShowGoalWeight] = useState(false);
  // The target-weight popup edits a local draft, not form.goalWeight directly,
  // so half-typed values (the "6" on the way to "68") never reach the form and
  // can't flash a direction error. The draft is only validated and committed on
  // Save; goalWeightSaveError holds the message from a failed Save attempt and
  // clears as soon as the user types again.
  const [goalWeightDraft, setGoalWeightDraft] = useState("");
  const [goalWeightSaveError, setGoalWeightSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "generating" | "presentation" | "commitment">("form");
  const [program, setProgram] = useState<Program | null>(null);
  const [regenerateCount, setRegenerateCount] = useState(0);
  // Tracks which review-step button was clicked so only that one shows a
  // spinner - both call the same createProfile mutation, so isPending alone
  // can't tell them apart.
  const [finishAction, setFinishAction] = useState<"generate" | "later" | null>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createProfile = useCreateProfile();
  const generateProgram = useGenerateProgram();
  const setProgramStartDate = useSetProgramStartDate();
  const profileQuery = useGetProfile();

  // Testing-only shortcut: /onboarding?step=commitment jumps straight to the
  // commitment screen using whatever program already exists, skipping the
  // form/generation/presentation steps. Not a real product flow.
  const debugStep = new URLSearchParams(useSearch()).get("step");
  const debugProgramQuery = useGetCurrentProgram(undefined, {
    query: { enabled: debugStep === "commitment", queryKey: getGetCurrentProgramQueryKey() },
  });
  useEffect(() => {
    if (debugStep === "commitment" && debugProgramQuery.data) {
      setProgram(debugProgramQuery.data);
      setPhase("commitment");
    }
  }, [debugStep, debugProgramQuery.data]);

  // A profile that's in AI mode but missing goal/experience means AI
  // coaching was never set up - either the user onboarded through
  // Independent mode (which skips the AI-only questions) and later
  // switched modes in Settings, or a previous AI setup attempt didn't
  // finish. Either way the basics are already saved, so prefill them and
  // resume at the goal step rather than re-asking from the top. Independent
  // onboarding does capture a goal, so carry that over too - the step is
  // still shown, just pre-answered.
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
      goal: profile.goal ?? "",
      goalWeight: profile.goalWeight != null ? String(profile.goalWeight) : "",
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
  // Until a mode is picked on the first step, the flow length is unknown (AI
  // and Independent have different step counts), so keep the progress bar empty
  // rather than implying the user is already a quarter of the way through.
  const hasStarted = form.mode !== "";
  const progress = hasStarted ? ((step + 1) / totalSteps) * 100 : 0;

  // A user may keep at most (7 - trainingDays + 1) days free: the strict number
  // of off-days plus one day of scheduling slack. More than that can't be
  // programmed around their committed days.
  const maxPreferredRestDays = 7 - form.trainingDays + 1;
  const tooManyPreferredRestDays = form.preferredRestDays.length > maxPreferredRestDays;

  // Recomputed every render so editing either weight - the target in the popup
  // or the body weight a step earlier - re-checks the pair immediately.
  const goalWeightError = goalWeightConflict(form);

  // Plausibility checks on the free-number fields, in the same recompute-every-render
  // style as goalWeightError. Blank is never an error - every one of these is
  // optional - so these only fire on a value that was actually typed.
  const ageError = rangeError(form.age, FIELD_LIMITS.age);
  const weightError = rangeError(form.weight, FIELD_LIMITS.weight);
  const calorieTargetError = rangeError(form.dailyCalorieTarget, FIELD_LIMITS.dailyCalorieTarget);
  const stepTargetError = rangeError(form.dailyStepTarget, FIELD_LIMITS.dailyStepTarget);
  const cardioMinutesError = form.cardioDays.length ? rangeError(form.cardioMinutes, FIELD_LIMITS.cardioMinutes) : null;

  // Seed the optional targets step with sensible starting values the first time
  // it's shown, so it reads as a suggestion to tweak rather than empty fields.
  // Only fills blanks, so re-visiting it never clobbers the user's own numbers.
  const targetsSeededRef = useRef(false);
  useEffect(() => {
    if (currentStep !== "targets" || targetsSeededRef.current) return;
    targetsSeededRef.current = true;
    setForm((f) => ({
      ...f,
      dailyCalorieTarget: f.dailyCalorieTarget || String(suggestCalories(f.weight, f.weightUnit, f.goal)),
      dailyStepTarget: f.dailyStepTarget || "8000",
    }));
  }, [currentStep]);

  function canAdvance() {
    switch (currentStep) {
      case "mode": return !!form.mode;
      case "bodyStats": return !ageError && !weightError;
      case "goal": return !!form.goal && !goalWeightError;
      case "experience": return !!form.experience;
      case "preferredRestDays": return !tooManyPreferredRestDays;
      case "equipment": return form.equipment.length > 0;
      case "targets": return !calorieTargetError && !stepTargetError && !cardioMinutesError;
      default: return true;
    }
  }

  // Opens the target-weight popup with a fresh draft seeded from whatever's
  // already saved, and no stale error from a previous attempt.
  function openGoalWeight() {
    setGoalWeightDraft(form.goalWeight);
    setGoalWeightSaveError(null);
    setShowGoalWeight(true);
  }

  // Validate the draft against the current body weight; on a conflict, keep the
  // popup open and show why, otherwise commit the draft and close.
  function saveGoalWeight() {
    const conflict = goalWeightConflict({ ...form, goalWeight: goalWeightDraft });
    if (conflict) {
      setGoalWeightSaveError(conflict);
      return;
    }
    setForm((f) => ({ ...f, goalWeight: goalWeightDraft }));
    setShowGoalWeight(false);
  }

  // Selecting a weight goal opens the target-weight popup; picking General
  // fitness clears any previously entered target.
  function selectGoal(value: string) {
    setForm((f) => ({ ...f, goal: value, goalWeight: WEIGHT_GOALS.has(value) ? f.goalWeight : "" }));
    if (WEIGHT_GOALS.has(value)) openGoalWeight();
  }

  function toggleCardioDay(day: string) {
    setForm((f) => ({
      ...f,
      cardioDays: f.cardioDays.includes(day) ? f.cardioDays.filter((d) => d !== day) : [...f.cardioDays, day],
    }));
  }

  function togglePreferredRestDay(value: string) {
    setForm((f) => ({
      ...f,
      preferredRestDays: f.preferredRestDays.includes(value)
        ? f.preferredRestDays.filter((d) => d !== value)
        : [...f.preferredRestDays, value],
    }));
  }

  // "Full gym" means access to everything, so it's exclusive - picking it
  // clears any other selection, and picking anything else drops it.
  function toggleEquipment(item: string) {
    setForm((f) => {
      if (item === "Full gym") {
        return { ...f, equipment: f.equipment.includes("Full gym") ? [] : ["Full gym"] };
      }
      const withoutFullGym = f.equipment.filter((e) => e !== "Full gym");
      return {
        ...f,
        equipment: withoutFullGym.includes(item)
          ? withoutFullGym.filter((e) => e !== item)
          : [...withoutFullGym, item],
      };
    });
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
      const profile = await createProfile.mutateAsync({
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
          // Independent-only self-set targets; AI mode leaves these unset and
          // gets equivalents from its generated program instead.
          dailyCalorieTarget: form.dailyCalorieTarget ? parseInt(form.dailyCalorieTarget, 10) : undefined,
          dailyStepTarget: form.dailyStepTarget ? parseInt(form.dailyStepTarget, 10) : undefined,
          cardioDays: orderCardioDays(form.cardioDays),
          cardioMinutes: form.cardioDays.length && form.cardioMinutes ? parseInt(form.cardioMinutes, 10) : undefined,
        },
      });

      // Seed the profile cache with the just-created profile. useGetProfile
      // cached a 404 error on first load (no profile row existed yet), and the
      // Layout that guards every authenticated route never remounts as we
      // navigate to /dashboard - so without this it would still see the stale
      // 404 and bounce the user right back to /onboarding.
      queryClient.setQueryData(getGetProfileQueryKey(), profile);

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

  async function handleCommit(startDate: Date) {
    if (!program) return;
    try {
      await setProgramStartDate.mutateAsync({
        id: program.id,
        data: { startDate: startDate.toISOString() },
      });
    } catch {
      toast({
        title: "Couldn't save your start date",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setLocation("/dashboard");
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
    enter: { opacity: 0, x: 12 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
  };

  const selectedMuscleCount = form.priorityMuscles.filter((m) => m !== "No preference").length;

  if (phase === "generating") {
    return (
      <div className="theme-sessions min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <GeneratingScreen />
        </div>
      </div>
    );
  }

  // The presentation deck and commitment screen sit inside the same Sessions
  // scope so the flow never flashes back to the navy theme after the form.
  if (phase === "presentation" && program) {
    return (
      <div className="theme-sessions min-h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 flex flex-col items-center p-6 py-12">
          <PresentationDeck
            program={program}
            goal={form.goal}
            weightUnit={form.weightUnit}
            onSatisfied={() => setPhase("commitment")}
            onSubmitFeedback={handleRegenerateFeedback}
            isSubmitting={generateProgram.isPending}
            showRegenerateNudge={regenerateCount >= 3}
            error={generateProgram.isError}
          />
        </div>
      </div>
    );
  }

  if (phase === "commitment" && program) {
    return (
      <div className="theme-sessions min-h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 flex flex-col items-center p-6 py-12">
          <CommitmentScreen program={program} onConfirm={handleCommit} />
        </div>
      </div>
    );
  }

  return (
    <div className="theme-sessions min-h-screen bg-background text-foreground flex flex-col">
      {showGoalWeight && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60"
          onClick={() => setShowGoalWeight(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[30px] sm:rounded-[30px] bg-card px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-[5px] w-[38px] rounded-full bg-accent sm:hidden" aria-hidden="true" />
            <h3 className="text-[22px] font-normal leading-tight tracking-[-0.01em] text-foreground">What weight do you want to reach?</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
              Saved as your long-term goal weight
              {form.weight ? ` (now: ${form.weight} ${form.weightUnit})` : ""}. You can skip this.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                type="number"
                autoFocus
                value={goalWeightDraft}
                onChange={(e) => { setGoalWeightDraft(e.target.value); setGoalWeightSaveError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoalWeight(); }}
                placeholder={`Target ${form.weightUnit}`}
                className={inputClass(!!goalWeightSaveError, "flex-1 bg-secondary")}
                data-testid="input-goal-weight"
              />
              <UnitToggle
                value={form.weightUnit}
                onChange={(u) => { setForm((f) => ({ ...f, weightUnit: u })); setGoalWeightSaveError(null); }}
                testIdPrefix="goal-weight-unit"
                className="bg-secondary"
              />
            </div>
            {goalWeightSaveError && (
              <p className="mt-3 text-[13px] font-medium text-destructive" data-testid="text-goal-weight-error">
                {goalWeightSaveError}
              </p>
            )}
            <div className="mt-6 flex gap-2.5">
              <button
                className={cn(OUTLINE_BUTTON_CLASS, "flex-1")}
                onClick={() => { setForm((f) => ({ ...f, goalWeight: "" })); setShowGoalWeight(false); }}
                data-testid="button-skip-goal-weight"
              >
                Skip
              </button>
              <button
                className={cn(PRIMARY_BUTTON_CLASS, "flex-[1.4]")}
                onClick={saveGoalWeight}
                data-testid="button-save-goal-weight"
              >
                Save target
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-6 mt-4 h-[3px] overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-white"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 py-12">
        <div className="w-full max-w-lg">
          {/* Hidden (but space reserved to avoid a layout jump) until a mode is
              chosen - "Step 1 of 4" before any interaction is misleading. */}
          <div className={cn(CAPS_CLASS, "mb-3", !hasStarted && "invisible")}>
            Step {step + 1} of {totalSteps}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              {/* Mode selection */}
              {currentStep === "mode" && (
                <div>
                  <h2 className={TITLE_CLASS}>How do you want to train?</h2>
                  <p className={LEDE_CLASS}>Choose your mode - you can switch later in Settings.</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {[
                      { value: "ai", label: "AI Coach", Icon: Brain, sub: "AI builds your program, monitors progress, and adjusts weekly based on your check-ins" },
                      { value: "independent", label: "Independent", Icon: User, sub: "You're in control. Build your own program, log your sessions, and track progression yourself - no AI involved" },
                    ].map(({ value, label, Icon, sub }) => {
                      const selected = form.mode === value;
                      return (
                        <button
                          key={value}
                          data-testid={`mode-${value}`}
                          onClick={() => setForm((f) => ({ ...f, mode: value }))}
                          aria-pressed={selected}
                          className={optionCardClass(selected)}
                        >
                          <div className={cn(
                            "mb-3.5 grid h-11 w-11 place-items-center rounded-full",
                            selected ? "bg-black/[0.07]" : "bg-secondary",
                          )}>
                            <Icon className="h-5 w-5" strokeWidth={1.6} />
                          </div>
                          <div className="text-base font-medium">{label}</div>
                          <p className={optionSubClass(selected)}>{sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Name */}
              {currentStep === "name" && (
                <div>
                  <h2 className={TITLE_CLASS}>What should we call you?</h2>
                  <p className={LEDE_CLASS}>Optional - you can change this later in Settings.</p>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    maxLength={MAX_PROFILE_NAME}
                    placeholder="Your name"
                    className={inputClass(false)}
                    data-testid="input-name"
                  />
                </div>
              )}

              {/* Body stats - age + weight, same as what's editable in Settings */}
              {currentStep === "bodyStats" && (
                <div>
                  <h2 className={TITLE_CLASS}>Body stats</h2>
                  <p className={LEDE_CLASS}>Optional - you can change this later in Settings.</p>
                  <div className="space-y-5">
                    <div>
                      <label className={LABEL_CLASS}>Age</label>
                      <input
                        type="number"
                        value={form.age}
                        onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                        placeholder="e.g. 28"
                        className={inputClass(!!ageError)}
                        data-testid="input-age"
                      />
                      {ageError && (
                        <p className={ERROR_TEXT_CLASS} data-testid="text-age-error">
                          {ageError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Weight</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={form.weight}
                          onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                          placeholder="e.g. 80"
                          className={inputClass(!!weightError, "flex-1")}
                          data-testid="input-weight"
                        />
                        <UnitToggle
                          value={form.weightUnit}
                          onChange={(u) => setForm((f) => ({ ...f, weightUnit: u }))}
                          testIdPrefix="unit"
                        />
                      </div>
                      {weightError && (
                        <p className={ERROR_TEXT_CLASS} data-testid="text-weight-error">
                          {weightError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Goal - both modes */}
              {currentStep === "goal" && (
                <div>
                  <h2 className={TITLE_CLASS}>What's your main goal?</h2>
                  <p className={LEDE_CLASS}>
                    {form.mode === "ai"
                      ? "Shapes your program and targets. Every option is built around building or keeping muscle."
                      : "Sets the target your dashboard tracks against. Every option is built around building or keeping muscle."}
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {GOALS.map((g) => {
                      const selected = form.goal === g.value;
                      return (
                        <button
                          key={g.value}
                          data-testid={`goal-${g.value}`}
                          onClick={() => selectGoal(g.value)}
                          aria-pressed={selected}
                          className={optionCardClass(selected)}
                        >
                          <div className="text-base font-medium">{g.label}</div>
                          <div className={optionSubClass(selected)}>{g.sub}</div>
                          {selected && WEIGHT_GOALS.has(g.value) && (
                            <div className="mt-2.5 flex items-center gap-2 text-[13px]">
                              <span className="text-black/60">Goal weight:</span>
                              <span className={cn("font-medium", goalWeightError ? "text-destructive" : "text-black")}>
                                {form.goalWeight ? `${form.goalWeight} ${form.weightUnit}` : "Not set"}
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                className="text-black underline underline-offset-[3px]"
                                data-testid="link-edit-goal-weight"
                                onClick={(e) => { e.stopPropagation(); setShowGoalWeight(true); }}
                              >
                                Edit
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Reachable by dismissing the popup with a bad target still in
                      it, or by going back and changing the body weight - Continue
                      stays blocked until it's resolved. */}
                  {goalWeightError && (
                    <p className="mt-4 text-[13px] font-medium text-destructive" data-testid="text-goal-weight-error-step">
                      {goalWeightError}
                    </p>
                  )}
                </div>
              )}

              {/* Activity level - AI mode only */}
              {currentStep === "activity" && (
                <div>
                  <h2 className={TITLE_CLASS}>How active are your days?</h2>
                  <p className={LEDE_CLASS}>
                    Outside of training - this tells your coach how much you recover and burn.
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {ACTIVITY.map((a) => {
                      const selected = form.activityLevel === a.value;
                      return (
                        <button
                          key={a.value}
                          data-testid={`activity-${a.value}`}
                          onClick={() => setForm((f) => ({ ...f, activityLevel: f.activityLevel === a.value ? "" : a.value }))}
                          aria-pressed={selected}
                          className={optionCardClass(selected)}
                        >
                          <div className="text-base font-medium">{a.label}</div>
                          <div className={optionSubClass(selected)}>{a.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                  <Notice className="mt-4">
                    Not sure? Your phone's built-in step tracker (Apple Health, Google Fit, Samsung Health) shows your daily average.
                  </Notice>
                </div>
              )}

              {/* Experience - AI mode only */}
              {currentStep === "experience" && (
                <div>
                  <h2 className={TITLE_CLASS}>Your experience level</h2>
                  <p className={LEDE_CLASS}>Honest answers lead to better programs.</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {EXPERIENCE.map((e) => {
                      const selected = form.experience === e.value;
                      return (
                        <button
                          key={e.value}
                          data-testid={`experience-${e.value}`}
                          onClick={() => setForm((f) => ({ ...f, experience: e.value }))}
                          aria-pressed={selected}
                          className={optionCardClass(selected)}
                        >
                          <div className="text-base font-medium">{e.label}</div>
                          <div className={optionSubClass(selected)}>{e.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Training days - AI mode only */}
              {currentStep === "trainingDays" && (
                <div>
                  <h2 className={TITLE_CLASS}>Training days per week</h2>
                  <p className={LEDE_CLASS}>How many days can you commit to?</p>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[88px] font-light leading-none tracking-[-0.04em] text-foreground">{form.trainingDays}</span>
                    <span className={CAPS_CLASS}>days / week</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    value={form.trainingDays}
                    onChange={(e) => setForm((f) => ({ ...f, trainingDays: parseInt(e.target.value) }))}
                    className="sessions-range mt-6 mb-3"
                    aria-label="Training days per week"
                    data-testid="training-days-slider"
                  />
                  <div className="flex justify-between px-1.5 text-xs text-muted-foreground">
                    {[2, 3, 4, 5, 6].map((n) => <span key={n}>{n}</span>)}
                  </div>
                </div>
              )}

              {/* Preferred rest days - AI mode only */}
              {currentStep === "preferredRestDays" && (
                <div>
                  <h2 className={TITLE_CLASS}>Any preferred rest days?</h2>
                  <p className={LEDE_CLASS}>
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
                          aria-pressed={selected}
                          className={chipClass(selected, selected && tooManyPreferredRestDays)}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  {tooManyPreferredRestDays ? (
                    <p className="text-[12.5px] font-medium text-destructive" data-testid="text-rest-warning">
                      Too many rest days to program around your {form.trainingDays} training days - remove one to continue.
                    </p>
                  ) : form.preferredRestDays.length === maxPreferredRestDays ? (
                    <p className="text-[12.5px] font-medium text-foreground" data-testid="text-rest-warning">
                      You've picked the most rest days we can plan around your {form.trainingDays} training days.
                    </p>
                  ) : form.preferredRestDays.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      No preference - your coach schedules your days.
                    </p>
                  ) : null}
                </div>
              )}

              {/* Equipment - AI mode only */}
              {currentStep === "equipment" && (
                <div>
                  <h2 className={TITLE_CLASS}>Available equipment</h2>
                  <p className={LEDE_CLASS}>
                    Select everything you have access to, or just "Full gym" if that covers it - it's a single
                    choice that can't be combined with the others.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {EQUIPMENT.map((item) => {
                      const selected = form.equipment.includes(item);
                      return (
                        <button
                          key={item}
                          data-testid={`equipment-${item.toLowerCase().replace(/\s+/g, "-")}`}
                          onClick={() => toggleEquipment(item)}
                          aria-pressed={selected}
                          className={chipClass(selected)}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">
                    {form.equipment.includes("Full gym")
                      ? "Full gym selected - covers everything"
                      : form.equipment.length > 0
                        ? `${form.equipment.length} selected`
                        : null}
                  </p>
                </div>
              )}

              {/* Sex + injuries - AI mode only, only meaningful for the AI prompt */}
              {currentStep === "details" && (
                <div>
                  <h2 className={TITLE_CLASS}>A bit more for your AI coach</h2>
                  <p className={LEDE_CLASS}>Optional - helps tailor your program.</p>
                  <div className="space-y-5">
                    <div>
                      <label className={LABEL_CLASS}>Sex <span className="text-muted-foreground">(optional)</span></label>
                      <div className="flex gap-2">
                        {["Male", "Female"].map((s) => {
                          const selected = form.sex === s.toLowerCase();
                          return (
                            <button
                              key={s}
                              data-testid={`sex-${s.toLowerCase()}`}
                              onClick={() => setForm((f) => ({
                                ...f,
                                sex: f.sex === s.toLowerCase() ? "" : s.toLowerCase(),
                              }))}
                              aria-pressed={selected}
                              className={cn(chipClass(selected), "h-[52px] flex-1")}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Injuries or limitations</label>
                      <textarea
                        value={form.injuries}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          injuries: e.target.value,
                          injurySeverity: e.target.value ? f.injurySeverity : "",
                        }))}
                        placeholder="e.g. bad lower back, knee pain"
                        rows={3}
                        className="w-full rounded-3xl bg-card px-5 py-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40 resize-none"
                        data-testid="input-injuries"
                      />
                    </div>
                    {form.injuries && (
                      <div>
                        <label className={LABEL_CLASS}>
                          How bad is it? <span className="text-muted-foreground">(optional)</span>
                        </label>
                        <div className="grid grid-cols-1 gap-2.5">
                          {INJURY_SEVERITY.map((s) => {
                            const selected = form.injurySeverity === s.value;
                            return (
                              <button
                                key={s.value}
                                data-testid={`injury-severity-${s.value}`}
                                onClick={() => setForm((f) => ({
                                  ...f,
                                  injurySeverity: f.injurySeverity === s.value ? "" : s.value,
                                }))}
                                aria-pressed={selected}
                                className={optionCardClass(selected)}
                              >
                                <div className="text-base font-medium">{s.label}</div>
                                <div className={optionSubClass(selected)}>{s.sub}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Priority muscles - AI mode only */}
              {currentStep === "priorityMuscles" && (
                <div>
                  <h2 className={TITLE_CLASS}>Priority muscle groups</h2>
                  <p className={LEDE_CLASS}>Pick up to 3. Extra volume goes here.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {MUSCLES.map((m) => {
                      const selected = form.priorityMuscles.includes(m);
                      return (
                        <button
                          key={m}
                          data-testid={`muscle-${m.toLowerCase()}`}
                          onClick={() => toggleMuscle(m)}
                          aria-pressed={selected}
                          className={chipClass(selected)}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">
                    {form.priorityMuscles.includes("No preference")
                      ? "No preference selected"
                      : `${selectedMuscleCount} / 3 selected`}
                  </p>
                </div>
              )}

              {/* Daily targets - Independent mode only. Fully optional: every
                  field can be left as-is, cleared, or skipped, and all of it is
                  editable later from the dashboard's targets box. */}
              {currentStep === "targets" && (
                <div>
                  <h2 className={TITLE_CLASS}>Set your targets</h2>
                  <p className={LEDE_CLASS}>
                    What you're aiming for day to day. We've suggested a starting point - adjust anything, or skip and set it later.
                  </p>

                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL_CLASS}>Calorie target</label>
                        <div className={suffixFieldClass(!!calorieTargetError)}>
                          <input
                            type="number"
                            value={form.dailyCalorieTarget}
                            onChange={(e) => setForm((f) => ({ ...f, dailyCalorieTarget: e.target.value }))}
                            placeholder="e.g. 2200"
                            className="flex-1 min-w-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                            data-testid="input-target-calories"
                          />
                          <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">kcal / day</span>
                        </div>
                        {calorieTargetError && (
                          <p className={ERROR_TEXT_CLASS} data-testid="text-target-calories-error">
                            {calorieTargetError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Step target</label>
                        <div className={suffixFieldClass(!!stepTargetError)}>
                          <input
                            type="number"
                            value={form.dailyStepTarget}
                            onChange={(e) => setForm((f) => ({ ...f, dailyStepTarget: e.target.value }))}
                            placeholder="e.g. 8000"
                            className="flex-1 min-w-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                            data-testid="input-target-steps"
                          />
                          <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">steps / day</span>
                        </div>
                        {stepTargetError && (
                          <p className={ERROR_TEXT_CLASS} data-testid="text-target-steps-error">
                            {stepTargetError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Cardio <span className="text-muted-foreground">(optional)</span></label>
                      <div className="flex flex-wrap gap-2">
                        {CARDIO_DAYS.map((d) => {
                          const selected = form.cardioDays.includes(d);
                          return (
                            <button
                              key={d}
                              data-testid={`target-cardio-${d.toLowerCase()}`}
                              onClick={() => toggleCardioDay(d)}
                              aria-pressed={selected}
                              className={chipClass(selected)}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                      {(() => {
                        const hasDays = form.cardioDays.length > 0;
                        return (
                          <div className={cn("mt-3 transition-opacity", hasDays ? "opacity-100" : "opacity-40")}>
                            <div className="flex items-center gap-3">
                              <span className="text-[13px] text-muted-foreground">Minutes each day:</span>
                              <div className={cn(suffixFieldClass(!!cardioMinutesError), "h-11 w-32 px-4")}>
                                <input
                                  type="number"
                                  value={form.cardioMinutes}
                                  onChange={(e) => setForm((f) => ({ ...f, cardioMinutes: e.target.value }))}
                                  placeholder="e.g. 25"
                                  disabled={!hasDays}
                                  className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed"
                                  data-testid="input-target-cardio-minutes"
                                />
                                <span className="shrink-0 text-sm text-muted-foreground">min</span>
                              </div>
                            </div>
                            {cardioMinutesError && (
                              <p className={ERROR_TEXT_CLASS} data-testid="text-target-cardio-minutes-error">
                                {cardioMinutesError}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <Notice className="mt-6">You can change these anytime from your dashboard.</Notice>
                </div>
              )}

              {/* Review & finish */}
              {currentStep === "review" && (
                <div>
                  <h2 className={TITLE_CLASS}>
                    {form.mode === "ai" ? "Ready to build your program" : "You're all set"}
                  </h2>
                  <p className={LEDE_CLASS}>
                    {form.mode === "ai"
                      ? "Here's what your AI coach will use."
                      : "Your profile is ready. Head to My Program to build your first program."}
                  </p>
                  <div className="mb-6 overflow-hidden rounded-[26px] bg-card">
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
                      form.mode !== "ai" && form.dailyCalorieTarget && { label: "Calorie target", value: `${parseInt(form.dailyCalorieTarget, 10).toLocaleString()} kcal/day` },
                      form.mode !== "ai" && form.dailyStepTarget && { label: "Step target", value: `${parseInt(form.dailyStepTarget, 10).toLocaleString()} steps/day` },
                      form.mode !== "ai" && form.cardioDays.length > 0 && {
                        label: "Cardio",
                        value: `${orderCardioDays(form.cardioDays).join(", ")}${form.cardioMinutes ? ` · ${form.cardioMinutes} min each` : ""}`,
                      },
                    ]
                      .filter(Boolean)
                      .map((item: any) => (
                        // Inset grouped row: the hairline sits on the inner block so it
                        // starts at the text inset, and the last row has none.
                        <div key={item.label} className="group flex pl-5">
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-4 border-b border-border py-[14px] pr-5 group-last:border-b-0">
                            <span className="shrink-0 text-sm text-muted-foreground">{item.label}</span>
                            <span className="min-w-0 break-words text-right text-sm text-foreground">{item.value}</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  {(createProfile.isError || generateProgram.isError) && (
                    <div className="mb-4 rounded-[22px] bg-destructive/10 px-4 py-3.5 text-[12.5px] text-destructive">
                      Something went wrong. Please try again.
                    </div>
                  )}

                  {form.mode === "ai" ? (
                    <div className="space-y-2.5">
                      <button
                        className={cn(PRIMARY_BUTTON_CLASS, "w-full")}
                        onClick={() => { setFinishAction("generate"); handleFinish(true); }}
                        disabled={isPending}
                        data-testid="button-generate-program"
                      >
                        {isPending && finishAction === "generate" ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {createProfile.isPending ? "Saving profile..." : "Building your program..."}
                          </>
                        ) : (
                          "Generate program"
                        )}
                      </button>
                      <button
                        className={cn(OUTLINE_BUTTON_CLASS, "w-full")}
                        onClick={() => { setFinishAction("later"); handleFinish(false); }}
                        disabled={isPending}
                        data-testid="button-generate-later"
                      >
                        {isPending && finishAction === "later" ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving profile...
                          </>
                        ) : (
                          "Generate program later"
                        )}
                      </button>
                      <p className="pt-1 text-center text-[12.5px] text-muted-foreground">
                        You can generate your program any time from My Program.
                      </p>
                    </div>
                  ) : (
                    <button
                      className={cn(PRIMARY_BUTTON_CLASS, "w-full")}
                      onClick={() => { setFinishAction("later"); handleFinish(false); }}
                      disabled={isPending}
                      data-testid="button-generate-program"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving profile...
                        </>
                      ) : (
                        "Get started"
                      )}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {!isLastStep && (
            <div className="flex items-center gap-2.5 mt-10">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className={OUTLINE_BUTTON_CLASS}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                  Back
                </button>
              )}
              <button
                className={cn(PRIMARY_BUTTON_CLASS, "flex-1")}
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance()}
                data-testid="button-continue"
              >
                Continue
                <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
          )}

          {isLastStep && step > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setStep((s) => s - 1)}
                className={cn(CAPS_CLASS, "inline-flex items-center gap-1 px-3 py-2 transition-colors hover:text-foreground")}
                data-testid="button-back"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Sessions styling (see TrainientAppDesign.md) ---------- */

const TITLE_CLASS = "text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground";
const LEDE_CLASS = "mt-2.5 mb-8 text-[13.5px] leading-relaxed text-muted-foreground";
const CAPS_CLASS = "text-[11px] uppercase tracking-[0.14em] text-muted-foreground";
const LABEL_CLASS = "mb-2 ml-1 block text-[13px] text-foreground";
const ERROR_TEXT_CLASS = "mt-2 ml-1 text-[13px] font-medium text-destructive";
const PRIMARY_BUTTON_CLASS =
  "inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold uppercase tracking-[0.06em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground";
const OUTLINE_BUTTON_CLASS =
  "inline-flex h-[52px] items-center justify-center gap-1.5 rounded-full border border-foreground/90 bg-transparent px-6 text-sm font-medium uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

// A full-width choice card: grey at rest, white with black text once picked.
function optionCardClass(selected: boolean) {
  return cn(
    "w-full rounded-3xl px-5 py-[18px] text-left transition-colors",
    selected ? "bg-white text-black" : "bg-card text-foreground hover:bg-secondary",
  );
}

function optionSubClass(selected: boolean) {
  return cn("mt-0.5 text-[13px] leading-snug", selected ? "text-black/60" : "text-muted-foreground");
}

// A multi-select pill. `invalid` marks a picked pill that breaks a rule (too many rest days).
function chipClass(selected: boolean, invalid = false) {
  return cn(
    "rounded-full px-[17px] py-2.5 text-sm whitespace-nowrap transition-colors",
    invalid
      ? "bg-destructive/15 text-destructive font-medium"
      : selected
        ? "bg-white text-black font-medium"
        : "bg-card text-muted-foreground hover:text-foreground",
  );
}

function inputClass(invalid: boolean, extra?: string) {
  return cn(
    "h-[52px] w-full min-w-0 rounded-full bg-card px-5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1",
    invalid ? "ring-1 ring-destructive focus:ring-destructive" : "focus:ring-foreground/40",
    extra,
  );
}

// A pill field holding an input plus a trailing unit ("kcal / day").
function suffixFieldClass(invalid: boolean) {
  return cn(
    "flex h-[52px] items-center gap-2 rounded-full bg-card px-5",
    invalid ? "ring-1 ring-destructive" : "focus-within:ring-1 focus-within:ring-foreground/40",
  );
}

function UnitToggle({
  value,
  onChange,
  testIdPrefix,
  className,
}: {
  value: string;
  onChange: (unit: string) => void;
  testIdPrefix: string;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-0.5 rounded-full bg-card p-1", className)} role="group" aria-label="Weight unit">
      {["kg", "lbs"].map((u) => (
        <button
          key={u}
          data-testid={`${testIdPrefix}-${u}`}
          onClick={() => onChange(u)}
          aria-pressed={value === u}
          className={cn(
            "h-full rounded-full px-4 text-[13px] transition-colors",
            value === u ? "bg-white text-black font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-[22px] bg-card px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground", className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
      <span>{children}</span>
    </div>
  );
}
