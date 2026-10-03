import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  House,
  Dumbbell,
  Activity,
  LineChart,
  Settings,
  Calendar,
  CircleUser,
  Salad,
  Play,
  X,
  LogOut,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useGetProfile, useGetCurrentProgram, getGetCurrentProgramQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { StartWorkoutMenu } from "@/components/StartWorkoutMenu";
import { useActiveSession } from "@/hooks/useActiveSession";
import { startSession } from "@/lib/workoutSession";
import { isPreCalibrationLocked } from "@/lib/calibration";
import { formatClock } from "@/lib/sessionDuration";

// Desktop sidebar: every destination.
const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Program", href: "/program", icon: Dumbbell },
  { name: "Log Workout", href: "/log", icon: Activity },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Progress", href: "/progress", icon: LineChart },
  { name: "Nutrition", href: "/nutrition", icon: Salad },
  { name: "Settings", href: "/settings", icon: Settings },
];

// Mobile tab bar: four tabs either side of a central Start action. All six
// sidebar entries only fit a phone at 9px labels and ~30px touch targets, so
// Log and Calendar leave the bar - Start stands in for Log (it opens the
// workout picker, or returns to the session in progress), and Calendar is
// reached from the dashboard. Both routes still exist. Progress also left the
// bar for Nutrition; it opens from the program page header and lights Program.
// `match` is every route that lights the tab, so the section a page belongs to
// stays lit on it.
type MobileTab = { name: string; href: string; icon: LucideIcon; match: string[] };
const mobileTabsLeft: MobileTab[] = [
  { name: "Home", href: "/dashboard", icon: House, match: ["/dashboard", "/calendar", "/checkin"] },
  { name: "Program", href: "/program", icon: Dumbbell, match: ["/program", "/log", "/progress"] },
];
const mobileTabsRight: MobileTab[] = [
  { name: "Nutrition", href: "/nutrition", icon: Salad, match: ["/nutrition"] },
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

// Start's icon while a session runs. Filled, not a lucide outline: it replaces
// the filled play glyph in the same disc, so it carries the same weight.
function SolidDumbbell({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <rect x="1.5" y="8.5" width="3" height="7" rx="1.2" />
      <rect x="4.5" y="5" width="4.5" height="14" rx="1.8" />
      <rect x="8.5" y="10" width="7" height="4" rx="1" />
      <rect x="15" y="5" width="4.5" height="14" rx="1.8" />
      <rect x="19.5" y="8.5" width="3" height="7" rx="1.2" />
    </svg>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const profileQuery = useGetProfile();
  const { user } = useUser();

  // Start's two jobs. With a session in progress it is the way back into it,
  // from any page, until the session is finished or cancelled on the log page.
  // Without one it opens the workout picker over the current page. The program
  // is the same one the log page logs against (the active mode's lineage).
  const activeSession = useActiveSession(user?.id, location);
  const currentProgramQuery = useGetCurrentProgram(undefined, {
    query: { enabled: !!profileQuery.data, queryKey: getGetCurrentProgramQueryKey() },
  });
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const closeStartMenu = useCallback(() => setStartMenuOpen(false), []);
  const startButtonRef = useRef<HTMLButtonElement>(null);

  // Navigating anywhere (a tab tap - the bar stays usable under the picker -
  // or Back) closes the picker, and so does a session appearing from another tab.
  useEffect(() => setStartMenuOpen(false), [location]);
  useEffect(() => {
    if (activeSession) setStartMenuOpen(false);
  }, [activeSession]);

  // The live label under Start. Derived from `startedAt` every tick, never
  // counted up, so it matches the log page's clock after a backgrounded tab.
  const [now, setNow] = useState(() => Date.now());
  const sessionStartedAt = activeSession?.startedAt ?? null;
  useEffect(() => {
    if (sessionStartedAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionStartedAt]);

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

  // Onboarding and the weekly check-in are focused, one-question-per-screen
  // flows: full screen, no sidebar or tab bar. The check-in carries its own
  // close button.
  if (location === "/onboarding" || location === "/checkin") {
    return (
      <main className="min-h-dvh bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] [--page-inset:calc(env(safe-area-inset-top)+env(safe-area-inset-bottom))]">
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

  // Sessions: selected is white, the rest muted - no colour for "active".
  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
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
        <Icon className="h-6 w-6" strokeWidth={active ? 2 : 1.6} />
        {tab.name}
      </Link>
    );
  };

  return (
    <NavTourContext.Provider value={navTourCtx}>
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar hidden md:flex flex-col">
        {/* No brand mark here: the dashboard's date arc carries the logo. */}
        <nav aria-label="Main" className="flex-1 px-4 pt-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isAt(location, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                ref={(el) => navTourCtx.registerEl(item.href, "desktop", el)}
                onClick={() => clickHandlersRef.current[item.href]?.()}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-[15px] transition-colors ${
                  isActive
                    ? "bg-white text-black font-medium"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.6} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="w-5 h-5 mr-3" strokeWidth={1.6} />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content. On a phone the bottom padding clears the tab bar, the
          Start button's overhang above it, and the home indicator / gesture bar
          under it; the side and top insets matter in landscape and standalone.
          --page-inset repeats that vertical padding for pages sized with
          min-h-page (src/index.css). */}
      <main className="flex-1 md:ml-64 relative min-h-dvh overflow-x-hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 [--page-inset:calc(env(safe-area-inset-top)+5.5rem+env(safe-area-inset-bottom))] md:[--page-inset:env(safe-area-inset-top)]">
        {children}
      </main>

      {/* Mobile Bottom Nav. The bar's own padding keeps the tabs above the
          home indicator / gesture bar while its background runs under it. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-sidebar-border bg-sidebar/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <nav aria-label="Main" className="mx-auto grid h-16 max-w-md grid-cols-5 px-1">
          {mobileTabsLeft.map(renderTab)}

          {/* Start. It must never start or log a session by itself: a session
              begins only when a day is picked from the menu (startSession in
              src/lib/workoutSession.ts) - the same deliberate press as the
              program page's Start workout. */}
          {activeSession ? (
            <Link
              href={`/log?day=${activeSession.dayNumber}`}
              aria-label="Resume your workout"
              className="group flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground focus-visible:outline-none"
              data-testid="nav-resume-workout"
            >
              {/* The same raised disc, now a solid dumbbell inside a thin teal
                  arc that turns slowly while the session runs. */}
              <span className="relative -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black ring-4 ring-black transition-transform group-active:scale-95 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-[7px] rounded-full border-2 border-[hsl(var(--sessions-cyan))] border-r-transparent motion-safe:animate-spin motion-safe:[animation-duration:3s]"
                />
                <SolidDumbbell className="h-6 w-6" />
              </span>
              <span className="tabular-nums text-[hsl(var(--sessions-cyan))]">
                {sessionStartedAt != null ? formatClock((now - sessionStartedAt) / 1000) : "Resume"}
              </span>
            </Link>
          ) : (
            <button
              ref={startButtonRef}
              type="button"
              aria-label={startMenuOpen ? "Close workout picker" : "Start a workout"}
              aria-expanded={startMenuOpen}
              aria-haspopup="dialog"
              onClick={() => {
                if (startMenuOpen) {
                  setStartMenuOpen(false);
                  return;
                }
                const program = currentProgramQuery.data;
                // Nothing to pick from - no program yet, or one locked until its
                // start date. The program page explains both and is the only
                // place to act on them, so Start goes there as it always did
                // (and a tour waiting on "/program" still hears it).
                if (!program || !program.days?.length || isPreCalibrationLocked(program, new Date())) {
                  clickHandlersRef.current["/program"]?.();
                  setLocation("/program");
                  return;
                }
                setStartMenuOpen(true);
              }}
              className="group flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground focus-visible:outline-none"
              data-testid="nav-start-workout"
            >
              {/* The dashboard's play circle, raised: white with a black play, no glow. */}
              <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black ring-4 ring-black transition-transform group-active:scale-95 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring">
                {startMenuOpen ? (
                  <X className="h-6 w-6" strokeWidth={2.2} />
                ) : (
                  <Play className="h-6 w-6 translate-x-px fill-current" />
                )}
              </span>
              {startMenuOpen ? "Close" : "Start"}
            </button>
          )}

          {mobileTabsRight.map(renderTab)}
        </nav>
      </div>

      <AnimatePresence
        onExitComplete={() => {
          // Hand focus back to Start - unless a day was picked, which navigated.
          if (!activeSession) startButtonRef.current?.focus();
        }}
      >
        {startMenuOpen && currentProgramQuery.data && (
          <StartWorkoutMenu
            key="start-menu"
            days={currentProgramQuery.data.days as any[]}
            onClose={closeStartMenu}
            onPick={(dayNumber) => {
              const program = currentProgramQuery.data!;
              if (user?.id) startSession(user.id, program.id, dayNumber);
              setStartMenuOpen(false);
              // `start=1` carries the press across, exactly as the program
              // page does, so the logger still begins the day if the write
              // above didn't land (see useWorkoutSession).
              setLocation(`/log?day=${dayNumber}&start=1`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
    </NavTourContext.Provider>
  );
}
