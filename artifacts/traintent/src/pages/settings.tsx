import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion } from "framer-motion";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  useGetProfile,
  useUpdateProfile,
  useDeleteAccount,
  useGetCalendarColors,
  useGetCurrentProgram,
  useListPrograms,
  useUpsertCalendarColor,
  getGetProfileQueryKey,
  getGetCalendarColorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FIELD_LIMITS, MAX_PROFILE_NAME, rangeError } from "@/lib/fieldLimits";
import { buildDayColorOrder, dayColorHex } from "@/lib/dayColors";
import { AI_MODE_ENABLED } from "@/lib/featureFlags";
import { toast } from "@/hooks/use-toast";


export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const profile = useGetProfile();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
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

  // Application data first, Clerk user second. If the server call fails we
  // stop here: the account can still sign in and retry, whereas deleting the
  // Clerk user first would strand rows nobody can ever reach again.
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

  // Flag-gated ahead of the mode test, the same way the dashboard gates its
  // check-in banner: this build has no AI Coach mode, so the only lineage a
  // user can be training in is the Independent one. Reading the stored mode
  // here would offer AI-lineage day labels to a profile row that still
  // carries mode "ai" from an earlier build or a shared database.
  const currentMode = AI_MODE_ENABLED ? (profile.data?.mode ?? "ai") : "independent";

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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        {/* An email address has no spaces to wrap at, so a long one runs off the
            side of a phone screen without break-words. */}
        <p className="text-muted-foreground mt-1 break-words">{user?.primaryEmailAddress?.emailAddress}</p>
      </motion.div>

      {/* Profile */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.06 }}
        className="p-5 rounded-xl bg-card border border-border space-y-5"
      >
        <h2 className="font-semibold text-foreground">Profile</h2>

        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-1.5">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_PROFILE_NAME}
            placeholder="Your name"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            data-testid="input-name"
          />
        </div>

        {/* Side by side only from sm up. Two columns on a phone left the weight
            field ~40px wide and clipped the kg/lbs toggle against the card edge,
            because the toggle's buttons take ~84px of the ~135px column. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">Age</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 28"
              className={`w-full px-4 py-2.5 rounded-xl border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none ${
                ageError ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
              }`}
              data-testid="input-settings-age"
            />
            {ageError && (
              <p className="mt-1.5 text-sm font-medium text-destructive" data-testid="text-settings-age-error">{ageError}</p>
            )}
          </div>
          <div className="min-w-0">
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">Weight</label>
            <div className="flex gap-2 min-w-0">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 80"
                className={`flex-1 min-w-0 px-4 py-2.5 rounded-xl border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none ${
                  weightError ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                }`}
                data-testid="input-settings-weight"
              />
              {/* shrink-0: overflow-hidden zeroes this box's automatic minimum
                  size, so without it the toggle shrinks and clips "lbs" in half
                  rather than letting the input next to it give up the space. */}
              <div className="flex shrink-0 rounded-xl border border-border overflow-hidden">
                {["kg", "lbs"].map((u) => (
                  <button
                    key={u}
                    onClick={() => setWeightUnit(u)}
                    data-testid={`settings-unit-${u}`}
                    className={`px-3 py-2.5 text-sm font-medium transition-colors ${
                      weightUnit === u
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            {weightError && (
              <p className="mt-1.5 text-sm font-medium text-destructive" data-testid="text-settings-weight-error">{weightError}</p>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending || !!ageError || !!weightError}
          className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
          data-testid="button-save-profile"
        >
          {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </motion.section>

      {/* Calendar colours */}
      {knownLabels.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
          className="p-5 rounded-xl bg-card border border-border space-y-4"
        >
          <div>
            <h2 className="font-semibold text-foreground">Calendar colours</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each training day's colour, used on your calendar, your program page and in the editor.
            </p>
          </div>

          <div className="space-y-3">
            {knownLabels.map((label) => {
              const currentColor = dayColorHex(label, colorOrder, colorMap);
              return (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <label className="relative cursor-pointer">
                    <div
                      className="w-8 h-8 rounded-lg border-2 border-border overflow-hidden cursor-pointer hover:border-primary transition-colors"
                      style={{ background: currentColor }}
                    />
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => handleColorChange(label, e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Danger zone */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.16 }}
        className="p-5 rounded-xl bg-card border border-destructive/20 space-y-4"
        data-testid="danger-zone"
      >
        <h2 className="font-semibold text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Danger zone
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sign out of your account</p>
          </div>
          <button
            onClick={() => signOut()}
            className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            data-testid="button-sign-out"
          >
            Sign out
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all data</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="h-9 px-4 rounded-lg border border-destructive/40 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="button-delete-account"
          >
            Delete
          </button>
        </div>

        {showDeleteConfirm && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium mb-3">
              This will permanently delete your account and all training data. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-9 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteAccount.isPending}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="button-confirm-delete"
              >
                {deleteAccount.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, delete everything
              </button>
            </div>
          </div>
        )}
      </motion.section>
    </div>
  );
}
