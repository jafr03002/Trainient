import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Dumbbell, Clock, Zap, Info } from "lucide-react";
import { useGetCurrentProgram } from "@workspace/api-client-react";
import { Link } from "wouter";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rpe: number;
  restSeconds: number;
  cue: string;
  muscle: string;
};

type ProgramDay = {
  dayNumber: number;
  label: string;
  focus: string;
  exercises: Exercise[];
};

function ExerciseCard({ ex }: { ex: Exercise }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className="bg-secondary/20 border border-border rounded-xl overflow-hidden"
      data-testid={`exercise-card-${ex.name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                {ex.muscle}
              </span>
            </div>
            <h3 className="font-semibold text-foreground">{ex.name}</h3>
          </div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            data-testid={`button-info-${ex.name.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Info className="w-4 h-4" />
            {expanded ? <ChevronUp className="w-3 h-3 mt-0.5" /> : <ChevronDown className="w-3 h-3 mt-0.5" />}
          </button>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Dumbbell className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{ex.sets} × {ex.reps}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">RPE {ex.rpe}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{ex.restSeconds}s rest</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-3 italic">"{ex.cue}"</p>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-4 border-t border-border/50 pt-3"
        >
          <div className="text-sm text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">Primary muscle:</span> {ex.muscle}</p>
            <p className="text-xs mt-2">Focus on full range of motion and controlled eccentric tempo. Avoid compensating with other muscle groups. Stop 1–2 reps before failure unless RPE target says otherwise.</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function Program() {
  const { data: program, isLoading, isError } = useGetCurrentProgram();
  const [activeDay, setActiveDay] = useState(0);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading your program...</div>
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-16">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">No program yet</h2>
          <p className="text-muted-foreground mb-6">Complete onboarding to generate your AI program.</p>
          <Link href="/onboarding">
            <button className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
              Start onboarding
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const days = program.days as ProgramDay[];
  const day = days[activeDay];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">{program.programName}</h1>
        <p className="text-muted-foreground mt-1">{program.splitType} · Week {program.weekNumber}</p>
        {program.aiNotes && (
          <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm text-muted-foreground">
            {program.aiNotes}
          </div>
        )}
      </motion.div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="program-day-tabs">
        {days.map((d, i) => (
          <button
            key={d.dayNumber}
            onClick={() => setActiveDay(i)}
            data-testid={`tab-day-${d.dayNumber}`}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeDay === i
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Exercises */}
      {day && (
        <motion.div
          key={activeDay}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-foreground">{day.focus}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{day.exercises.length} exercises</p>
            </div>
            <Link href="/log">
              <button
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-start-workout-program"
              >
                Start workout
              </button>
            </Link>
          </div>

          {day.exercises.map((ex) => (
            <ExerciseCard key={ex.name} ex={ex} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
