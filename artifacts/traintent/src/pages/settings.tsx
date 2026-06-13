import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import {
  useGetProfile,
  useUpdateProfile,
  useGetSubscription,
  useCreateCheckoutSession,
  useCreatePortalSession,
  getGetProfileQueryKey,
  getGetSubscriptionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const profile = useGetProfile();
  const subscription = useGetSubscription();
  const updateProfile = useUpdateProfile();
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();

  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [age, setAge] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? user?.firstName ?? "");
      setWeight(profile.data.weight?.toString() ?? "");
      setWeightUnit(profile.data.weightUnit ?? "kg");
      setAge(profile.data.age?.toString() ?? "");
    }
  }, [profile.data, user?.firstName]);

  async function handleSave() {
    await updateProfile.mutateAsync({
      data: {
        name: name || undefined,
        weight: weight ? parseFloat(weight) : undefined,
        weightUnit,
        age: age ? parseInt(age) : undefined,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">{user?.primaryEmailAddress?.emailAddress}</p>
      </motion.div>

      {/* Profile */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="p-5 rounded-xl bg-card border border-border space-y-5"
      >
        <h2 className="font-semibold text-foreground">Profile</h2>

        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-1.5">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            data-testid="input-name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">Age</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 28"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              data-testid="input-settings-age"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">Weight</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 80"
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-secondary/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                data-testid="input-settings-weight"
              />
              <div className="flex rounded-xl border border-border overflow-hidden">
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
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
          data-testid="button-save-profile"
        >
          {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </motion.section>

      {/* Subscription */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-5 rounded-xl bg-card border border-border space-y-4"
      >
        <h2 className="font-semibold text-foreground">Subscription</h2>

        {subscription.isLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                subscription.data?.plan === "pro"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary/50 text-muted-foreground border border-border"
              }`}>
                {subscription.data?.plan === "pro" ? "Pro" : "Free"}
              </span>
              {subscription.data?.currentPeriodEnd && (
                <span className="text-xs text-muted-foreground">
                  Renews {new Date(subscription.data.currentPeriodEnd).toLocaleDateString("en-GB")}
                </span>
              )}
            </div>

            {subscription.data?.plan !== "pro" ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Upgrade to Pro for unlimited programs, weekly AI adjustments, and full progress tracking.
                </p>
                <button
                  onClick={handleUpgrade}
                  disabled={createCheckout.isPending}
                  className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
                  data-testid="button-upgrade-pro"
                >
                  {createCheckout.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Upgrade to Pro — £9.99/month
                </button>
              </div>
            ) : (
              <button
                onClick={handleManageBilling}
                disabled={createPortal.isPending}
                className="h-11 px-6 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-secondary/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                data-testid="button-manage-billing"
              >
                {createPortal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Manage billing
              </button>
            )}
          </>
        )}
      </motion.section>

      {/* Danger zone */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
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
                onClick={() => user?.delete().then(() => signOut())}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
                data-testid="button-confirm-delete"
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        )}
      </motion.section>
    </div>
  );
}
