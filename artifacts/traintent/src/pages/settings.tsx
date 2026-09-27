import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, ChevronRight } from "lucide-react";
import {
  useGetProfile,
  useUpdateProfile,
  useDeleteAccount,
  useGetSubscription,
  useCreateCheckoutSession,
  useCreatePortalSession,
  useGetCalendarColors,
  useGetCurrentProgram,
  useListPrograms,
  useUpsertCalendarColor,
  getGetProfileQueryKey,
  getGetSubscriptionQueryKey,
  getGetCalendarColorsQueryKey,
  getGetCurrentProgramQueryKey,
  getGetWorkoutStatsQueryKey,
  getListProgramsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FIELD_LIMITS, MAX_PROFILE_NAME, rangeError } from "@/lib/fieldLimits";
import { buildDayColorOrder, dayColorHex } from "@/lib/dayColors";
import { toast } from "@/hooks/use-toast";
import { PROGRAM_TITLE_CLASS, ProgramBadge } from "@/pages/program/shared";


export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const profile = useGetProfile();
  const subscription = useGetSubscription();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();
  const calendarColors = useGetCalendarColors();
  const currentProgram = useGetCurrentProgram();
  const programs = useListPrograms();
  const upsertColor = useUpsertCalendarColor();

  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [age, setAge] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? user?.firstName ?? "");
      setWeight(profile.data.weight?.toString() ?? "");
      setWeightUnit(profile.data.weightUnit ?? "kg");
      setAge(profile.data.age?.toString() ?? "");
    }
  }, [profile.data, user?.firstName]);

  useEffect(() => {
    if (calendarColors.data) {
      const map: Record<string, string> = {};
      calendarColors.data.forEach((c) => { map[c.dayLabel] = c.hexColor; });
      setColorMap(map);
    }
  }, [calendarColors.data]);

  // Same plausibility bands the API enforces, checked here so the user sees the
  // problem under the field instead of a failed save.
  const ageError = rangeError(age, FIELD_LIMITS.age);
  const weightError = rangeError(weight, FIELD_LIMITS.weight);

  async function handleSave() {
    if (ageError || weightError) return;
    try {
      await updateProfile.mutateAsync({
        data: {
          name: name || undefined,
          weight: weight ? parseFloat(weight) : undefined,
          weightUnit,
          age: age ? parseInt(age) : undefined,
        },
      });
    } catch {
      // A profile saved before the ranges existed can still hold an impossible
      // value (age 999), which the server now rejects on the way back in. Without
      // this the save just silently did nothing.
      toast({
        title: "Couldn't save your profile",
        description: "Check that your age and weight look right, then try again.",
        variant: "destructive",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleModeSwitch() {
    if (!pendingMode) return;
    const target = pendingMode;
    await updateProfile.mutateAsync({ data: { mode: target } });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    // "Current program" and week-number stats are mode-scoped server-side,
    // so a mode switch must force both to refetch - otherwise dashboard.tsx
    // and program.tsx can keep serving stale data from the other mode.
    queryClient.invalidateQueries({ queryKey: getGetCurrentProgramQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutStatsQueryKey() });
    // calendar.tsx derives phase/calibration bands from the full program
    // list, which spans both mode lineages - stale cache here would keep
    // showing the other mode's phases after switching.
    queryClient.invalidateQueries({ queryKey: getListProgramsQueryKey() });
    setShowModeConfirm(false);
    setPendingMode(null);
    // Take the user straight to the now-active mode's program page instead of
    // stranding them on Settings. Switching to AI does NOT auto-generate a
    // program - the AI page routes on to AI setup when the profile isn't ready
    // yet (Independent onboarding skips the AI-only questions like experience),
    // so this always lands somewhere actionable rather than a dead end.
    setLocation(target === "ai" ? "/program/ai" : "/program/my");
  }

  async function handleUpgrade() {
    const origin = window.location.origin;
    const result = await createCheckout.mutateAsync({
      data: {
        plan: "pro",
        successUrl: `${origin}/dashboard?upgraded=1`,
        cancelUrl: `${origin}/settings`,
      },
    });
    if (result.url) window.location.href = result.url;
  }

  async function handleManageBilling() {
    const result = await createPortal.mutateAsync();
    if (result.url) window.open(result.url, "_blank");
  }

  // Application data first, Clerk user second. If the server call fails we stop
  // here: the account can still sign in and retry, whereas deleting the Clerk
  // user first would strand rows nobody can ever reach again.
  async function handleDeleteAccount() {
    try {
      await deleteAccount.mutateAsync();
    } catch {
      toast({
        title: "Couldn't delete your data",
        description: "Nothing was deleted. Please try again.",
        variant: "destructive",
      });
      return;
    }
    await user?.delete();
    await signOut({ redirectUrl: "/" });
  }

  async function handleColorChange(label: string, hex: string) {
    setColorMap((m) => ({ ...m, [label]: hex }));
    await upsertColor.mutateAsync({ data: { dayLabel: label, hexColor: hex } });
    queryClient.invalidateQueries({ queryKey: getGetCalendarColorsQueryKey() });
  }

  const currentMode = profile.data?.mode ?? "ai";

  // The days you can recolour: your current program's, in program order, plus
  // any label you've already recoloured (an older program's day, say). Program
  // days are listed even before they have a stored colour - the section used to
  // hang off the stored rows alone, so a user who had never customised anything
  // was shown nothing to customise.
  //
  // Stored colours are keyed by day label alone, with no lineage of their own,
  // so they span both modes: without the filter below, a user who recoloured
  // their Independent days and then switched to AI was offered those days here
  // alongside the AI ones. A label counts as this mode's only if some program
  // in this mode's lineage actually has a day by that name.
  const lineageIsAi = currentMode !== "independent";
  const lineageLabels = new Set(
    (programs.data ?? [])
      .filter((p) => !!p.aiGenerated === lineageIsAi)
      .flatMap((p) => ((p.days ?? []) as { label?: string | null }[]).map((d) => d?.label))
      .filter((label): label is string => !!label),
  );
  const programLabels = ((currentProgram.data?.days ?? []) as { label?: string | null }[]).map((d) => d?.label);
  const storedLabels = (calendarColors.data ?? [])
    .map((c) => c.dayLabel)
    .filter((label) => lineageLabels.has(label));
  const colorOrder = buildDayColorOrder(programLabels, storedLabels);
  const knownLabels = Object.keys(colorOrder);

  const isPro = subscription.data?.plan === "pro";

  return (
    <div className="mx-auto max-w-2xl space-y-7 p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
        {/* "You", matching the tab it lives under. */}
        <h1 className={PROGRAM_TITLE_CLASS}>You</h1>
        {/* An email address has no spaces to wrap at, so a long one runs off the
            side of a phone screen without break-words. */}
        <p className="mt-2 break-words text-[15px] text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
      </motion.div>

      {/* Profile */}
      <SettingsSection title="Profile" delay={0.06}>
        <GroupedList>
          <FieldRow label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_PROFILE_NAME}
              placeholder="Your name"
              aria-label="Display name"
              className={ROW_INPUT_CLASS}
              data-testid="input-name"
            />
          </FieldRow>
          <FieldRow label="Age" error={ageError} errorTestId="text-settings-age-error">
            <input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="-"
              aria-label="Age"
              aria-invalid={!!ageError}
              className={ROW_INPUT_CLASS}
              data-testid="input-settings-age"
            />
          </FieldRow>
          <FieldRow label="Weight" error={weightError} errorTestId="text-settings-weight-error">
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="-"
              aria-label="Weight"
              aria-invalid={!!weightError}
              className={ROW_INPUT_CLASS}
              data-testid="input-settings-weight"
            />
            {/* shrink-0 so the input gives up the space, not the toggle. */}
            <div className="flex shrink-0 rounded-full bg-secondary p-0.5" role="group" aria-label="Weight unit">
              {["kg", "lbs"].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setWeightUnit(u)}
                  aria-pressed={weightUnit === u}
                  data-testid={`settings-unit-${u}`}
                  className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                    weightUnit === u ? "bg-white font-medium text-black" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </FieldRow>
        </GroupedList>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending || !!ageError || !!weightError}
          className="mt-3 flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          data-testid="button-save-profile"
        >
          {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "Saved" : "Save changes"}
        </button>
      </SettingsSection>

      {/* Training mode */}
      <SettingsSection title="Training" delay={0.08}>
        <GroupedList>
          <RowShell>
            <div className="min-w-0 flex-1 truncate text-[15px]">Mode</div>
            {currentMode === "ai" ? <ProgramBadge kind="ai" /> : (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
                Independent
              </span>
            )}
          </RowShell>
          <ActionRow
            title={currentMode === "ai" ? "Switch to Independent" : "Switch to AI Coach"}
            subtitle={
              currentMode === "ai"
                ? "Build and manage your own program without AI."
                : "Get AI-generated programs and weekly adjustments."
            }
            onClick={() => { setPendingMode(currentMode === "ai" ? "independent" : "ai"); setShowModeConfirm(true); }}
          />
          {showModeConfirm && (
            <ConfirmSheet
              title={`Switch to ${pendingMode === "ai" ? "AI Coach" : "Independent"} mode?`}
              body={
                pendingMode === "ai"
                  ? "Your own program stays intact. We'll take you to AI Coach to set up and generate your program - it may ask a few quick questions first."
                  : "Your existing program will remain, but AI check-ins and adjustments will be disabled."
              }
              onCancel={() => { setShowModeConfirm(false); setPendingMode(null); }}
              confirm={
                <button
                  onClick={handleModeSwitch}
                  disabled={updateProfile.isPending}
                  className="h-10 flex-1 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  Confirm
                </button>
              }
            />
          )}
        </GroupedList>
      </SettingsSection>

      {/* Calendar colours */}
      {knownLabels.length > 0 && (
        <SettingsSection
          title="Calendar colours"
          caption="Each training day's colour, used on your calendar, your program page and in the editor."
          delay={0.1}
        >
          <GroupedList>
            {knownLabels.map((label) => {
              const currentColor = dayColorHex(label, colorOrder, colorMap);
              return (
                <RowShell key={label}>
                  <div className="min-w-0 flex-1 truncate text-[15px]">{label}</div>
                  <label className="relative shrink-0 cursor-pointer">
                    <span className="sr-only">Colour for {label}</span>
                    <span className="block h-7 w-7 rounded-full" style={{ background: currentColor }} />
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => handleColorChange(label, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </RowShell>
              );
            })}
          </GroupedList>
        </SettingsSection>
      )}

      {/* Subscription */}
      <SettingsSection title="Subscription" delay={0.12}>
        <GroupedList>
          {subscription.isLoading ? (
            <RowShell>
              <div className="flex-1 text-[15px] text-muted-foreground">Loading...</div>
            </RowShell>
          ) : (
            <>
              <RowShell>
                <div className="min-w-0 flex-1 truncate text-[15px]">Plan</div>
                {subscription.data?.currentPeriodEnd && (
                  <span className="whitespace-nowrap text-[13px] text-muted-foreground">
                    Renews {new Date(subscription.data.currentPeriodEnd).toLocaleDateString("en-GB")}
                  </span>
                )}
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
                  {isPro ? "Pro" : "Free"}
                </span>
              </RowShell>
              {!isPro ? (
                <ActionRow
                  title="Upgrade to Pro"
                  subtitle="Unlimited programs, weekly AI adjustments and full progress tracking."
                  trailing="£9.99/mo"
                  pending={createCheckout.isPending}
                  onClick={handleUpgrade}
                  testId="button-upgrade-pro"
                />
              ) : (
                <ActionRow
                  title="Manage billing"
                  icon={<ExternalLink className="h-4 w-4" strokeWidth={1.6} />}
                  pending={createPortal.isPending}
                  onClick={handleManageBilling}
                  testId="button-manage-billing"
                />
              )}
            </>
          )}
        </GroupedList>
      </SettingsSection>

      {/* Account. Destructive actions are red text, not a red box. */}
      <SettingsSection title="Account" delay={0.16}>
        <GroupedList testId="danger-zone">
          <ActionRow title="Sign out" onClick={() => signOut()} testId="button-sign-out" />
          <ActionRow
            title="Delete account"
            subtitle="Permanently delete your account and all data."
            tone="destructive"
            onClick={() => setShowDeleteConfirm(true)}
            testId="button-delete-account"
          />
          {showDeleteConfirm && (
            <ConfirmSheet
              title="Delete everything?"
              body="This will permanently delete your account and all training data. This cannot be undone."
              onCancel={() => setShowDeleteConfirm(false)}
              confirm={
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteAccount.isPending}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-destructive text-[13px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
                  data-testid="button-confirm-delete"
                >
                  {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Yes, delete everything
                </button>
              }
            />
          )}
        </GroupedList>
      </SettingsSection>
    </div>
  );
}

// Boxless, right-aligned value input: the row is the field, like iOS Settings.
const ROW_INPUT_CLASS =
  "min-w-0 flex-1 bg-transparent text-right text-[15px] text-muted-foreground placeholder:text-muted-foreground/50 focus:text-foreground focus:outline-none";

function SettingsSection({ title, caption, delay, children }: { title: string; caption?: string; delay: number; children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay }}
    >
      <h2 className="mb-3 text-[21px] font-light tracking-[-0.01em]">{title}</h2>
      {caption && <p className="-mt-1.5 mb-3 text-[12.5px] leading-relaxed text-muted-foreground">{caption}</p>}
      {children}
    </motion.section>
  );
}

function GroupedList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="overflow-hidden rounded-[26px] bg-card" data-testid={testId}>
      {children}
    </div>
  );
}

