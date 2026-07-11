import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Calibration() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg mx-auto text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Calibration walkthrough</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Step 1 is on its way - we're still building the guided walkthrough for your first
          session. For now, head to your dashboard to get started.
        </p>
        <Button className="w-full h-12 text-sm font-semibold" onClick={() => setLocation("/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
