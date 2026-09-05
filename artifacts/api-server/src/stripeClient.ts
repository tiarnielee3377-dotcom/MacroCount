import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import {
  getStripeSubscriptionReconciliationCheckpoint,
  getPendingStripeSubscriptionReconciliationRetries,
  recordStripeSubscriptionReconciliationFailure,
  resolveStripeSubscriptionReconciliationRetry,
  saveStripeSubscriptionReconciliationCheckpoint,
} from "./lib/stripeReconciliationState";

export const STRIPE_SUBSCRIPTION_RECONCILIATION_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;
const STRIPE_SUBSCRIPTION_RECONCILIATION_REPLAY_SECONDS = 5 * 60;
const SUBSCRIPTION_RECONCILIATION_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.resumed",
  "customer.subscription.updated",
] as const;

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const configuredSecretKey = process.env.STRIPE_SECRET_KEY;
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !xReplitToken) {
    if (configuredSecretKey) return { secretKey: configuredSecretKey };
    throw new Error("Stripe is not connected to this MacroCount workspace.");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to load the Stripe connection (${response.status}).`);
  }

  const data = (await response.json()) as {
    items?: Array<{ settings?: { secret_key?: string; secret?: string; webhook_secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  // StripeSync's database contains customer IDs from the connected account.
  // Prefer that account when it is available so catalog changes, subscription
  // lookups, and synchronized customers always refer to the same Stripe data.
  const secretKey = settings?.secret_key ?? settings?.secret ?? configuredSecretKey;
  if (!secretKey) {
    throw new Error("Add STRIPE_SECRET_KEY or connect a Stripe account to MacroCount.");
  }

  return {
    secretKey,
    webhookSecret: settings?.webhook_secret,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

const MACROCOUNT_PRODUCT_KEY = "macrocount_subscription";
const MACROCOUNT_PRICES = [
  {
    plan: "weekly",
    lookupKey: "macrocount_weekly",
    unitAmount: 999,
    interval: "week" as const,
    nickname: "MacroCount Weekly",
  },
  {
    plan: "monthly",
    lookupKey: "macrocount_monthly",
    unitAmount: 3900,
    interval: "month" as const,
    nickname: "MacroCount Monthly",
  },
  {
    plan: "yearly",
    lookupKey: "macrocount_yearly",
    unitAmount: 19900,
    interval: "year" as const,
    nickname: "MacroCount Yearly",
  },
] as const;
const LEGACY_LOOKUP_KEYS = ["macrocount_annual"] as const;

function isCurrentPrice(
  price: {
    active: boolean;
    currency: string;
    unit_amount: number | null;
    recurring: { interval: string } | null;
  },
  plan: (typeof MACROCOUNT_PRICES)[number],
) {
  return (
    price.active &&
    price.currency === "usd" &&
    price.unit_amount === plan.unitAmount &&
    price.recurring?.interval === plan.interval
  );
}

/**
 * Makes the Stripe catalog a deployment invariant instead of relying on an
 * operator to remember a one-off seed command in each connected account.
 */
export async function ensureMacroCountStripeCatalog(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const existingProducts = await stripe.products.search({
    query: `metadata['macrocount_product']:'${MACROCOUNT_PRODUCT_KEY}' AND active:'true'`,
  });
  const product =
    existingProducts.data[0] ??
    (await stripe.products.create({
      name: "MacroCount Premium",
      description: "Unlimited MacroCount food logging, recipes, meal planning, and workouts.",
      metadata: { macrocount_product: MACROCOUNT_PRODUCT_KEY },
    }));

  for (const plan of MACROCOUNT_PRICES) {
    const existing = await stripe.prices.list({
      active: true,
      lookup_keys: [plan.lookupKey],
      limit: 1,
    });
    const currentPrice = existing.data[0];
    if (currentPrice && isCurrentPrice(currentPrice, plan)) continue;

    const replacement = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.interval },
      lookup_key: plan.lookupKey,
      transfer_lookup_key: Boolean(currentPrice),
      nickname: plan.nickname,
      metadata: { macrocount_plan: plan.plan },
    });
    if (currentPrice && currentPrice.id !== replacement.id) {
      await stripe.prices.update(currentPrice.id, { active: false });
    }
  }

  for (const legacyLookupKey of LEGACY_LOOKUP_KEYS) {
    const legacyPrices = await stripe.prices.list({
      active: true,
      lookup_keys: [legacyLookupKey],
      limit: 100,
    });
    await Promise.all(legacyPrices.data.map((price) => stripe.prices.update(price.id, { active: false })));
  }
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe synchronization.");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret,
    // A delayed webhook is only a signal to retrieve the authoritative
    // subscription state, rather than a stale state transition to persist.
    revalidateObjectsViaStripeApi: ["subscription"],
  });
}

function getSubscriptionEvent(event: Stripe.Event): { subscriptionId: string; created: number } | null {
  if (
    !SUBSCRIPTION_RECONCILIATION_EVENT_TYPES.includes(
      event.type as (typeof SUBSCRIPTION_RECONCILIATION_EVENT_TYPES)[number],
    )
  ) {
    return null;
  }

  const object = event.data.object;
  if (
    typeof object === "object" &&
    object !== null &&
    "id" in object &&
    typeof object.id === "string" &&
    object.id.startsWith("sub_")
  ) {
    return { subscriptionId: object.id, created: event.created };
  }

  return null;
}

/**
 * Reconciles subscription changes that may have been missed by the webhook
 * endpoint. A durable cursor keeps the query near the previous pass, with a
 * small replay window for events that share a timestamp. Failed subscriptions
 * are kept in a separate durable retry queue, so they are not lost when Stripe
 * event retention expires. Stripe events are used instead of the subscriptions
 * `created` filter because renewals and status changes do not create a new
 * subscription.
 *
 * Each sync retrieves the current object from Stripe, so rerunning this job is
 * safe and an active subscription can never be replaced by an older event
 * payload.
 */
export async function reconcileRecentStripeSubscriptions(
  lookbackSeconds = STRIPE_SUBSCRIPTION_RECONCILIATION_LOOKBACK_SECONDS,
): Promise<{ events: number; subscriptions: number; failures: number }> {
  if (!Number.isFinite(lookbackSeconds) || lookbackSeconds <= 0) {
    throw new Error("Stripe subscription reconciliation lookback must be positive.");
  }

  const stripe = await getUncachableStripeClient();
  const stripeSync = await getStripeSync();
  const [checkpoint, pendingRetries] = await Promise.all([
    getStripeSubscriptionReconciliationCheckpoint(),
    getPendingStripeSubscriptionReconciliationRetries(),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const createdAfter = checkpoint == null
    ? now - Math.floor(lookbackSeconds)
    : Math.max(
      now - Math.floor(lookbackSeconds),
      checkpoint - STRIPE_SUBSCRIPTION_RECONCILIATION_REPLAY_SECONDS,
    );
  const events: Array<{ subscriptionId: string; created: number }> = [];

  await stripe.events
    .list({
      created: { gte: createdAfter },
      types: [...SUBSCRIPTION_RECONCILIATION_EVENT_TYPES],
      limit: 100,
    })
    .autoPagingEach((event) => {
      const subscriptionEvent = getSubscriptionEvent(event);
      if (subscriptionEvent) events.push(subscriptionEvent);
    });

  const changedSubscriptions = new Map<string, number>();
  for (const retry of pendingRetries) {
    changedSubscriptions.set(retry.subscriptionId, now);
  }
  for (const event of events) {
    changedSubscriptions.set(
      event.subscriptionId,
      Math.min(changedSubscriptions.get(event.subscriptionId) ?? event.created, event.created),
    );
  }

  let failures = 0;
  for (const [subscriptionId, firstEventCreated] of [...changedSubscriptions.entries()].sort(
    ([, leftCreated], [, rightCreated]) => leftCreated - rightCreated,
  )) {
    try {
      await stripeSync.syncSingleEntity(subscriptionId);
      await resolveStripeSubscriptionReconciliationRetry(subscriptionId);
    } catch (error) {
      failures += 1;
      // Store retry work before moving the event checkpoint. Repeating either
      // write after a crash is safe, while reversing their order can lose work.
      await recordStripeSubscriptionReconciliationFailure(
        subscriptionId,
        firstEventCreated,
        error,
      );
    }
  }

  const newestEventCreated = events.reduce(
    (latest, event) => Math.max(latest, event.created),
    checkpoint ?? 0,
  );
  // Failures are already durable retry work, so advancing to an event we
  // actually listed avoids replaying unrelated history. Never use the run
  // clock as a cursor: a slow batch could otherwise skip events created after
  // listing but before processing completes.
  if (events.length > 0) {
    await saveStripeSubscriptionReconciliationCheckpoint(newestEventCreated);
  }

  return { events: events.length, subscriptions: changedSubscriptions.size, failures };
}