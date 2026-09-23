import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { hsl, voltageFonts, voltageRadius } from "@/theme/tokens";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthShell } from "@/components/AuthShell";

import Landing from "@/pages/landing";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import ProgramRedirect from "@/pages/program";
import AiProgram from "@/pages/program/ai";
import MyProgram from "@/pages/program/my";
import Log from "@/pages/log";
import Checkin from "@/pages/checkin";
import Progress from "@/pages/progress";
import Settings from "@/pages/settings";
import Calendar from "@/pages/calendar";
import NotFound from "@/pages/not-found";

// Straight from the env - the old host-derived key selection only existed for
// Replit's Clerk FAPI proxy. With our own Clerk instance this is just the key.
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

// Voltage palette (docs/design/voltage-style.md). Clerk's appearance variables
// can't read CSS custom properties, so they take literal values - from the same
// token module that writes the CSS variables, so the two can't drift.
const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "none" as const,
  },
  variables: {
    colorPrimary: hsl("primary"),
    colorForeground: hsl("foreground"),
    colorMutedForeground: hsl("muted-foreground"),
    colorDanger: hsl("destructive"),
    colorBackground: hsl("card"),
    colorInput: hsl("input"),
    colorInputForeground: hsl("foreground"),
    colorNeutral: hsl("muted"),
    fontFamily: voltageFonts.sans,
    borderRadius: voltageRadius,
  },
  // Clerk's own styles win the cascade over these classes, so any override
  // that has to stick - widths above all: `.cl-cardBox` ships a fixed 25rem
  // that overflows a phone - carries `!`.
  elements: {
    rootBox: "w-full min-w-0 flex justify-center",
    cardBox: "!bg-transparent !shadow-none !border-0 !w-full !min-w-0 !max-w-[400px] overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none !w-full !min-w-0",
    footer: "!shadow-none !border-0 !bg-transparent !bg-none !rounded-none",
    headerTitle: "text-foreground font-display",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground",
    footerActionLink: "text-primary hover:text-primary/90",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-chart-2",
    alertText: "text-destructive-foreground",
    socialButtonsBlockButton: "bg-card border-border hover:bg-secondary",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary",
    formFieldInput: "bg-input border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary",
    footerAction: "border-t border-border pt-4 mt-4",
    dividerLine: "bg-border",
    alert: "bg-destructive/20 border-destructive",
    otpCodeFieldInput: "bg-input border-border text-foreground",
    formFieldRow: "mb-4",
    main: "p-6",
  },
};

function SignInPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthShell>
  );
}

// A cache that outlives a user switch is a data leak, and the persisted copy
// outlives far more than the in-memory one: it survives reloads, sign-outs
// while the app is closed, and a different person signing in on the same
// browser. So whose data it holds is recorded next to it, and on every Clerk
// update it must match the signed-in user - or no user and no cache at all.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      const switchedUser =
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId;
      // Covers the cold start, where there is no previous user in memory but
      // the cache restored from storage may belong to someone else.
      const owner = readCacheOwner();
      const foreignCache = owner !== undefined && owner !== userId;
      if (switchedUser || foreignCache) {
        queryClient.clear();
        // clear() only empties memory; the persisted copy would otherwise sit
        // on disk until the next throttled write, restorable by a reload.
        void queryPersister.removeClient();
      }
      writeCacheOwner(userId);
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ApiAuthWirer() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

// Last-known server state survives a reload: a cold start - or a gym basement
// with no signal - renders the previous data straight away and refetches behind
// it, instead of a spinner or a blank page.
const QUERY_CACHE_KEY = "trainient-query-cache";
const QUERY_CACHE_OWNER_KEY = "trainient-query-cache-owner";
// A training week: long enough to open last week's program offline.
const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

// Discards the persisted cache whenever lib/api-spec/openapi.yaml changes (see
// vite.config.ts), so no page is handed data in a shape it no longer expects.
declare const __QUERY_CACHE_BUSTER__: string;

// localStorage can be missing or throw (privacy modes, blocked site data). The
// app then just runs without persistence.
function getStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
const storage = getStorage();

// undefined = unknown (no storage): the owner check is skipped rather than
// wiping the in-memory cache on every Clerk update.
function readCacheOwner(): string | null | undefined {
  try {
    return storage ? storage.getItem(QUERY_CACHE_OWNER_KEY) : undefined;
  } catch {
    return undefined;
  }
}

function writeCacheOwner(userId: string | null) {
  try {
    if (userId) storage?.setItem(QUERY_CACHE_OWNER_KEY, userId);
    else storage?.removeItem(QUERY_CACHE_OWNER_KEY);
  } catch {
    // Storage full or blocked - the owner check degrades to the in-memory one.
  }
}

const queryPersister = createSyncStoragePersister({
  storage,
  key: QUERY_CACHE_KEY,
  // Over quota: drop the oldest query and try again rather than persist nothing.
  retry: removeOldestQuery,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // At least maxAge, or restored queries are garbage-collected straight
      // back out of the cache they were restored into.
      gcTime: QUERY_CACHE_MAX_AGE,
      // Every mount still refetches (TanStack's default, kept on purpose):
      // pages rely on navigating to a screen to pick up what another screen
      // changed, and persistence already removes the spinner - cached data
      // renders immediately while the refetch runs behind it.
      staleTime: 0,
    },
  },
});

function App() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/onboarding`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: QUERY_CACHE_MAX_AGE, buster: __QUERY_CACHE_BUSTER__ }}
      >
        <ClerkQueryClientCacheInvalidator />
        <ApiAuthWirer />
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              
              {/* Authenticated Routes wrapped in Layout.
                  Must be `/*?`, not `/:rest*`: wouter compiles patterns with
                  regexparam, where a `:param` segment is always a single
                  segment (`/([^/]+?)`) and the trailing `*` is just part of
                  the param name. `/:rest*` therefore never matches nested
                  paths like /program/ai or /program/my - the Switch falls
                  through and the whole authenticated app renders nothing. */}
              <Route path="/*?">
                {() => (
                  <>
                    <Show when="signed-in">
                      <Layout>
                        <Switch>
                          <Route path="/onboarding" component={Onboarding} />
                          <Route path="/dashboard" component={Dashboard} />
                          <Route path="/program" component={ProgramRedirect} />
                          <Route path="/program/ai" component={AiProgram} />
                          <Route path="/program/my" component={MyProgram} />
                          <Route path="/log" component={Log} />
                          <Route path="/checkin" component={Checkin} />
                          <Route path="/calendar" component={Calendar} />
                          <Route path="/progress" component={Progress} />
                          <Route path="/settings" component={Settings} />
                          <Route component={NotFound} />
                        </Switch>
                      </Layout>
                    </Show>
                    <Show when="signed-out">
                      <Redirect to="/sign-in" />
                    </Show>
                  </>
                )}
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
