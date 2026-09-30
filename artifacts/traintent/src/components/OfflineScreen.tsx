import { WifiOff } from "lucide-react";

// Shown instead of the sign-in page when there is no session to show because
// Clerk couldn't be reached - usually no signal. Clerk's browser SDK can't
// restore a session offline, so without this a signed-in user opening the app
// in a gym basement would be told to sign in again.
export function OfflineScreen() {
  return (
    <main className="theme-sessions flex min-h-dvh flex-col items-center justify-center bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center text-foreground">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-card">
        <WifiOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-3xl font-light tracking-[-0.01em]">You're offline</h1>
      <p className="mt-3 max-w-xs text-muted-foreground">
        Trainient needs a connection to sign you in. Your program will be right here once you're back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-8 h-12 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
      >
        Try again
      </button>
    </main>
  );
}
