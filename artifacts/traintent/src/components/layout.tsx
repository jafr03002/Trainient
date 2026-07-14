import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import {
  LayoutDashboard,
  Dumbbell,
  Activity,
  ClipboardCheck,
  LineChart,
  Settings,
  Calendar,
  LogOut,
  Loader2
} from "lucide-react";
import { useGetProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Program", href: "/program", icon: Dumbbell },
  { name: "Log Workout", href: "/log", icon: Activity },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Progress", href: "/progress", icon: LineChart },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const profileQuery = useGetProfile();

  // No profile row means onboarding (mode selection + the rest of the
  // wizard) was never completed - the row is only created at the end of
  // onboarding.tsx's handleFinish. Bounce back there instead of letting a
  // signed-in-but-not-onboarded user land on the dashboard or any other
  // authenticated page. Hold off rendering the page itself (not just the
  // redirect) until that's known, otherwise a not-yet-onboarded user sees a
  // flash of the destination page while the profile fetch is still in
  // flight - this query resolves once per session (cached after), so the
  // wait is a one-time thing on first load, not on every navigation.
  const profileSettled = !profileQuery.isLoading;
  const needsOnboarding = profileQuery.error?.status === 404;

  useEffect(() => {
    if (profileSettled && needsOnboarding && location !== "/onboarding") {
      setLocation("/onboarding", { replace: true });
    }
  }, [profileSettled, needsOnboarding, location, setLocation]);

  if (location === "/onboarding") {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  if (!profileSettled || needsOnboarding) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              T
            </div>
            Trainient
          </Link>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 relative min-h-screen overflow-x-hidden pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/90 backdrop-blur-md z-50">
        <nav className="flex items-center justify-around px-2 py-2">
          {navItems.slice(0, 6).map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{item.name.replace(" ", "\n")}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
