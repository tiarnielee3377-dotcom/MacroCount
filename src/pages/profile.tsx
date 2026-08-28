import {
  getGetAccountQueryKey,
  useGetProfile,
  useGetProgress,
  useGetAccount,
  useLoginAccount,
  useLogoutAccount,
  useRegisterAccount,
  useSaveAccountProfilePreference,
  getGetProfileQueryKey,
  getGetProgressQueryKey,
  getGetBillingEntitlementQueryKey,
  useCreateBillingPortal,
  useGetBillingEntitlement,
  useSimulateTrialExpired,
} from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout";
import { BottomNav } from "@/components/bottom-nav";
import { Award, CalendarDays, CreditCard, Flame, Loader2, Lock, LogOut, RotateCcw, ShieldCheck, Target, TimerOff, User, Utensils } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getDeviceTimeZone } from "@/lib/day";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

const achievementIcons = {
  utensils: Utensils,
  flame: Flame,
  target: Target,
  award: Award,
} as const;

export default function Profile() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const timeZone = getDeviceTimeZone();
  const [accountMode, setAccountMode] = useState<"register" | "login" | null>(() =>
    new URLSearchParams(window.location.search).get("account") === "login" ? "login" : null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const { data: profile, isLoading } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      retry: false,
    }
  });
  const { data: progress } = useGetProgress({ timeZone }, {
    query: { queryKey: getGetProgressQueryKey({ timeZone }), enabled: Boolean(profile), retry: false },
  });
  const { data: account } = useGetAccount({
    query: { queryKey: getGetAccountQueryKey() },
  });
  const registerAccount = useRegisterAccount();
  const loginAccount = useLoginAccount();
  const logoutAccount = useLogoutAccount();
  const saveProfilePreference = useSaveAccountProfilePreference();
  const { data: entitlement } = useGetBillingEntitlement({
    query: { queryKey: getGetBillingEntitlementQueryKey(), retry: false },
  });
  const portal = useCreateBillingPortal();
  const simulateTrialExpired = useSimulateTrialExpired();
  const [billingError, setBillingError] = useState<string | null>(null);
  const [trialSimulationError, setTrialSimulationError] = useState<string | null>(null);

  const isSubmitting = registerAccount.isPending || loginAccount.isPending;

  const resetAccountForm = () => {
    setAccountMode(null);
    setAccountError(null);
    setPassword("");
  };

  const refreshForAccountChange = async () => {
    await queryClient.invalidateQueries();
    setLocation("/dashboard");
  };

  const handleAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountMode) return;

    setAccountError(null);
    const mutation = accountMode === "register" ? registerAccount : loginAccount;
    mutation.mutate(
      { data: { email, password } },
      {
        onSuccess: () => {
          resetAccountForm();
          void refreshForAccountChange();
        },
        onError: (error) => {
          setAccountError(error instanceof Error ? error.message : "We couldn't update your account. Please try again.");
        },
      },
    );
  };

  const handleLogout = () => {
    logoutAccount.mutate(undefined, {
      onSuccess: () => {
        void refreshForAccountChange();
      },
    });
  };

  const handleProfilePreference = (choice: "account" | "local") => {
    saveProfilePreference.mutate(
      { data: { choice } },
      {
        onSuccess: () => {
          void refreshForAccountChange();
        },
      },
    );
  };

  const handleBillingPortal = () => {
    setBillingError(null);
    portal.mutate(undefined, {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => {
        setBillingError(error instanceof Error ? error.message : "We couldn't open subscription management.");
      },
    });
  };

  const handleSimulateTrialExpired = () => {
    setTrialSimulationError(null);
    simulateTrialExpired.mutate(undefined, {
      onSuccess: (nextEntitlement) => {
        queryClient.setQueryData(getGetBillingEntitlementQueryKey(), nextEntitlement);
        void queryClient.invalidateQueries({ queryKey: getGetBillingEntitlementQueryKey() });
      },
      onError: (error) => {
        setTrialSimulationError(error instanceof Error ? error.message : "We couldn't simulate trial expiry.");
      },
    });
  };

  return (
    <MobileLayout>
      <div className="flex-1 min-h-0 overflow-y-auto pb-32 hide-scrollbar">
        <header className="pt-12 pb-6 px-6">
           <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-1">Settings</p>
           <div className="flex items-center justify-between">
             <h1 className="text-3xl font-display font-bold text-foreground">Your profile</h1>
             <Link href="/history" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-primary" aria-label="Open history">
               <CalendarDays className="h-5 w-5" />
             </Link>
           </div>
        </header>

        {isLoading ? (
           <div className="px-6 space-y-5 animate-pulse">
             <div className="h-56 rounded-3xl bg-card border border-card-border" />
             <div className="h-64 rounded-3xl bg-card border border-card-border" />
          </div>
        ) : (
          <div className="px-6 flex flex-col gap-6">
              {profile ? (
                <div className="p-6 bg-card rounded-3xl border border-card-border flex flex-col items-center">
               <div className="w-20 h-20 bg-primary/15 text-primary rounded-3xl flex items-center justify-center mb-4">
                <User className="w-10 h-10" />
              </div>
               <h2 className="text-2xl font-display font-bold text-foreground capitalize">{profile.goal} Goal</h2>
              <p className="text-muted-foreground text-sm mt-1 capitalize">{profile.activityLevel.replace('_', ' ')}</p>
                </div>
              ) : (
                <div className="p-6 bg-card rounded-3xl border border-card-border">
                  <h2 className="text-2xl font-display font-bold text-foreground">Take your progress with you</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to bring your meals, streaks, challenges, and badges back on any device.</p>
                </div>
              )}

              <div className="rounded-3xl border border-card-border bg-card p-5">
                {account?.email ? (
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Account connected</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{account.email}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">Your nutrition progress is backed up and ready on other devices.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={logoutAccount.isPending}
                      className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-secondary-foreground disabled:opacity-60"
                    >
                      {logoutAccount.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Sign out on this device
                    </button>
                    {account.pendingProfile && (
                      <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Choose daily targets</p>
                        <h3 className="mt-1 font-display text-lg font-bold text-foreground">This device has a different plan</h3>
                        <p className="mt-2 text-sm leading-5 text-muted-foreground">
                          Your meals are already combined. Pick which targets should calculate your dashboard and rewards.
                        </p>
                        <div className="mt-3 rounded-xl bg-background/70 p-3 text-sm text-foreground">
                          This device: <strong>{account.pendingProfile.calorieTarget} kcal</strong> · {account.pendingProfile.proteinTarget}g protein
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            disabled={saveProfilePreference.isPending}
                            onClick={() => handleProfilePreference("local")}
                            className="min-h-12 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                          >
                            Use this device
                          </button>
                          <button
                            type="button"
                            disabled={saveProfilePreference.isPending}
                            onClick={() => handleProfilePreference("account")}
                            className="min-h-12 rounded-2xl bg-secondary px-3 text-sm font-bold text-secondary-foreground disabled:opacity-60"
                          >
                            Keep account plan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : accountMode ? (
                  <form onSubmit={handleAccountSubmit}>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                      {accountMode === "register" ? "Create an account" : "Welcome back"}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold text-foreground">
                      {accountMode === "register" ? "Back up your progress" : "Restore your progress"}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      {accountMode === "register"
                        ? "Your existing meals and rewards will be linked automatically."
                        : "Any meals logged on this device will be added to your account."}
                    </p>
                    <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="account-email">Email</label>
                    <input
                      id="account-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="mt-2 h-12 w-full rounded-xl border border-card-border bg-background px-4 text-foreground outline-none focus:border-primary"
                    />
                    <label className="mt-4 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="account-password">Password</label>
                    <input
                      id="account-password"
                      type="password"
                      autoComplete={accountMode === "register" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      required
                      className="mt-2 h-12 w-full rounded-xl border border-card-border bg-background px-4 text-foreground outline-none focus:border-primary"
                    />
                    {accountError && <p className="mt-3 text-sm font-medium text-destructive">{accountError}</p>}
                    <div className="mt-5 flex gap-3">
                      <button type="button" onClick={resetAccountForm} className="h-12 rounded-2xl bg-secondary px-5 font-bold text-secondary-foreground">Cancel</button>
                      <button type="submit" disabled={isSubmitting} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60">
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {accountMode === "register" ? "Create account" : "Sign in"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Optional backup</p>
                        <h2 className="mt-1 font-display text-xl font-bold text-foreground">Keep your progress</h2>
                        <p className="mt-2 text-sm leading-5 text-muted-foreground">Create an account to keep your meals, streaks, challenges, and achievements when you change devices.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setAccountMode("register")} className="h-12 rounded-2xl bg-primary font-bold text-primary-foreground">Create account</button>
                      <button type="button" onClick={() => setAccountMode("login")} className="h-12 rounded-2xl bg-secondary font-bold text-secondary-foreground">Sign in</button>
                    </div>
                  </div>
                )}
              </div>

               {entitlement && entitlement.status !== "not_started" && (
                 <div className="rounded-3xl border border-card-border bg-card p-5">
                   <div className="flex items-start gap-3">
                     <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                       <CreditCard className="h-5 w-5" />
                     </div>
                     <div className="min-w-0 flex-1">
                       <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Membership</p>
                       <h2 className="mt-1 font-display text-xl font-bold text-foreground">
                         {entitlement.status === "active"
                            ? `${entitlement.plan === "yearly" ? "Yearly" : entitlement.plan === "monthly" ? "Monthly" : "Weekly"} Premium`
                           : entitlement.status === "trialing"
                             ? "Three-day free trial"
                             : "Trial complete"}
                       </h2>
                       <p className="mt-2 text-sm leading-5 text-muted-foreground">
                         {entitlement.status === "active"
                           ? "Your Premium access is active."
                           : entitlement.status === "trialing" && entitlement.trialEndsAt
                             ? `Your trial ends ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(entitlement.trialEndsAt))}.`
                             : "Choose a plan to continue using MacroCount."}
                       </p>
                     </div>
                   </div>
                   {entitlement.canManage ? (
                     <button
                       type="button"
                       onClick={handleBillingPortal}
                       disabled={portal.isPending}
                       className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-secondary-foreground disabled:opacity-60"
                     >
                       {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4" /> Manage subscription</>}
                     </button>
                   ) : (
                     <Link href="/billing" className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground">
                       {entitlement.status === "expired" ? "Choose a plan" : "View plans"}
                     </Link>
                   )}
                   {billingError && <p className="mt-3 text-sm font-medium text-destructive">{billingError}</p>}
                    {import.meta.env.DEV && entitlement.status === "trialing" && (
                      <div className="mt-5 rounded-2xl border border-dashed border-primary/35 bg-primary/5 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Development testing</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          Use this temporary control to preview the expired-trial paywall without waiting three days.
                        </p>
                        <button
                          type="button"
                          onClick={handleSimulateTrialExpired}
                          disabled={simulateTrialExpired.isPending}
                          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-background font-bold text-primary disabled:opacity-60"
                        >
                          {simulateTrialExpired.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TimerOff className="h-4 w-4" />}
                          Simulate trial expired
                        </button>
                        {trialSimulationError && <p className="mt-3 text-sm font-medium text-destructive">{trialSimulationError}</p>}
                      </div>
                    )}
                 </div>
               )}

              {profile && (
              <>
              <div className="p-6 bg-card rounded-3xl border border-card-border">
               <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.18em] mb-4">Daily targets</h3>
              
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center pb-4 border-b border-border">
                  <span className="text-muted-foreground font-medium">Calories</span>
                   <span className="font-display text-2xl font-bold text-primary">{profile.calorieTarget}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-border">
                  <span className="text-muted-foreground font-medium">Protein</span>
                  <span className="font-medium">{profile.proteinTarget}g</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-border">
                  <span className="text-muted-foreground font-medium">Carbs</span>
                  <span className="font-medium">{profile.carbsTarget}g</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Fat</span>
                  <span className="font-medium">{profile.fatTarget}g</span>
                </div>
              </div>

              {progress && (
                <div className="p-5 bg-card rounded-3xl border border-card-border">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.18em]">Achievements</h3>
                      <p className="mt-1 text-sm text-foreground">{progress.achievements.filter((achievement) => achievement.unlocked).length} of {progress.achievements.length} unlocked</p>
                    </div>
                    <Award className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {progress.achievements.map((achievement) => {
                      const Icon = achievementIcons[achievement.icon as keyof typeof achievementIcons] ?? Award;
                      return (
                        <div
                          key={achievement.id}
                          className={`relative min-h-32 rounded-2xl border p-4 ${achievement.unlocked ? "border-accent/30 bg-accent/10" : "border-card-border bg-secondary/45 opacity-70"}`}
                        >
                          <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${achievement.unlocked ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}>
                            {achievement.unlocked ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </div>
                          <p className="text-sm font-bold leading-5 text-foreground">{achievement.name}</p>
                          <p className="mt-1 text-xs leading-4 text-muted-foreground">{achievement.description}</p>
                          {!achievement.unlocked && (
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{achievement.progress}/{achievement.target}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
              <button
              onClick={() => setLocation("/onboarding")}
               className="h-14 w-full bg-secondary text-secondary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 mt-4 active:scale-[0.98]"
            >
              <RotateCcw className="w-5 h-5" /> Reset onboarding
            </button>
              </>
              )}
          </div>
        )}
      </div>
      <BottomNav />
    </MobileLayout>
  );
}
