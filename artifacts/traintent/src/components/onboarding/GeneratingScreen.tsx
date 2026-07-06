import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell } from "lucide-react";

const STATUS_MESSAGES = [
  "Laying out the schedule…",
  "Setting up workouts…",
  "Structuring your split…",
  "Balancing muscle groups…",
  "Dialing in sets and reps…",
  "Almost there…",
];

const MESSAGE_INTERVAL_MS = 1800;

export function GeneratingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-8"
      >
        <Dumbbell className="w-7 h-7 text-primary" />
      </motion.div>

      <h2 className="text-xl font-bold text-foreground mb-3">Building your program</h2>

      <div className="h-6 relative w-full max-w-xs">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-sm text-muted-foreground absolute inset-x-0"
          >
            {STATUS_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
