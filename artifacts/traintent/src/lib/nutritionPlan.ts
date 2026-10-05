// The nutrition plan behind the /nutrition page.
//
// There is no meal-plan data in the backend yet: programs only carry a
// `dailyCalorieTarget`. Until macros and meals are generated server-side, the
// page runs on SAMPLE_PLAN below, scaled to the user's real calorie target so
// the numbers it shows at least add up to what their program asks for.

export type MealSlot = "breakfast" | "lunch" | "pre_workout" | "post_workout" | "dinner";

export type Macros = { protein: number; carbs: number; fat: number };

export type Food = {
  name: string;
  /** How much, in `unit`. Scaled with the plan when the unit is a measure. */
  amount: number;
  unit: "g" | "ml" | "pcs" | "medium" | "bowl";
};

export type Meal = {
  slot: MealSlot;
  label: string;
  macros: Macros;
  foods: Food[];
};

export type NutritionPlan = { meals: Meal[] };

/** Atwater factors: 4 kcal per gram of protein or carbs, 9 per gram of fat. */
export function kcalOf(m: Macros): number {
  return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
}

export function planTotals(plan: NutritionPlan): Macros & { kcal: number } {
  const sum = plan.meals.reduce(
    (acc, meal) => ({
      protein: acc.protein + meal.macros.protein,
      carbs: acc.carbs + meal.macros.carbs,
      fat: acc.fat + meal.macros.fat,
    }),
    { protein: 0, carbs: 0, fat: 0 },
  );
  return { ...sum, kcal: plan.meals.reduce((acc, meal) => acc + kcalOf(meal.macros), 0) };
}

// A ~2,450 kcal training-day plan: 180 P / 270 C / 72 F.
export const SAMPLE_PLAN: NutritionPlan = {
  meals: [
    {
      slot: "breakfast",
      label: "Breakfast",
      macros: { protein: 42, carbs: 68, fat: 14 },
      foods: [
        { name: "Oats", amount: 80, unit: "g" },
        { name: "Whey protein", amount: 30, unit: "g" },
        { name: "Blueberries", amount: 100, unit: "g" },
        { name: "Peanut butter", amount: 15, unit: "g" },
      ],
    },
    {
      slot: "lunch",
      label: "Lunch",
      macros: { protein: 55, carbs: 78, fat: 18 },
      foods: [
        { name: "Chicken breast", amount: 180, unit: "g" },
        { name: "Jasmine rice, dry", amount: 90, unit: "g" },
        { name: "Broccoli", amount: 150, unit: "g" },
        { name: "Olive oil", amount: 10, unit: "ml" },
      ],
    },
    {
      slot: "pre_workout",
      label: "Pre-workout",
      macros: { protein: 22, carbs: 56, fat: 2 },
      foods: [
        { name: "Greek yogurt 0%", amount: 200, unit: "g" },
        { name: "Banana", amount: 1, unit: "medium" },
        { name: "Honey", amount: 15, unit: "g" },
      ],
    },
    {
      slot: "post_workout",
      label: "Post-workout",
      macros: { protein: 32, carbs: 48, fat: 3 },
      foods: [
        { name: "Whey protein", amount: 35, unit: "g" },
        { name: "Rice cakes", amount: 3, unit: "pcs" },
        { name: "Jam", amount: 20, unit: "g" },
      ],
    },
    {
      slot: "dinner",
      label: "Dinner",
      macros: { protein: 29, carbs: 20, fat: 35 },
      foods: [
        { name: "Salmon", amount: 150, unit: "g" },
        { name: "Potatoes", amount: 300, unit: "g" },
        { name: "Side salad", amount: 1, unit: "bowl" },
        { name: "Avocado", amount: 0.5, unit: "medium" },
      ],
    },
  ],
};

/**
 * The sample plan resized to `kcalTarget`: every macro and every weighed food
 * goes up or down by the same ratio. Countable foods (a banana, a bowl) stay as
 * they are. Without a target the sample is returned unchanged.
 */
export function scalePlan(plan: NutritionPlan, kcalTarget: number | null | undefined): NutritionPlan {
  const base = planTotals(plan).kcal;
  if (kcalTarget == null || kcalTarget <= 0 || base <= 0) return plan;
  const ratio = kcalTarget / base;
  return {
    meals: plan.meals.map((meal) => ({
      ...meal,
      macros: {
        protein: Math.round(meal.macros.protein * ratio),
        carbs: Math.round(meal.macros.carbs * ratio),
        fat: Math.round(meal.macros.fat * ratio),
      },
      foods: meal.foods.map((food) =>
        food.unit === "g" || food.unit === "ml"
          ? { ...food, amount: Math.max(5, Math.round((food.amount * ratio) / 5) * 5) }
          : food,
      ),
    })),
  };
}

export function formatAmount(food: Food): string {
  if (food.unit === "medium") return food.amount === 0.5 ? "½" : `${food.amount} medium`;
  if (food.unit === "bowl") return food.amount === 1 ? "1 bowl" : `${food.amount} bowls`;
  return `${food.amount} ${food.unit}`;
}
