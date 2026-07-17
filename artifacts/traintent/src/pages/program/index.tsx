import { Redirect } from "wouter";
import { useGetProfile } from "@workspace/api-client-react";

// /program lands on the active training mode's program page. The two pages
// are deliberately separate routes over separate program lineages (AI vs
// manual) - this keeps every existing "/program" link working while making
// the split explicit.
export default function ProgramRedirect() {
  const { data: profile, isLoading } = useGetProfile();

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading your program...</div>
      </div>
    );
  }

  return <Redirect to={profile?.mode === "independent" ? "/program/my" : "/program/ai"} replace />;
}
