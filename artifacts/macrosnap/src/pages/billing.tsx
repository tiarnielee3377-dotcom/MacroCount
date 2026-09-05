import {
  useCreateBillingCheckout,
  useCreateBillingPortal,
  useGetBillingEntitlement,
} from "@workspace/api-client-react";
import { Check, ChevronRight, Crown, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { MobileLayout } from "@/components/layout";

type Plan = "weekly" | "monthly" | "yearly";

const planLabels: Record<Plan, string> = {
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
};

const features = [
  "Log meals with AI photo analysis",
  "Plan recipes and groceries",
  "Follow workouts and track progress",
];

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export default function Billing() {
  const checkout = useCreateBillingCheckout();
  const portal = useCreateBillingPortal();
  const { data: entitlement, isLoading } = useGetBillingEntitlement();
  const [error, setError] = useState<string | null>(null);

  const startCheckout = (plan: Plan) => {
    setError(null);
    checkout.mutate(
      { data: { plan } },
      {
        onSuccess: ({ url }) => window.location.assign(url),
        onError: (reason) => {
          setError(reason instanceof Error ? reason.message : "We couldn't open secure Checkout. Please try again.");
        },
      },
    );
  };

  const openPortal = () => {
    setError(null);
    portal.mutate(undefined, {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (reason) => {
        setError(reason instanceof Error ? reason.message : "We couldn't open subscription management. Please try again.");
      },
    });
  };

  const trialEnd = formatDate(entitlement?.trialEndsAt ?? null);
  const isActive = entitlement?.status === "active";
  const isTrialing = entitlement?.status === "trialing";

  return (
    <MobileLayout>
      <div className="flex-1 overflow-y-auto px-6 pb-10 pt-8 hide-scrollbar">
        <div className="mx-auto max-w-sm">
          <div className="mb-7 flex items-center justify-between">
            <Link href="/profile" className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Profile
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_30px_rgba(255,107,53,0.35)]">
              <Crown className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-primary/30 bg-primary/10 p-6 shadow-[0_20px_60px_rgba(255,107,53,0.12)]">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">MacroCount Premium</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground">
              {isActive ? "You’re all set." : isTrialing ? "Keep your momentum." : "Don’t lose your momentum."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {isActive
                ? `Your ${entitlement?.plan ? planLabels[entitlement.plan] : "Premium"} membership is active.`
                : isTrialing && trialEnd
                  ? `Your free trial is active through ${trialEnd}. Choose a plan whenever you’re ready.`
                  : "Your three-day free trial has ended. Choose a plan to keep logging, planning, and progressing."}
            </p>
          </div>

          {isLoading ? (
            <div className="mt-6 flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isActive ? (
            <div className="mt-6 rounded-3xl border border-card-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Premium is active</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">Manage payment details, switch plans, or cancel securely in Stripe.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={openPortal}
                disabled={portal.isPending}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-secondary-foreground disabled:opacity-60"
              >
                {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Manage subscription <ChevronRight className="h-4 w-4" /></>}
              </button>
              <Link href="/dashboard" className="mt-3 flex h-12 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground">
                Back to MacroCount
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => startCheckout("yearly")}
                  disabled={checkout.isPending}
                  className="relative w-full rounded-3xl border-2 border-primary bg-card p-5 text-left shadow-[0_12px_32px_rgba(255,107,53,0.14)] transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <span className="absolute -top-3 right-5 rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-foreground">Best value</span>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Yearly</p>
                      <p className="mt-1 text-sm text-muted-foreground">Auto-renews annually unless cancelled</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-primary">$199.00</p>
                      <p className="text-xs font-semibold text-muted-foreground">per year</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-bold text-accent">About $16.60/month · Save 57% vs monthly</p>
                </button>
                <button
                  type="button"
                  onClick={() => startCheckout("monthly")}
                  disabled={checkout.isPending}
                  className="w-full rounded-3xl border border-card-border bg-card p-5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Monthly</p>
                      <p className="mt-1 text-sm text-muted-foreground">No lock-in · cancel anytime</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-foreground">$39.00</p>
                      <p className="text-xs font-semibold text-muted-foreground">per month</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => startCheckout("weekly")}
                  disabled={checkout.isPending}
                  className="w-full rounded-3xl border border-card-border bg-card p-5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Weekly</p>
                      <p className="mt-1 text-sm text-muted-foreground">No lock-in · cancel anytime</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-foreground">$9.99</p>
                      <p className="text-xs font-semibold text-muted-foreground">per week</p>
                    </div>
                  </div>
                </button>
              </div>
              {checkout.isPending && (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Opening secure Checkout…
                </p>
              )}
              {error && <p className="mt-4 rounded-2xl bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">{error}</p>}
            </>
          )}

          <div className="mt-7 space-y-3">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent"><Check className="h-3.5 w-3.5" /></span>
                {feature}
              </div>
            ))}
          </div>
          <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">Payment is handled securely by Stripe. Cancel in the customer portal anytime.</p>
        </div>
      </div>
    </MobileLayout>
  );
}