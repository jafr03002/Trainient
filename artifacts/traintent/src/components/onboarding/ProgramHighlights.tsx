import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type ProgramHighlight = { title: string; detail: string };

export function ProgramHighlights({ highlights }: { highlights: ProgramHighlight[] }) {
  if (!highlights.length) return null;

  return (
    <div className="space-y-2.5" data-testid="list-program-highlights">
      {highlights.map((h, i) => (
        <motion.div
          key={h.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="p-4 rounded-xl bg-primary/5 border border-primary/15"
        >
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">{h.title}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{h.detail}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
