import { Redirect } from "wouter";
import { useGetProfile } from "@workspace/api-client-react";
import { ProgramPageShell } from "./shared";

// /program lands on the active training mode's program page. The two pages
// are deliberately separate routes over separate program lineages (AI vs
// manual) - this keeps every existing "/program" link working while making
// the split explicit.
export default function ProgramRedirect() {
  const { data: profile, isLoading } = useGetProfile();

  if (isLoading) {
    return (
      <ProgramPageShell>
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Loading your program...</div>
      </ProgramPageShell>
    );
  }

  return <Redirect to={profile?.mode === "independent" ? "/program/my" : "/program/ai"} replace />;
}
