import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProfile,
  getGetProfileQueryKey,
  getGetGoalProgressQueryKey,
  type UserProfile,
} from "@workspace/api-client-react";
import { phaseSolid, phaseSoft } from "@/lib/phaseColors";
import {
  PHASE_OPTIONS,
  goalToPhase,
  phaseOption,
  phaseGoalWeightError,
  CARDIO_DAYS,
  orderCardioDays,
  type IndependentPhase,
} from "@/lib/independentTargets";
import { toast } from "@/hooks/use-toast";

// The editable "targets" box for Independent mode. AI mode gets these numbers
// from its generated program (see the narrative card in dashboard.tsx); here the
// user sets them and can edit whenever. Phase is stored as the profile goal, so
// changing it here also updates what the progress tracker aims at - which is why
// a goal-weight phase (bulk/diet) can't be saved without a target, and switching
// to maintenance clears the target only after an explicit confirm.
export function IndependentTargetsCard({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();
  const [editing, setEditing] = useState(false);

  const weightUnit = profile.weightUnit ?? "kg";

  // Draft state, seeded from the profile each time the form opens.
  const [phase, setPhase] = useState<IndependentPhase>(goalToPhase(profile.goal));
  const [goalWeight, setGoalWeight] = useState("");
  const [calories, setCalories] = useState("");
  const [steps, setSteps] = useState("");
  const [cardioDays, setCardioDays] = useState<string[]>([]);
  const [cardioMinutes, setCardioMinutes] = useState("");
  // Set when the user picks maintenance while a goal weight is present - we hold
  // the switch until they confirm discarding the target.
  const [confirmClear, setConfirmClear] = useState(false);

  const savedPhase = goalToPhase(profile.goal);
  const opt = phaseOption(savedPhase);
  const accent = phaseSolid(savedPhase);

  const hasAnyTarget =
    profile.dailyCalorieTarget != null ||
    profile.dailyStepTarget != null ||
    (profile.cardioDays?.length ?? 0) > 0;

  function openEditor() {
    setPhase(goalToPhase(profile.goal));
    setGoalWeight(profile.goalWeight != null ? String(profile.goalWeight) : "");
    setCalories(profile.dailyCalorieTarget != null ? String(profile.dailyCalorieTarget) : "");
    setSteps(profile.dailyStepTarget != null ? String(profile.dailyStepTarget) : "");
    setCardioDays(profile.cardioDays ?? []);
    setCardioMinutes(profile.cardioMinutes != null ? String(profile.cardioMinutes) : "");
    setConfirmClear(false);
    setEditing(true);
  }

  // Picking maintenance while a target exists asks first; otherwise switch
  // straight over. Bulk/diet keep whatever target is there for the user to fix.
  function pickPhase(next: IndependentPhase) {
    if (next === phase) return;
    if (next === "maintenance" && goalWeight.trim()) {
      setConfirmClear(true);
      return;
    }
    setPhase(next);
    if (next === "maintenance") setGoalWeight("");
  }

  function toggleDay(day: string) {
    setCardioDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  const goalError = phaseGoalWeightError(phase, profile.weight, goalWeight, weightUnit);

  async function handleSave() {
    if (goalError) return;
    const cal = calories ? parseInt(calories, 10) : null;
    const stp = steps ? parseInt(steps, 10) : null;
    const min = cardioMinutes ? parseInt(cardioMinutes, 10) : null;
    // Cardio only makes sense as "days + minutes"; if there are no days, drop
    // any leftover minutes so the two never disagree.
    const days = orderCardioDays(cardioDays);
    const gw = phase === "maintenance" ? null : parseFloat(goalWeight);
    try {
      await updateProfile.mutateAsync({
        data: {
          goal: phaseOption(phase).goal,
          goalWeight: gw != null && Number.isFinite(gw) ? gw : null,
          dailyCalorieTarget: cal != null && Number.isFinite(cal) ? cal : null,
          dailyStepTarget: stp != null && Number.isFinite(stp) ? stp : null,
          cardioDays: days,
          cardioMinutes: days.length && min != null && Number.isFinite(min) ? min : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      // Goal weight feeds the progress tracker - refresh it too.
      await queryClient.invalidateQueries({ queryKey: getGetGoalProgressQueryKey() });
      setEditing(false);
    } catch {
      toast({
        title: "Couldn't save your targets",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  // ---------------- EDIT MODE ----------------
  if (editing) {
    const draftAccent = phaseSolid(phase);
    const showGoalError = !!goalError && !!goalWeight.trim();
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-xl bg-card border-l-4 border border-border"
          style={{ borderLeftColor: draftAccent }}
          data-testid="card-independent-targets-edit"
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Edit your targets</h2>

          {/* Phase picker */}
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phase — pick your goal</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
            {PHASE_OPTIONS.map((o) => {
              const selected = phase === o.phase;
              const c = phaseSolid(o.phase);
              return (
                <button
                  key={o.phase}
                  type="button"
                  onClick={() => pickPhase(o.phase)}
                  className="text-left rounded-xl border p-3 transition-all"
                  style={{
                    borderColor: selected ? c : "hsl(var(--border))",
                    background: selected ? phaseSoft(o.phase) : "hsl(var(--secondary) / 0.4)",
                  }}
                  data-testid={`targets-phase-${o.phase}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
                    <span className="text-sm font-semibold text-foreground">{o.heading}</span>
                    {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: c }} />}
                  </div>
                  <div className="text-[11px] font-semibold mt-1.5" style={{ color: c }}>{o.tag}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{o.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Goal weight - required for bulk/diet, absent for maintenance */}
          {phase === "maintenance" ? (
            <div
              className="mt-3 rounded-xl px-3.5 py-3 text-xs text-muted-foreground leading-relaxed"
              style={{ border: `1px dashed ${phaseSolid("maintenance")}80`, background: phaseSoft("maintenance") }}
              data-testid="targets-maintenance-note"
            >
              <span className="text-foreground font-semibold">General fitness has no goal weight.</span> Your progress graph stops tracking toward a target until you pick Bulk or Diet again.
            </div>
          ) : (
            <div
              className="mt-3 rounded-xl px-3.5 py-3"
              style={{
                border: `1px solid ${showGoalError ? "hsl(var(--destructive))" : draftAccent}`,
                background: showGoalError ? "hsl(var(--destructive) / 0.07)" : phaseSoft(phase),
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Goal weight</span>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: showGoalError ? "hsl(var(--destructive))" : draftAccent }}
                >
                  Required
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 h-11 rounded-xl border border-border bg-secondary/40 px-3 focus-within:border-primary">
                <input
                  type="number"
                  step="0.1"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(e.target.value)}
                  placeholder={`Target ${weightUnit}`}
                  className="flex-1 min-w-0 bg-transparent text-base font-bold tabular-nums focus:outline-none"
                  data-testid="input-targets-goal-weight"
                />
                <span className="text-xs text-muted-foreground shrink-0">{weightUnit}</span>
              </div>
              {showGoalError ? (
                <p className="text-xs font-medium text-destructive mt-2" data-testid="text-targets-goal-error">{goalError}</p>
              ) : (
                profile.weight != null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Enter a target {phase === "bulk" ? "above" : "below"} your current {profile.weight} {weightUnit}.
                  </p>
                )
              )}
            </div>
          )}

          {/* Calories + steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 mb-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calorie target</label>
              <div className="mt-1.5 flex items-center gap-1.5 h-12 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0 bg-transparent text-lg font-bold tabular-nums focus:outline-none"
                  data-testid="input-targets-calories"
                />
                <span className="text-xs text-muted-foreground shrink-0">kcal / day</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step target</label>
              <div className="mt-1.5 flex items-center gap-1.5 h-12 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
                <input
                  type="number"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0 bg-transparent text-lg font-bold tabular-nums focus:outline-none"
                  data-testid="input-targets-steps"
                />
                <span className="text-xs text-muted-foreground shrink-0">steps / day</span>
              </div>
            </div>
          </div>

          {/* Cardio */}
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cardio — which days &amp; how long</label>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-2">
            <div className="flex flex-wrap gap-1.5">
              {CARDIO_DAYS.map((d) => {
                const on = cardioDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      on
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`targets-cardio-day-${d.toLowerCase()}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 h-11 w-32 shrink-0 rounded-xl border border-border bg-secondary/30 px-3 focus-within:border-primary">
              <input
                type="number"
                value={cardioMinutes}
                onChange={(e) => setCardioMinutes(e.target.value)}
                placeholder="min"
                className="flex-1 min-w-0 bg-transparent text-base font-bold tabular-nums focus:outline-none"
                data-testid="input-targets-cardio-minutes"
              />
              <span className="text-xs text-muted-foreground shrink-0">min</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Tap the days you'll do cardio; the minutes apply to each of those days.
          </p>

          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setEditing(false)}
              disabled={updateProfile.isPending}
              className="h-9 px-4 rounded-lg bg-secondary text-foreground font-semibold text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
              data-testid="button-targets-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateProfile.isPending || !!goalError}
              className="h-9 px-5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-targets-save"
            >
              {updateProfile.isPending ? "Saving..." : "Save targets"}
            </button>
          </div>
        </motion.div>

        {/* Confirm clearing the goal weight when switching to maintenance */}
        {confirmClear && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setConfirmClear(false)}
            data-testid="dialog-clear-goal-weight"
          >
            <div
              className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl"
              style={{ borderColor: `${phaseSolid("maintenance")}66` }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-2">Clear your goal weight?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                General fitness has no target weight, so switching will set your goal weight
                {profile.goalWeight != null ? ` (${profile.goalWeight} ${weightUnit})` : ""} back to scratch. Your progress
                graph will stop tracking toward a target — you can set a new one anytime by picking Bulk or Diet.
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="h-9 px-4 rounded-lg bg-secondary text-foreground font-semibold text-xs hover:bg-secondary/80 transition-colors"
                  data-testid="button-clear-goal-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setPhase("maintenance"); setGoalWeight(""); setConfirmClear(false); }}
                  className="h-9 px-5 rounded-lg bg-destructive text-destructive-foreground font-semibold text-xs hover:bg-destructive/90 transition-colors"
                  data-testid="button-clear-goal-confirm"
                >
                  Yes, clear it
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ---------------- VIEW MODE ----------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-xl bg-card border-l-4 border border-border"
      style={{ borderLeftColor: accent }}
      data-testid="card-independent-targets"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{opt.tag}</span>
          <span className="text-xs text-muted-foreground truncate">· {opt.heading.toLowerCase()}</span>
        </div>
        <button
          onClick={openEditor}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold border border-border hover:border-primary/50 hover:text-primary transition-colors shrink-0"
          data-testid="button-targets-edit"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </div>

      {hasAnyTarget || profile.goalWeight != null ? (
        <dl className="space-y-2">
          <div className="flex items-center justify-between text-sm py-1 border-b border-border/50">
            <dt className="text-muted-foreground">Goal weight</dt>
            <dd className="font-semibold text-foreground">
              {savedPhase === "maintenance"
                ? <span className="text-muted-foreground font-normal">— no target</span>
                : profile.goalWeight != null
                  ? <>{profile.goalWeight} <span className="text-muted-foreground font-medium text-xs">{weightUnit}</span></>
                  : <span className="text-muted-foreground font-normal">Not set</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between text-sm py-1 border-b border-border/50">
            <dt className="text-muted-foreground">Calorie target</dt>
            <dd className="font-semibold text-foreground">
              {profile.dailyCalorieTarget != null
                ? <>{profile.dailyCalorieTarget.toLocaleString()} <span className="text-muted-foreground font-medium text-xs">kcal / day</span></>
                : <span className="text-muted-foreground font-normal">Not set</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between text-sm py-1 border-b border-border/50">
            <dt className="text-muted-foreground">Step target</dt>
            <dd className="font-semibold text-foreground">
              {profile.dailyStepTarget != null
                ? <>{profile.dailyStepTarget.toLocaleString()} <span className="text-muted-foreground font-medium text-xs">steps / day</span></>
                : <span className="text-muted-foreground font-normal">Not set</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm py-1">
            <dt className="text-muted-foreground shrink-0">Cardio</dt>
            <dd className="font-semibold text-foreground text-right">
              {(profile.cardioDays?.length ?? 0) > 0 ? (
                <span className="inline-flex flex-wrap gap-1.5 justify-end items-center">
                  {orderCardioDays(profile.cardioDays!).map((d) => (
                    <span key={d} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">{d}</span>
                  ))}
                  {profile.cardioMinutes != null && (
                    <span className="text-xs text-muted-foreground font-medium">· {profile.cardioMinutes} min each</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground font-normal">None</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground py-2" data-testid="text-targets-empty">
          No targets set yet. Tap <span className="text-foreground font-medium">Edit</span> to add your calorie, step, and cardio targets — you can change them anytime.
        </p>
      )}
    </motion.div>
  );
}
