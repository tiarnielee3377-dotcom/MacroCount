import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SubscriptionRow = {
  id: string;
  customer: string;
  status: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
};

const testState = vi.hoisted(() => ({
  profile: {
    ownerId: "subscriber",
    trialStartedAt: new Date("2026-08-01T12:00:00.000Z"),
    stripeCustomerId: "cus_subscriber",
  },
  subscription: {
    id: "sub_subscriber",
    customer: "cus_subscriber",
    status: "canceled",
    current_period_end: 1_800_000_000,
    cancel_at_period_end: true,
  } as SubscriptionRow,
  subscriptionPlan: "macrocount_annual",
  lastSyncedSubscriptionEventCreated: 0,
  processWebhook: vi.fn(),
}));

const billingProfilesTable = {
  _tag: "billingProfilesTable",
  ownerId: { name: "ownerId" },
  trialStartedAt: { name: "trialStartedAt" },
  stripeCustomerId: { name: "stripeCustomerId" },
};
const billingOwnerAliasesTable = {
  _tag: "billingOwnerAliasesTable",
  aliasOwnerId: { name: "aliasOwnerId" },
  billingOwnerId: { name: "billingOwnerId" },
};
const billingCustomerLinksTable = {
  _tag: "billingCustomerLinksTable",
  ownerId: { name: "ownerId" },
  stripeCustomerId: { name: "stripeCustomerId" },
};

function selectChain() {
  let table: { _tag: string } | undefined;
  let condition: { value?: unknown } | undefined;
  const resolve = () => {
    if (table?._tag === "billingProfilesTable") {
      return condition?.value === testState.profile.ownerId ? [testState.profile] : [];
    }
    if (table?._tag === "billingOwnerAliasesTable") return [];
    if (table?._tag === "billingCustomerLinksTable") return [];
    return [];
  };
  const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
    from(nextTable: { _tag: string }) {
      table = nextTable;
      return chain;
    },
    where(nextCondition: { value?: unknown }) {
      condition = nextCondition;
      return chain;
    },
    then(
      onfulfilled?: ((value: unknown[]) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) {
      return Promise.resolve(resolve()).then(onfulfilled as never, onrejected as never);
    },
    catch(onrejected?: ((reason: unknown) => unknown) | null) {
      return Promise.resolve(resolve()).catch(onrejected);
    },
    finally(onfinally?: (() => void) | null) {
      return Promise.resolve(resolve()).finally(onfinally);
    },
  };
  return chain;
}

async function executeQuery(query: { text: string; values: unknown[] }) {
  if (query.text.includes("stripe.subscriptions")) {
    return { rows: [testState.subscription] };
  }
  if (query.text.includes("stripe.subscription_items")) {
    return { rows: [{ lookup_key: testState.subscriptionPlan }] };
  }
  return { rows: [] };
}

const mockDb = {
  select: () => selectChain(),
  execute: executeQuery,
};

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: (column: unknown, value: unknown) => ({ column, value }),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join(""),
    values,
  }),
}));

