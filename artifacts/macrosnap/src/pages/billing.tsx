import {
  useCreateBillingCheckout,
  useCreateBillingPortal,
  useGetBillingEntitlement,
  useRestoreAppleTransactions,
  useVerifyAppleTransaction,
} from "@workspace/api-client-react";
import { Check, ChevronRight, Crown, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { MobileLayout } from "@/components/layout";
import {
  finishAppleTransaction,
  getAppleProducts,
  isNativeIOS,
  purchaseAppleProduct,
  restoreApplePurchases,
  type AppleProduct,
} from "@/lib/apple-store";

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
  const usesAppleBilling = isNativeIOS();
  const checkout = useCreateBillingCheckout();
  const portal = useCreateBillingPortal();
  const verifyApple = useVerifyAppleTransaction();
  const restoreApple = useRestoreAppleTransactions();
  const { data: entitlement, isLoading, refetch: refetchEntitlement } = useGetBillingEntitlement();
  const [error, setError] = useState<string | null>(null);
  const [appleProducts, setAppleProducts] = useState<AppleProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(usesAppleBilling);
  const [purchasingPlan, setPurchasingPlan] = useState<Plan | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!usesAppleBilling) return;

    getAppleProducts()
      .then((products) => {
        setAppleProducts(products);
        if (products.length !== 3) {
          setError("Some subscription options are temporarily unavailable from the App Store.");
        }
      })
      .catch(() => setError("We couldn't load subscriptions from the App Store. Please try again."))
      .finally(() => setLoadingProducts(false));
  }, [usesAppleBilling]);

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

  const startApplePurchase = async (plan: Plan) => {
    const product = appleProducts.find((item) => item.plan === plan);
    if (!product) {
      setError("This subscription is currently unavailable from the App Store.");
      return;
    }

    setError(null);
    setPurchasingPlan(plan);
    try {
      const transaction = await purchaseAppleProduct(product.id);
      await verifyApple.mutateAsync({ data: { signedTransaction: transaction.signedTransaction } });
      await finishAppleTransaction(transaction.transactionId);
      await refetchEntitlement();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      if (code !== "PURCHASE_CANCELLED") {
        setError(reason instanceof Error ? reason.message : "We couldn't complete the App Store purchase. Please try again.");
      }
    } finally {
      setPurchasingPlan(null);
    }
  };

  const restorePurchases = async () => {
    setError(null);
    setRestoring(true);
    try {
      const transactions = await restoreApplePurchases();
      if (transactions.length === 0) {
        setError("No active MacroCount purchases were found for this Apple ID.");
        return;
      }
      await restoreApple.mutateAsync({
        data: { signedTransactions: transactions.map((transaction) => transaction.signedTransaction) },
      });
      await Promise.all(transactions.map((transaction) => finishAppleTransaction(transaction.transactionId)));
      await refetchEntitlement();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't restore App Store purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const startPurchase = (plan: Plan) => {
    if (usesAppleBilling) {
      void startApplePurchase(plan);
    } else {
      startCheckout(plan);
    }
  };

  const priceFor = (plan: Plan, fallback: string) =>
    usesAppleBilling ? appleProducts.find((product) => product.plan === plan)?.displayPrice ?? "—" : fallback;

  const purchasePending = checkout.isPending || purchasingPlan !== null;

  const trialEnd = formatDate(entitlement?.trialEndsAt ?? null);
  const isActive = entitlement?.status === "active";
  const isTrialing = entitlement?.status === "trialing";
  const isAppleSubscription = entitlement?.provider === "apple";

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
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {isAppleSubscription
                      ? "Manage or cancel your subscription in your Apple ID subscription settings."
                      : "Manage payment details, switch plans, or cancel securely in Stripe."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={isAppleSubscription ? restorePurchases : openPortal}
                disabled={portal.isPending || restoring}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-secondary-foreground disabled:opacity-60"
              >
                {portal.isPending || restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : isAppleSubscription ? "Restore purchases" : <>Manage subscription <ChevronRight className="h-4 w-4" /></>}
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
                  onClick={() => startPurchase("yearly")}
                  disabled={purchasePending || loadingProducts}
                  className="relative w-full rounded-3xl border-2 border-primary bg-card p-5 text-left shadow-[0_12px_32px_rgba(255,107,53,0.14)] transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <span className="absolute -top-3 right-5 rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-foreground">Best value</span>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Yearly</p>
                      <p className="mt-1 text-sm text-muted-foreground">Auto-renews annually unless cancelled</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-primary">{priceFor("yearly", "$199.00")}</p>
                      <p className="text-xs font-semibold text-muted-foreground">per year</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-bold text-accent">About $16.60/month · Save 57% vs monthly</p>
                </button>
                <button
                  type="button"
                  onClick={() => startPurchase("monthly")}
                  disabled={purchasePending || loadingProducts}
                  className="w-full rounded-3xl border border-card-border bg-card p-5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Monthly</p>
                      <p className="mt-1 text-sm text-muted-foreground">No lock-in · cancel anytime</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-foreground">{priceFor("monthly", "$39.00")}</p>
                      <p className="text-xs font-semibold text-muted-foreground">per month</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => startPurchase("weekly")}
                  disabled={purchasePending || loadingProducts}
                  className="w-full rounded-3xl border border-card-border bg-card p-5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-foreground">Weekly</p>
                      <p className="mt-1 text-sm text-muted-foreground">No lock-in · cancel anytime</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-foreground">{priceFor("weekly", "$9.99")}</p>
                      <p className="text-xs font-semibold text-muted-foreground">per week</p>
                    </div>
                  </div>
                </button>
              </div>
              {purchasePending && (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" /> {usesAppleBilling ? "Completing App Store purchase…" : "Opening secure Checkout…"}
                </p>
              )}
              {usesAppleBilling && (
                <button
                  type="button"
                  onClick={restorePurchases}
                  disabled={restoring || purchasePending}
                  className="mt-4 h-11 w-full text-sm font-bold text-primary disabled:opacity-60"
                >
                  {restoring ? "Restoring purchases…" : "Restore purchases"}
                </button>
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
          <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
            {usesAppleBilling
              ? "Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled in Apple ID settings."
              : "Payment is handled securely by Stripe. Cancel in the customer portal anytime."}
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}