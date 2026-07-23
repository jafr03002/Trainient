import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell } from "lucide-react";
import { useUser } from "@clerk/react";
import { useGetCurrentProgram, useGetProfile } from "@workspace/api-client-react";
import {
  InactiveLineageNotice,
  ProgramWeekView,
  ManualProgramBuilder,
  programDraftKey,
  loadProgramDraft,
} from "./shared";

// The build-your-own program page. Reads and writes the manual lineage
// (aiGenerated=false) exclusively - creating or editing a program here can
// never touch the AI Coach's program, and an AI generation or weekly check-in
// can never replace what's built here. Building is allowed in either training
// mode precisely because the lineages are separate.
export default function MyProgram() {
  const { data: program, isLoading } = useGetCurrentProgram({ lineage: "manual" });
  const profileQuery = useGetProfile();
  const { user } = useUser();
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState(false);

  const isIndependent = profileQuery.data?.mode === "independent";

  // Drop the user back into the builder, mid-edit, if a reload or crash
  // interrupted them before they saved - a draft existing is exactly that
  // signal. Only checked once: after this, Cancel (which intentionally
  // leaves the draft in place) must not immediately snap back into it.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current || isLoading || profileQuery.isLoading || !user?.id) return;
    autoResumedRef.current = true;

    if (program) {
      if (loadProgramDraft(programDraftKey(user.id, program.id))) setEditing(true);
    } else {
      if (loadProgramDraft(programDraftKey(user.id, "new"))) setBuilding(true);
    }
  }, [isLoading, profileQuery.isLoading, user?.id, program]);

  if (isLoading || profileQuery.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading your program...</div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Program</h1>
          <p className="text-muted-foreground mt-1">Build your own training program.</p>
        </motion.div>

        <AnimatePresence>
          {!building ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">No program yet</h2>
              <p className="text-muted-foreground mb-8">Create your first training program with your own days and exercises.</p>
              <button
                onClick={() => setBuilding(true)}
                className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Create your program
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <ManualProgramBuilder onSaved={() => setBuilding(false)} onCancel={() => setBuilding(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Edit mode - reuse the builder, prefilled with this program. Past logged
  // sessions are snapshots, so editing the program never changes them.
  // Editing is safe in either mode: the update endpoint only ever touches
  // manual (aiGenerated=false) rows.
  if (editing) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Edit program</h1>
          <p className="text-muted-foreground mt-1">Change days, exercises, sets and muscles. Past sessions stay as they were.</p>
        </motion.div>
        <ManualProgramBuilder
          editProgram={{ id: program.id, programName: program.programName, splitType: program.splitType, days: program.days }}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {!isIndependent && (
        <InactiveLineageNotice>
          This is your own program, kept exactly as you built it. You're training in AI Coach
          mode right now, so workouts log against the AI program.
        </InactiveLineageNotice>
      )}

      <ProgramWeekView
        program={program}
        canStartWorkout={isIndependent}
        tourEnabled={isIndependent}
        onEdit={() => setEditing(true)}
        badge={
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">
            Custom
          </span>
        }
      />
    </div>
  );
}
