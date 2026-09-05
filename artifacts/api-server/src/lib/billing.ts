import { eq, sql } from "drizzle-orm";
import {
  billingCustomerLinksTable,
  billingOwnerAliasesTable,
  billingProfilesTable,
  db,
  type BillingProfile,
} from "@workspace/db";
import { getUncachableStripeClient } from "../stripeClient";

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
export const BILLING_UNAVAILABLE_MESSAGE =
  "Billing is temporarily unavailable. Please try again shortly.";

type BillingAvailability = "available" | "initializing" | "unavailable";

// The API starts in its normal state for library consumers and tests. The
// server startup path explicitly moves it to initializing before it binds
// billing-dependent requests.
let billingAvailability: BillingAvailability = "available";

export function beginBillingInitialization() {
  billingAvailability = "initializing";
}

export function markBillingAvailable() {
  billingAvailability = "available";
}

export function markBillingUnavailable() {
  billingAvailability = "unavailable";
}

export function isBillingAvailable() {
  return billingAvailability === "available";
}

export function getBillingUnavailableEntitlement(): BillingEntitlement {
  return {
    status: "not_started",
    hasAccess: true,
    trialEndsAt: null,
    plan: null,
    subscriptionStatus: null,
    currentPeriodEndsAt: null,
    canManage: false,
  };
}

