import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import {
  LayoutDashboard,
  House,
  Dumbbell,
  Activity,
  LineChart,
  Settings,
  Calendar,
  CircleUser,
  Play,
  LogOut,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useGetProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

// Desktop sidebar: every destination.
const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Program", href: "/program", icon: Dumbbell },
  { name: "Log Workout", href: "/log", icon: Activity },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Progress", href: "/progress", icon: LineChart },
  { name: "Settings", href: "/settings", icon: Settings },
];

// Mobile tab bar: four tabs either side of a central Start action. All six
// sidebar entries only fit a phone at 9px labels and ~30px touch targets, so
// Log and Calendar leave the bar - a session is started from the program page
// (which is where Start goes), and Calendar is reached from the dashboard. Both
// routes still exist. `match` is every route that lights the tab, so the
// section a page belongs to stays lit on it.
type MobileTab = { name: string; href: string; icon: LucideIcon; match: string[] };
const mobileTabsLeft: MobileTab[] = [
  { name: "Home", href: "/dashboard", icon: House, match: ["/dashboard", "/calendar", "/checkin"] },
  { name: "Program", href: "/program", icon: Dumbbell, match: ["/program", "/log"] },
];
const mobileTabsRight: MobileTab[] = [
  { name: "Progress", href: "/progress", icon: LineChart, match: ["/progress"] },
  { name: "You", href: "/settings", icon: CircleUser, match: ["/settings"] },
];

// Prefix match keeps a tab lit on its sub-routes (e.g. Program on /program/ai
// and /program/my).
function isAt(location: string, href: string): boolean {
  return location === href || location.startsWith(`${href}/`);
}

type NavTourCtx = {
  registerEl: (href: string, variant: "desktop" | "mobile", el: HTMLAnchorElement | null) => void;
  getEl: (href: string) => HTMLElement | null;
  registerClickHandler: (href: string, handler: (() => void) | null) => void;
};
export const NavTourContext = createContext<NavTourCtx | null>(null);

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Lets a page point a CoachmarkTour step at a real nav link (e.g. "Program"),
// even though Layout - not the page - owns that DOM node. Resolves to
// whichever of the desktop sidebar / mobile bottom-nav copy is currently
// visible, since both are always mounted simultaneously. Resolves to null when
// neither is - e.g. "/calendar" on a phone, which has no tab in the mobile bar.
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
  //
  // `isPending`, not `isLoading`: the query cache is restored from storage at
  // startup (src/App.tsx), and while that restore runs - or while offline with
  // nothing cached - the query is pending but not fetching, which `isLoading`
  // reports as settled. A restored profile settles this immediately, which is
  // the point of persisting it.
  const profileSettled = !profileQuery.isPending;
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
    return (
      <main className="min-h-dvh bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
    );
  }

  if (!profileSettled || needsOnboarding) {
    return (
      <main className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  const renderTab = (tab: MobileTab) => {
    const Icon = tab.icon;
    const active = tab.match.some((href) => isAt(location, href));
    return (
      <Link
        key={tab.href}
        href={tab.href}
        ref={(el) => navTourCtx.registerEl(tab.href, "mobile", el)}
        onClick={() => clickHandlersRef.current[tab.href]?.()}
        aria-current={active ? "page" : undefined}
        className={tabClass(active)}
      >
        <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 2} />
        {tab.name}
      </Link>
    );
  };

  return (
    <NavTourContext.Provider value={navTourCtx}>
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar hidden md:flex flex-col">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-display font-bold text-xl tracking-tight text-foreground">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              T
            </div>
            Trainient
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isAt(location, item.href);

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

        <div className="p-4 border-t border-sidebar-border">
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

      {/* Main Content. On a phone the bottom padding clears the tab bar, the
          Start button's overhang above it, and the home indicator / gesture bar
          under it; the side and top insets matter in landscape and standalone. */}
      <main className="flex-1 md:ml-64 relative min-h-dvh overflow-x-hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Nav. The bar's own padding keeps the tabs above the
          home indicator / gesture bar while its background runs under it. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-sidebar-border bg-sidebar/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <nav aria-label="Main" className="mx-auto grid h-16 max-w-md grid-cols-5 px-1">
          {mobileTabsLeft.map(renderTab)}

          {/* Start goes to the program page, where a session is started
              deliberately (startSession in src/lib/workoutSession.ts). It must
              never start or log a session itself. Not registered as the
              "/program" tour target - the Program tab is - but it is the same
              destination, so a tour waiting on "/program" hears it too. */}
          <Link
            href="/program"
            aria-label="Start a workout"
            onClick={() => clickHandlersRef.current["/program"]?.()}
            className="group flex flex-col items-center justify-center gap-1 text-xs font-semibold text-foreground focus-visible:outline-none"
          >
            <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground glow-primary transition-transform group-active:scale-95 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring">
              <Play className="h-6 w-6 translate-x-px fill-current" />
            </span>
            Start
          </Link>

          {mobileTabsRight.map(renderTab)}
        </nav>
      </div>
    </div>
    </NavTourContext.Provider>
  );
}