// The inset grouped row: the hairline sits on the inner block so it starts at
// the text inset, and the last row has none (see RosterRow on /program).
function RowShell({ children }: { children: ReactNode }) {
  return (
    <div className="group flex items-center pl-5">
      <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-b border-border py-3 pr-5 group-last:border-b-0">
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, error, errorTestId, children }: { label: string; error?: string | null; errorTestId?: string; children: ReactNode }) {
  return (
    <div className="group pl-5">
      <div className="border-b border-border pr-5 group-last:border-b-0">
        <label className="flex min-h-[52px] min-w-0 items-center gap-3 py-2">
          <span className="w-20 shrink-0 text-[15px]">{label}</span>
          {children}
        </label>
        {error && (
          <p className="-mt-1 pb-3 text-right text-[12.5px] text-destructive" data-testid={errorTestId}>{error}</p>
        )}
      </div>
    </div>
  );
}

function ActionRow({
  title, subtitle, trailing, icon, tone, pending, onClick, testId,
}: {
  title: string;
  subtitle?: string;
  trailing?: string;
  icon?: ReactNode;
  tone?: "destructive";
  pending?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="group flex w-full items-center pl-5 text-left transition-colors hover:bg-accent disabled:opacity-60"
      data-testid={testId}
    >
      <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-b border-border py-3 pr-4 group-last:border-b-0">
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[15px] ${tone === "destructive" ? "text-destructive" : "text-foreground"}`}>{title}</div>
          {subtitle && <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{subtitle}</div>}
        </div>
        {trailing && <span className="whitespace-nowrap text-[15px] text-muted-foreground">{trailing}</span>}
        <span className="shrink-0 text-muted-foreground">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon ?? <ChevronRight className="h-4 w-4" strokeWidth={1.6} />}
        </span>
      </div>
    </button>
  );
}

// A confirm step that opens inside the group as a bottom-sheet row.
function ConfirmSheet({ title, body, onCancel, confirm }: { title: string; body: string; onCancel: () => void; confirm: ReactNode }) {
  return (
    <div className="mx-2 mb-2 rounded-3xl bg-secondary p-4">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="h-10 flex-1 rounded-full border border-foreground/90 bg-transparent text-[13px] font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
        {confirm}
      </div>
    </div>
  );
}
