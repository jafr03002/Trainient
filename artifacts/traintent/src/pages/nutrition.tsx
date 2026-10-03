import { motion } from "framer-motion";
import { Salad } from "lucide-react";

// Placeholder for the Nutrition tab. It holds the slot in the tab bar (where
// Progress used to be) until the page itself is designed.
export default function Nutrition() {
  return (
    <div className="min-h-page bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-7 p-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <h1 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground">Nutrition</h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">Calories, protein and meals</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="rounded-[26px] bg-card px-6 py-14 text-center"
          data-testid="nutrition-coming-soon"
        >
          <Salad className="mx-auto mb-4 h-12 w-12 text-muted-foreground" strokeWidth={1.4} />
          <h2 className="mb-2 text-2xl font-light tracking-[-0.01em] text-foreground">Coming soon</h2>
          <p className="text-[15px] text-muted-foreground">Nutrition tracking will live here.</p>
        </motion.div>
      </div>
    </div>
  );
}