export const BILLING_PLANS = {
  weekly: {
    lookupKey: "macrocount_weekly",
    label: "$9.99/week",
  },
  monthly: {
    lookupKey: "macrocount_monthly",
    label: "$39.00/month",
  },
  yearly: {
    lookupKey: "macrocount_yearly",
    label: "$199.00/year",
  },
} as const;
const LEGACY_PLAN_LOOKUP_KEYS = {
  macrocount_annual: "yearly",
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;
export type BillingEntitlement = {
  status: "not_started" | "trialing" | "active" | "expired";
  hasAccess: boolean;
  trialEndsAt: string | null;
  plan: BillingPlan | null;
  subscriptionStatus: string | null;
  currentPeriodEndsAt: string | null;
  canManage: boolean;
};

type SyncedSubscription = {
  id: string;
  customer: string;
  status: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
};

function dateFromStripeTimestamp(value: number | null) {
  return value == null ? null : new Date(value * 1000).toISOString();
}

async function getBillingProfile(ownerId: string): Promise<BillingProfile | null> {
  const [alias] = await db
    .select({ billingOwnerId: billingOwnerAliasesTable.billingOwnerId })
    .from(billingOwnerAliasesTable)
    .where(eq(billingOwnerAliasesTable.aliasOwnerId, ownerId));
  if (alias) {
    const [linkedProfile] = await db
      .select()
      .from(billingProfilesTable)
      .where(eq(billingProfilesTable.ownerId, alias.billingOwnerId));
    if (linkedProfile) return linkedProfile;
  }

  const [profile] = await db
    .select()
    .from(billingProfilesTable)
    .where(eq(billingProfilesTable.ownerId, ownerId));
  return profile ?? null;
}

async function getCustomerIds(ownerId: string, profile: BillingProfile): Promise<string[]> {
  const links = await db
    .select({ stripeCustomerId: billingCustomerLinksTable.stripeCustomerId })
    .from(billingCustomerLinksTable)
    .where(eq(billingCustomerLinksTable.ownerId, ownerId));
  return [...new Set([profile.stripeCustomerId, ...links.map((link) => link.stripeCustomerId)].filter(Boolean))] as string[];
}

async function getSyncedSubscriptions(customerId: string): Promise<SyncedSubscription[]> {
  const result = await db.execute(sql`
    SELECT id, customer, status, current_period_end, cancel_at_period_end
    FROM stripe.subscriptions
    WHERE customer = ${customerId}
    ORDER BY current_period_end DESC NULLS LAST
  `);
  return result.rows as SyncedSubscription[];
}

async function getSubscriptionForCustomers(customerIds: string[]) {
  const all = (await Promise.all(customerIds.map(getSyncedSubscriptions))).flat();
  const active = all.filter(
    (subscription) => subscription.status === "active" || subscription.status === "trialing",
  );
  return {
    active: active.sort(
      (left, right) => (right.current_period_end ?? 0) - (left.current_period_end ?? 0),
    )[0] ?? null,
    latest: all.sort(
      (left, right) => (right.current_period_end ?? 0) - (left.current_period_end ?? 0),
    )[0] ?? null,
  };
}

async function getPlanForSubscription(subscriptionId: string): Promise<BillingPlan | null> {
  const result = await db.execute(sql`
    SELECT price.lookup_key
    FROM stripe.subscription_items AS item
    JOIN stripe.prices AS price ON price.id = item.price
    WHERE item.subscription = ${subscriptionId}
    LIMIT 1
  `);
  const lookupKey = (result.rows[0] as { lookup_key?: string } | undefined)?.lookup_key;
  for (const [plan, config] of Object.entries(BILLING_PLANS) as Array<
    [BillingPlan, (typeof BILLING_PLANS)[BillingPlan]]
  >) {
    if (lookupKey === config.lookupKey) return plan;
  }
  if (lookupKey && lookupKey in LEGACY_PLAN_LOOKUP_KEYS) {
    return LEGACY_PLAN_LOOKUP_KEYS[lookupKey as keyof typeof LEGACY_PLAN_LOOKUP_KEYS];
  }
  return null;
}

export async function startTrialIfNeeded(ownerId: string): Promise<BillingEntitlement> {
  if (!isBillingAvailable()) {
    return getBillingUnavailableEntitlement();
  }

  const existingProfile = await getBillingProfile(ownerId);
  if (existingProfile) {
    return getBillingEntitlement(ownerId);
  }

  await db
    .insert(billingProfilesTable)
    .values({ ownerId, trialStartedAt: new Date() })
    .onConflictDoNothing();

  return getBillingEntitlement(ownerId);
}

export async function simulateTrialExpired(ownerId: string): Promise<BillingEntitlement> {
  const profile = await getBillingProfile(ownerId);
  if (!profile) {
    throw new Error("Complete onboarding to start a trial before simulating expiry.");
  }

  await db
    .update(billingProfilesTable)
    .set({
      trialStartedAt: new Date(Date.now() - TRIAL_DURATION_MS - 1_000),
      updatedAt: new Date(),
    })
    .where(eq(billingProfilesTable.ownerId, profile.ownerId));

  return getBillingEntitlement(ownerId);
}

export async function moveBillingProfileToAccount(anonymousSessionId: string, accountId: string): Promise<void> {
  if (!isBillingAvailable()) return;

  await db.transaction(async (tx) => {
    const [anonymousBilling] = await tx
      .select()
      .from(billingProfilesTable)
      .where(eq(billingProfilesTable.ownerId, anonymousSessionId));
    if (!anonymousBilling) return;

    const [accountBilling] = await tx
      .select()
      .from(billingProfilesTable)
      .where(eq(billingProfilesTable.ownerId, accountId));

    if (!accountBilling) {
      await tx
        .update(billingProfilesTable)
        .set({ ownerId: accountId, updatedAt: new Date() })
        .where(eq(billingProfilesTable.ownerId, anonymousSessionId));
      await tx
        .update(billingCustomerLinksTable)
        .set({ ownerId: accountId })
        .where(eq(billingCustomerLinksTable.ownerId, anonymousSessionId));
      await tx
        .insert(billingOwnerAliasesTable)
        .values({ aliasOwnerId: anonymousSessionId, billingOwnerId: accountId })
        .onConflictDoUpdate({
          target: billingOwnerAliasesTable.aliasOwnerId,
          set: { billingOwnerId: accountId },
        });
      return;
    }

    const anonymousLinks = await tx
      .select({ stripeCustomerId: billingCustomerLinksTable.stripeCustomerId })
      .from(billingCustomerLinksTable)
      .where(eq(billingCustomerLinksTable.ownerId, anonymousSessionId));
    const customersToMerge = [
      anonymousBilling.stripeCustomerId,
      ...anonymousLinks.map((link) => link.stripeCustomerId),
    ].filter((customerId): customerId is string => Boolean(customerId));
    if (customersToMerge.length > 0) {
      await tx
        .insert(billingCustomerLinksTable)
        .values(customersToMerge.map((stripeCustomerId) => ({ ownerId: accountId, stripeCustomerId })))
        .onConflictDoNothing();
    }

    const earliestTrial =
      anonymousBilling.trialStartedAt < accountBilling.trialStartedAt
        ? anonymousBilling.trialStartedAt
        : accountBilling.trialStartedAt;
    await tx
      .update(billingProfilesTable)
      .set({
        trialStartedAt: earliestTrial,
        stripeCustomerId: accountBilling.stripeCustomerId ?? anonymousBilling.stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(billingProfilesTable.ownerId, accountId));
    await tx.delete(billingCustomerLinksTable).where(eq(billingCustomerLinksTable.ownerId, anonymousSessionId));
    await tx.delete(billingProfilesTable).where(eq(billingProfilesTable.ownerId, anonymousSessionId));
    await tx
      .insert(billingOwnerAliasesTable)
      .values({ aliasOwnerId: anonymousSessionId, billingOwnerId: accountId })
      .onConflictDoUpdate({
        target: billingOwnerAliasesTable.aliasOwnerId,
        set: { billingOwnerId: accountId },
      });
  });
}

export async function getBillingEntitlement(ownerId: string): Promise<BillingEntitlement> {
  if (!isBillingAvailable()) {
    return getBillingUnavailableEntitlement();
  }

  const profile = await getBillingProfile(ownerId);
  if (!profile) {
    return {
      status: "not_started",
      hasAccess: true,
      trialEndsAt: null,
      plan: null,
      subscriptionStatus: null,
      currentPeriodEndsAt: null,
      canManage: false,
    };
  }

  const trialEndsAt = new Date(profile.trialStartedAt.getTime() + TRIAL_DURATION_MS);
  const customerIds = await getCustomerIds(profile.ownerId, profile);
  const { active: activeSubscription, latest: latestSubscription } =
    await getSubscriptionForCustomers(customerIds);

  if (activeSubscription) {
    return {
      status: "active",
      hasAccess: true,
      trialEndsAt: trialEndsAt.toISOString(),
      plan: await getPlanForSubscription(activeSubscription.id),
      subscriptionStatus: activeSubscription.status,
      currentPeriodEndsAt: dateFromStripeTimestamp(activeSubscription.current_period_end),
      canManage: true,
    };
  }

  if (trialEndsAt > new Date()) {
    return {
      status: "trialing",
      hasAccess: true,
      trialEndsAt: trialEndsAt.toISOString(),
      plan: null,
      subscriptionStatus: latestSubscription?.status ?? null,
      currentPeriodEndsAt: dateFromStripeTimestamp(latestSubscription?.current_period_end ?? null),
      canManage: customerIds.length > 0,
    };
  }

  return {
    status: "expired",
    hasAccess: false,
    trialEndsAt: trialEndsAt.toISOString(),
    plan: null,
    subscriptionStatus: latestSubscription?.status ?? null,
    currentPeriodEndsAt: dateFromStripeTimestamp(latestSubscription?.current_period_end ?? null),
    canManage: customerIds.length > 0,
  };
}

async function getStripePriceId(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  plan: BillingPlan,
): Promise<string> {
  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [BILLING_PLANS[plan].lookupKey],
    limit: 1,
  });
  const priceId = prices.data[0]?.id;
  if (!priceId) {
    throw new Error("MacroCount subscription prices are not configured in Stripe yet.");
  }
  return priceId;
}

