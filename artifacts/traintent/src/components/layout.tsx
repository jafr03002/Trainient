import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { 
  LayoutDashboard, 
  Dumbbell, 
  Activity, 
  ClipboardCheck, 
  LineChart, 
  Settings, 
  LogOut 
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Program", href: "/program", icon: Dumbbell },
  { name: "Log Workout", href: "/log", icon: Activity },
  { name: "Check-in", href: "/checkin", icon: ClipboardCheck },
  { name: "Progress", href: "/progress", icon: LineChart },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();

  // Hide layout for onboarding
  if (location === "/onboarding") {
    return <main className="min-h-screen bg-background">{children}</main>;
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
            Traintent
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
      <main className="flex-1 md:ml-64 relative min-h-screen overflow-x-hidden">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/80 backdrop-blur-md z-50">
        <nav className="flex items-center justify-around p-3">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
