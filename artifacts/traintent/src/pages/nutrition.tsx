import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BatteryCharging, ChevronDown, Info, Moon, Sandwich, Sunrise, Zap, type LucideIcon } from "lucide-react";
import { useGetCurrentProgram, useGetProfile } from "@workspace/api-client-react";
import { PROGRAM_TITLE_CLASS, ProgramBadge } from "@/pages/program/shared";
import {
  SAMPLE_PLAN,
  formatAmount,
  kcalOf,
  planTotals,
  scalePlan,
  type Macros,
  type Meal,
  type MealSlot,
} from "@/lib/nutritionPlan";

const SECTION_TITLE_CLASS = "text-[21px] font-light tracking-[-0.01em] text-foreground";

const SLOT_ICONS: Record<MealSlot, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sandwich,
  pre_workout: Zap,
  post_workout: BatteryCharging,
  dinner: Moon,
};

// The day's plan: the daily target as a log-page stat band, then one card per
// meal that opens into its macros and foods. Runs on the sample plan in
// lib/nutritionPlan.ts until meal plans exist in the backend.
export default function Nutrition() {
  const profileQuery = useGetProfile();
  const program = useGetCurrentProgram();
  const profile = profileQuery.data;
  const isIndependent = profile?.mode === "independent";

  // Independent users set their own target on the dashboard; the AI lineage's
  // lives on the program.
  const kcalTarget = isIndependent ? profile?.dailyCalorieTarget : program.data?.dailyCalorieTarget;
  const plan = scalePlan(SAMPLE_PLAN, kcalTarget);
  const totals = planTotals(plan);

  const phase = !isIndependent ? program.data?.shortTermPhase?.replace(/_/g, " ") : null;
  const week = !isIndependent ? program.data?.weekInPhase : null;

  // One meal open at a time, like the inset rows on the log page.
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);

  return (
    <div className="min-h-page bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <h1 className={PROGRAM_TITLE_CLASS}>Nutrition</h1>
          {(phase || program.data?.aiGenerated) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
              {phase && (
                <span className="capitalize">
                  {phase}
                  {week != null ? ` · Week ${week}` : ""}
                </span>
              )}
              {!isIndependent && program.data?.aiGenerated && <ProgramBadge kind="ai" />}
            </div>
          )}
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.04 }}
          className="overflow-hidden rounded-[26px] bg-card"
          data-testid="card-nutrition-daily-target"
        >
          <div className="px-5 pb-3.5 pt-[18px] text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Daily target</div>
          <div className="flex border-t border-border">
            {/* The real target when there is one: the scaled meals round to within a few kcal of it. */}
            <StatCell value={(kcalTarget ?? totals.kcal).toLocaleString()} label="kcal" lead />
            <StatCell value={totals.protein} unit="g" label="Protein" />
            <StatCell value={totals.carbs} unit="g" label="Carbs" />
            <StatCell value={totals.fat} unit="g" label="Fat" />
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.08 }}
        >
          <h2 className={`${SECTION_TITLE_CLASS} mb-3`}>Meals</h2>
          <div className="space-y-2.5">
            {plan.meals.map((meal) => (
              <MealCard
                key={meal.slot}
                meal={meal}
                open={openSlot === meal.slot}
                onToggle={() => setOpenSlot((cur) => (cur === meal.slot ? null : meal.slot))}
              />
            ))}
          </div>
        </motion.section>

        <div className="flex gap-2.5 rounded-[22px] bg-card px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground" data-testid="notice-sample-plan">
          <Info className="mt-px h-4 w-4 shrink-0" strokeWidth={1.6} />
          <span>
            This is a sample meal plan
            {kcalTarget != null ? `, sized to your ${kcalTarget.toLocaleString()} kcal target` : ""}. Your own plan will
            replace it here.
          </span>
        </div>
      </div>
    </div>
  );
}

// One column of the log page's stat band: a big light number over a caps label.
// The kcal column leads at a fixed width; the gram columns share the rest, with
// the log page's tighter pl-3.5 so "Protein" fits at 390px.
function StatCell({ value, unit, label, lead }: { value: number | string; unit?: string; label: string; lead?: boolean }) {
  return (
    <div className={`min-w-0 py-3.5 ${lead ? "flex-[0_0_100px] pl-5" : "flex-1 border-l border-border pl-3.5"}`}>
      <div className="whitespace-nowrap text-[26px] font-light leading-[1.1] tracking-[-0.02em] tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[13px] tracking-normal text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}

function MealCard({ meal, open, onToggle }: { meal: Meal; open: boolean; onToggle: () => void }) {
  const Icon = SLOT_ICONS[meal.slot];
  const panelId = `meal-${meal.slot}`;
  return (
    <div className="overflow-hidden rounded-[26px] bg-card" data-testid={`card-meal-${meal.slot}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3.5 py-3.5 pl-3.5 pr-[18px] text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]">{meal.label}</span>
        <span className="text-right">
          <span className="block text-2xl font-light leading-none tracking-[-0.02em] tabular-nums">{kcalOf(meal.macros)}</span>
          <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-muted-foreground">kcal</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.6}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <MacroBand macros={meal.macros} />
            <ul>
              {meal.foods.map((food) => (
                <li key={food.name} className="flex justify-between gap-3 border-t border-border px-5 py-[11px] text-sm">
                  <span className="min-w-0 truncate">{food.name}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatAmount(food)}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MacroBand({ macros }: { macros: Macros }) {
  const cells: [string, number][] = [
    ["Protein", macros.protein],
    ["Carbs", macros.carbs],
    ["Fat", macros.fat],
  ];
  return (
    <div className="flex border-t border-border">
      {cells.map(([label, grams], i) => (
        <div key={label} className={`min-w-0 flex-1 py-3.5 pl-5 ${i > 0 ? "border-l border-border" : ""}`}>
          <div className="text-[26px] font-light leading-[1.1] tracking-[-0.02em] tabular-nums">
            {grams}
            <span className="ml-0.5 text-[13px] tracking-normal text-muted-foreground">g</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}
