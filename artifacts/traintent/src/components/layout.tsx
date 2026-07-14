import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
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

type NavTourCtx = {
  registerEl: (href: string, variant: "desktop" | "mobile", el: HTMLAnchorElement | null) => void;
  getEl: (href: string) => HTMLElement | null;
  registerClickHandler: (href: string, handler: (() => void) | null) => void;
};
const NavTourContext = createContext<NavTourCtx | null>(null);

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Lets a page point a CoachmarkTour step at a real nav link (e.g. "Program"),
// even though Layout - not the page - owns that DOM node. Resolves to
// whichever of the desktop sidebar / mobile bottom-nav copy is currently
// visible, since both are always mounted simultaneously.
export function useNavTourTarget(href: string): RefObject<HTMLElement | null> {
  const ctx = useContext(NavTourContext);
  return useMemo(
    () => ({ get current() { return ctx?.getEl(href) ?? null; } }),
    [ctx, href],
  ) as RefObject<HTMLElement | null>;
}

// Fires `handler` when the real nav link for `href` is clicked, in addition
// to the normal navigation. Pass `null` when the tour step shouldn't be
// intercepting that link (e.g. once the tour isn't showing).
export function useNavTourClick(href: string, handler: (() => void) | null): void {
  const ctx = useContext(NavTourContext);
  useEffect(() => {
    ctx?.registerClickHandler(href, handler);
    return () => ctx?.registerClickHandler(href, null);
  }, [ctx, href, handler]);
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const profileQuery = useGetProfile();

  const navElsRef = useRef<Record<string, { desktop?: HTMLAnchorElement | null; mobile?: HTMLAnchorElement | null }>>({});
  const clickHandlersRef = useRef<Record<string, (() => void) | null>>({});
  const navTourCtx = useMemo<NavTourCtx>(
    () => ({
      registerEl: (href, variant, el) => {
        navElsRef.current[href] = { ...navElsRef.current[href], [variant]: el };
      },
      getEl: (href) => {
        const els = navElsRef.current[href];
        if (els?.desktop && isVisible(els.desktop)) return els.desktop;
        if (els?.mobile && isVisible(els.mobile)) return els.mobile;
        return null;
      },
      registerClickHandler: (href, handler) => {
        clickHandlersRef.current[href] = handler;
      },
    }),
    [],
  );

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

  // Don't redirect on a stale 404 that's currently being refetched - the error
  // lingers in cache until the in-flight fetch resolves, and bouncing on it
  // would send a freshly-onboarded user back to /onboarding mid-refetch.
  useEffect(() => {
    if (profileSettled && !profileQuery.isFetching && needsOnboarding && location !== "/onboarding") {
      setLocation("/onboarding", { replace: true });
    }
  }, [profileSettled, profileQuery.isFetching, needsOnboarding, location, setLocation]);

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
    <NavTourContext.Provider value={navTourCtx}>
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
                ref={(el) => navTourCtx.registerEl(item.href, "desktop", el)}
                onClick={() => clickHandlersRef.current[item.href]?.()}
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
                ref={(el) => navTourCtx.registerEl(item.href, "mobile", el)}
                onClick={() => clickHandlersRef.current[item.href]?.()}
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
    </NavTourContext.Provider>
  );
}
