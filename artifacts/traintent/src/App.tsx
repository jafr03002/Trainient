import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";

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

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
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
// can't read CSS custom properties, so the token HSL values are inlined here —
// keep them in sync with the `.dark` block in src/index.css.
const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "none" as const,
  },
  variables: {
    colorPrimary: "hsl(212, 96%, 62%)",
    colorForeground: "hsl(210, 40%, 98%)",
    colorMutedForeground: "hsl(214, 22%, 64%)",
    colorDanger: "hsl(0, 72%, 51%)",
    colorBackground: "hsl(224, 42%, 7%)",
    colorInput: "hsl(222, 32%, 18%)",
    colorInputForeground: "hsl(210, 40%, 98%)",
    colorNeutral: "hsl(222, 32%, 14%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
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

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/onboarding`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
