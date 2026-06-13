import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProfile } from "@workspace/api-client-react";
import { useGenerateProgram } from "@workspace/api-client-react";

const GOALS = [
  { value: "hypertrophy", label: "Build muscle", sub: "Hypertrophy" },
  { value: "strength", label: "Get stronger", sub: "Strength" },
  { value: "fat_loss", label: "Lose fat & get lean", sub: "Fat loss" },
  { value: "general", label: "General fitness", sub: "Overall health" },
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

const MUSCLES = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Glutes", "Core", "No preference"];

const SPLIT_HINTS: Record<number, string> = {
  2: "Upper / Lower split",
  3: "Push / Pull / Legs",
  4: "Upper / Lower × 2 — optimal for most goals",
  5: "Upper / Lower + accessory day",
  6: "Push / Pull / Legs × 2 — high frequency",
};

type FormState = {
  goal: string;
  experience: string;
  trainingDays: number;
  equipment: string[];
  age: string;
  sex: string;
  weight: string;
  weightUnit: string;
  injuries: string;
  priorityMuscles: string[];
};

const INITIAL: FormState = {
  goal: "",
  experience: "",
  trainingDays: 4,
  equipment: [],
  age: "",
  sex: "",
  weight: "",
  weightUnit: "kg",
  injuries: "",
  priorityMuscles: [],
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [, setLocation] = useLocation();
  const createProfile = useCreateProfile();
  const generateProgram = useGenerateProgram();

  const totalSteps = 7;
  const progress = ((step + 1) / totalSteps) * 100;

  function canAdvance() {
    if (step === 0) return !!form.goal;
    if (step === 1) return !!form.experience;
    if (step === 3) return form.equipment.length > 0;
    return true;
  }

  function toggleEquipment(item: string) {
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(item) ? f.equipment.filter((e) => e !== item) : [...f.equipment, item],
    }));
  }

  function toggleMuscle(item: string) {
    setForm((f) => {
      if (item === "No preference") return { ...f, priorityMuscles: ["No preference"] };
      const filtered = f.priorityMuscles.filter((m) => m !== "No preference");
      if (filtered.includes(item)) return { ...f, priorityMuscles: filtered.filter((m) => m !== item) };
      if (filtered.length >= 3) return f;
      return { ...f, priorityMuscles: [...filtered, item] };
    });
  }

  async function handleGenerate() {
    await createProfile.mutateAsync({
      data: {
        goal: form.goal,
        experience: form.experience,
        trainingDays: form.trainingDays,
        equipment: form.equipment,
        age: form.age ? parseInt(form.age) : undefined,
        sex: form.sex || undefined,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        weightUnit: form.weightUnit,
        injuries: form.injuries || undefined,
        priorityMuscles: form.priorityMuscles,
      },
    });
    await generateProgram.mutateAsync();
    setLocation("/dashboard");
  }

  const isPending = createProfile.isPending || generateProgram.isPending;

  const variants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
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
              {step === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">What's your main goal?</h2>
                  <p className="text-muted-foreground mb-8">This shapes every aspect of your program.</p>
                  <div className="grid grid-cols-1 gap-3">
                    {GOALS.map((g) => (
                      <button
                        key={g.value}
                        data-testid={`goal-${g.value}`}
                        onClick={() => setForm((f) => ({ ...f, goal: g.value }))}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.goal === g.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-foreground hover:border-border/80 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="font-semibold">{g.label}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{g.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
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

              {step === 2 && (
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
                  <div className="p-4 rounded-xl bg-secondary/30 border border-border text-sm text-muted-foreground">
                    {SPLIT_HINTS[form.trainingDays]}
                  </div>
                </div>
              )}

              {step === 3 && (
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

              {step === 4 && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Body stats</h2>
                  <p className="text-muted-foreground mb-8">Optional — helps the AI calibrate intensity.</p>
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
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Sex</label>
                      <div className="flex gap-2">
                        {["Male", "Female", "Prefer not to say"].map((s) => (
                          <button
                            key={s}
                            data-testid={`sex-${s.toLowerCase().replace(/\s+/g, "-")}`}
                            onClick={() => setForm((f) => ({ ...f, sex: s.toLowerCase() }))}
                            className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
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
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Injuries or limitations</label>
                      <textarea
                        value={form.injuries}
                        onChange={(e) => setForm((f) => ({ ...f, injuries: e.target.value }))}
                        placeholder="e.g. bad lower back, knee pain"
                        rows={3}
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                        data-testid="input-injuries"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Priority muscle groups</h2>
                  <p className="text-muted-foreground mb-8">Pick up to 3. The AI adds extra volume here.</p>
                  <div className="flex flex-wrap gap-2">
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
                  {form.priorityMuscles.length === 3 && (
                    <p className="text-xs text-muted-foreground mt-4">Maximum 3 selected</p>
                  )}
                </div>
              )}

              {step === 6 && (
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Ready to build your program</h2>
                  <p className="text-muted-foreground mb-8">Here's what your AI coach will use.</p>
                  <div className="space-y-3 mb-8">
                    {[
                      { label: "Goal", value: GOALS.find((g) => g.value === form.goal)?.label },
                      { label: "Experience", value: EXPERIENCE.find((e) => e.value === form.experience)?.label },
                      { label: "Training days", value: `${form.trainingDays} days/week` },
                      { label: "Equipment", value: form.equipment.join(", ") },
                      form.age && { label: "Age", value: form.age },
                      form.sex && { label: "Sex", value: form.sex },
                      form.weight && { label: "Weight", value: `${form.weight} ${form.weightUnit}` },
                      form.injuries && { label: "Injuries", value: form.injuries },
                      form.priorityMuscles.length && { label: "Priority muscles", value: form.priorityMuscles.join(", ") },
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

                  <Button
                    className="w-full h-12 text-base font-semibold"
                    onClick={handleGenerate}
                    disabled={isPending}
                    data-testid="button-generate-program"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {createProfile.isPending ? "Saving profile..." : "Building your program..."}
                      </>
                    ) : (
                      "Generate my program"
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {step < 6 && (
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
        </div>
      </div>
    </div>
  );
}
