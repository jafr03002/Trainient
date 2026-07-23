import { useState } from "react";
import { motion } from "framer-motion";
import { Dumbbell } from "lucide-react";
import {
  useGetCurrentProgram,
  useGetProfile,
  useGenerateProgram,
  getGetCurrentProgramQueryKey,
  type Program,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { GeneratingScreen } from "@/components/onboarding/GeneratingScreen";
import { PresentationDeck } from "@/components/onboarding/PresentationDeck";
import { type ProgramFeedback } from "@/components/onboarding/SatisfactionGate";
import { InactiveLineageNotice, ProgramWeekView } from "./shared";

// The AI Coach program page. Reads and writes the AI lineage (aiGenerated=true)
// exclusively - the explicit lineage param means this page shows the same
// program regardless of which training mode is active, and nothing done in
// Independent mode (building/editing a manual program) can ever change or
// replace what appears here.
export default function AiProgram() {
  const { data: program, isLoading } = useGetCurrentProgram({ lineage: "ai" });
  const profileQuery = useGetProfile();
  const queryClient = useQueryClient();
  const generateProgram = useGenerateProgram();
  const [phase, setPhase] = useState<"idle" | "generating" | "presentation">("idle");
  const [freshProgram, setFreshProgram] = useState<Program | null>(null);
  const [regenerateCount, setRegenerateCount] = useState(0);
  const [, setLocation] = useLocation();

  const isAiModeActive = profileQuery.data?.mode !== "independent";
  // AI onboarding is the only place goal/experience get set - Independent
  // mode's shorter flow skips them, so a mode switch can land here with a
  // profile that exists but isn't ready for the AI to generate from yet.
  const aiProfileReady = !!profileQuery.data?.goal && !!profileQuery.data?.experience;

  async function handleGenerate() {
    setPhase("generating");
    try {
      const result = await generateProgram.mutateAsync({});
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
      setFreshProgram(result);
      setPhase("presentation");
    } catch {
      setPhase("idle");
    }
  }

  async function handleRegenerateFeedback(feedback: ProgramFeedback) {
    setPhase("generating");
    setRegenerateCount((c) => c + 1);
    try {
      const result = await generateProgram.mutateAsync({ data: { feedback } });
      queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
      setFreshProgram(result);
    } catch {
      // keep the previous program on screen; the error banner in the deck reports it
    }
    setPhase("presentation");
  }

  if (phase === "generating") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <GeneratingScreen />
        </div>
      </div>
    );
  }

  if (phase === "presentation" && freshProgram) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center px-4 py-12">
          <PresentationDeck
            program={freshProgram}
            goal={profileQuery.data?.goal ?? ""}
            weightUnit={profileQuery.data?.weightUnit ?? undefined}
            onSatisfied={() => setLocation("/dashboard")}
            onSubmitFeedback={handleRegenerateFeedback}
            isSubmitting={generateProgram.isPending}
            showRegenerateNudge={regenerateCount >= 3}
            error={generateProgram.isError}
          />
        </div>
      </div>
    );
  }

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
        <div className="text-center py-16">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          {!aiProfileReady ? (
            <>
              <h2 className="text-xl font-bold text-foreground mb-2">A few things to set before AI can build your program</h2>
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                We don't have your goal, experience, or equipment yet - the AI coach needs those to write a program.
              </p>
              <Link href="/onboarding">
                <button className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                  Set up AI coaching
                </button>
              </Link>
            </>
          ) : isAiModeActive ? (
            <>
              <h2 className="text-xl font-bold text-foreground mb-2">No AI program yet</h2>
              <p className="text-muted-foreground mb-8">Your AI coach has what it needs - generate your first program to get started.</p>
              <button
                onClick={handleGenerate}
                className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                Generate my program
              </button>
              {generateProgram.isError && (
                <p className="text-sm text-destructive mt-4">Something went wrong generating your program. Try again.</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground mb-2">No AI program yet</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                You're in Independent mode. Switch to AI Coach mode in{" "}
                <Link href="/settings" className="text-primary hover:underline">Settings</Link>{" "}
                to have a program generated for you - your own program stays untouched either way.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {!isAiModeActive && (
        <InactiveLineageNotice>
          This is your AI Coach program, kept exactly as it was. You're training in Independent
          mode right now, so workouts log against your own program.
        </InactiveLineageNotice>
      )}

      <ProgramWeekView
        program={program}
        canStartWorkout={isAiModeActive}
        tourEnabled={isAiModeActive}
        badge={
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            AI Coach
          </span>
        }
      />
    </div>
  );
}