vi.mock("@workspace/db", () => ({
  db: mockDb,
  accountSessionsTable: { _tag: "accountSessionsTable" },
  accountsTable: { _tag: "accountsTable" },
  billingProfilesTable,
  billingOwnerAliasesTable,
  billingCustomerLinksTable,
  mealsTable: { _tag: "mealsTable" },
  nutritionProfilesTable: { _tag: "nutritionProfilesTable" },
  profileTransferConflictsTable: { _tag: "profileTransferConflictsTable" },
  recipeGroceryChecksTable: { _tag: "recipeGroceryChecksTable" },
  recipeMealPlanSlotsTable: { _tag: "recipeMealPlanSlotsTable" },
  workoutCompletionsTable: { _tag: "workoutCompletionsTable" },
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock("./stripeClient", () => ({
  getStripeSync: vi.fn(async () => ({
    processWebhook: testState.processWebhook,
  })),
  getUncachableStripeClient: vi.fn(),
}));

const { default: app } = await import("./app.js");
const { getBillingEntitlement } = await import("./lib/billing.js");

function subscriptionEvent(
  status: string,
  options: {
    created?: number;
    currentPeriodEnd?: number;
  } = {},
) {
  return {
    id: `evt_subscription_${status}_${options.created ?? 1_800_000_000}`,
    object: "event",
    type: "customer.subscription.updated",
    created: options.created ?? 1_800_000_000,
    data: {
      object: {
        id: testState.subscription.id,
        object: "subscription",
        customer: testState.subscription.customer,
        status,
        current_period_end: options.currentPeriodEnd ?? testState.subscription.current_period_end,
        cancel_at_period_end: status !== "active",
      },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
  testState.subscription.status = "canceled";
  testState.subscription.cancel_at_period_end = true;
  testState.lastSyncedSubscriptionEventCreated = 0;
  testState.processWebhook.mockReset();
  testState.processWebhook.mockImplementation(async (payload: Buffer, signature: string) => {
    if (signature !== "valid-signature") {
      throw new Error("Invalid Stripe signature.");
    }

    const event = JSON.parse(payload.toString()) as {
      created: number;
      data: { object: SubscriptionRow };
    };
    // StripeSync writes subscription rows only when the incoming event is newer.
    // This models the database timestamp guard used in production.
    if (event.created > testState.lastSyncedSubscriptionEventCreated) {
      testState.subscription = {
        ...testState.subscription,
        ...event.data.object,
      };
      testState.lastSyncedSubscriptionEventCreated = event.created;
    }
  });
});

describe("Stripe subscription webhooks", () => {
  it("restores access when a valid subscription update becomes active", async () => {
    const before = await getBillingEntitlement(testState.profile.ownerId);
    expect(before.hasAccess).toBe(false);
    expect(before.subscriptionStatus).toBe("canceled");

    const payload = JSON.stringify(subscriptionEvent("active"));
    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "valid-signature")
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(testState.processWebhook).toHaveBeenCalledWith(expect.any(Buffer), "valid-signature");

    const after = await getBillingEntitlement(testState.profile.ownerId);
    expect(after.status).toBe("active");
    expect(after.hasAccess).toBe(true);
    expect(after.subscriptionStatus).toBe("active");
    expect(after.plan).toBe("yearly");
  });

  it("keeps a renewed subscription active when an older cancellation webhook is retried later", async () => {
    const renewedPayload = JSON.stringify(subscriptionEvent("active", {
      created: 1_800_000_100,
      currentPeriodEnd: 1_900_000_000,
    }));
    const delayedCancellationPayload = JSON.stringify(subscriptionEvent("canceled", {
      created: 1_800_000_000,
      currentPeriodEnd: 1_800_000_000,
    }));

    await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "valid-signature")
      .send(renewedPayload)
      .expect(200);
    await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "valid-signature")
      .send(delayedCancellationPayload)
      .expect(200);

    // Stripe retries and out-of-order deliveries are acknowledged, but the
    // old event must not overwrite the synced renewal or revoke entitlement.
    expect(testState.subscription).toMatchObject({
      status: "active",
      current_period_end: 1_900_000_000,
    });
    const entitlement = await getBillingEntitlement(testState.profile.ownerId);
    expect(entitlement.status).toBe("active");
    expect(entitlement.hasAccess).toBe(true);
    expect(entitlement.subscriptionStatus).toBe("active");
  });

  it("rejects a malformed signature without changing access state", async () => {
    const payload = JSON.stringify(subscriptionEvent("active"));
    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "malformed-signature")
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Webhook processing failed." });

    const entitlement = await getBillingEntitlement(testState.profile.ownerId);
    expect(entitlement.hasAccess).toBe(false);
    expect(entitlement.subscriptionStatus).toBe("canceled");
  });

  it("rejects failed webhook processing without changing access state", async () => {
    testState.processWebhook.mockRejectedValueOnce(new Error("database unavailable"));
    const payload = JSON.stringify(subscriptionEvent("active"));

    const response = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "valid-signature")
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Webhook processing failed." });

    const entitlement = await getBillingEntitlement(testState.profile.ownerId);
    expect(entitlement.hasAccess).toBe(false);
    expect(entitlement.subscriptionStatus).toBe("canceled");
  });
});