export async function createCheckoutSession(
  ownerId: string,
  plan: BillingPlan,
  origin: string,
): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const profileForOwner = await getBillingProfile(ownerId);
  const billingOwnerId = profileForOwner?.ownerId ?? ownerId;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${billingOwnerId}))`);
    const [profile] = await tx
      .select()
      .from(billingProfilesTable)
      .where(eq(billingProfilesTable.ownerId, billingOwnerId));
    if (!profile?.trialStartedAt) {
      throw new Error("Complete onboarding before starting a subscription.");
    }

    const customerIds = await getCustomerIds(profile.ownerId, profile);
    const { active: activeSubscription } = await getSubscriptionForCustomers(customerIds);
    if (activeSubscription) {
      throw new Error("Your subscription is already active. Use Manage subscription to make changes.");
    }

    if (profile.pendingCheckoutSessionId && profile.pendingCheckoutExpiresAt && profile.pendingCheckoutExpiresAt > new Date()) {
      const pending = await stripe.checkout.sessions.retrieve(profile.pendingCheckoutSessionId);
      if (pending.status === "open" && pending.url) return pending.url;
      if (pending.status === "complete") {
        throw new Error("Your payment is being confirmed. Please wait a moment and refresh.");
      }
    }

    const priceId = await getStripePriceId(stripe, plan);
    let customerId = profile.stripeCustomerId ?? customerIds[0];
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { macrocount_owner_id: billingOwnerId },
      });
      customerId = customer.id;
      await tx
        .update(billingProfilesTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(billingProfilesTable.ownerId, billingOwnerId));
      await tx
        .insert(billingCustomerLinksTable)
        .values({ ownerId: billingOwnerId, stripeCustomerId: customerId })
        .onConflictDoNothing();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      metadata: { macrocount_owner_id: billingOwnerId, macrocount_plan: plan },
      subscription_data: {
        metadata: { macrocount_owner_id: billingOwnerId, macrocount_plan: plan },
      },
    });
    if (!session.url || !session.expires_at) {
      throw new Error("Stripe did not return a usable Checkout session.");
    }
    await tx
      .update(billingProfilesTable)
      .set({
        pendingCheckoutSessionId: session.id,
        pendingCheckoutExpiresAt: new Date(session.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(billingProfilesTable.ownerId, billingOwnerId));
    return session.url;
  });
}

export async function createPortalSession(ownerId: string, origin: string): Promise<string> {
  const profile = await getBillingProfile(ownerId);
  if (!profile) {
    throw new Error("There is no subscription to manage yet.");
  }

  const customerIds = await getCustomerIds(profile.ownerId, profile);
  const { active: activeSubscription } = await getSubscriptionForCustomers(customerIds);
  const customerId = activeSubscription?.customer ?? profile.stripeCustomerId ?? customerIds[0];
  if (!customerId) throw new Error("There is no subscription to manage yet.");

  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/profile`,
  });
  return session.url;
}