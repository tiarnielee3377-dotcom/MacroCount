import { beforeEach, describe, expect, it, vi } from "vitest";

type SubscriptionRow = {
  id: string;
  customer: string;
  status: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
};

type CheckoutSession = {
  id: string;
  status: "open" | "complete";
  url: string | null;
  expires_at: number;
};

type BillingProfileRow = {
  ownerId: string;
  trialStartedAt: Date;
  stripeCustomerId: string | null;
  pendingCheckoutSessionId: string | null;
  pendingCheckoutExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const testState = vi.hoisted(() => ({
  profiles: new Map<string, BillingProfileRow>(),
  aliases: new Map<string, string>(),
  customerLinks: new Map<string, Set<string>>(),
  subscriptions: new Map<string, SubscriptionRow[]>(),
  subscriptionPlans: new Map<string, string>(),
  prices: new Map<string, string>(),
  checkoutSessions: new Map<string, CheckoutSession>(),
  customerCounter: 0,
  checkoutCounter: 0,
  stripe: null as {
    customers: { create: ReturnType<typeof vi.fn> };
    checkout: {
      sessions: {
        create: ReturnType<typeof vi.fn>;
        retrieve: ReturnType<typeof vi.fn>;
      };
    };
    billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
    prices: { list: ReturnType<typeof vi.fn> };
  } | null,
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

function conditionValue(condition: { value?: unknown } | undefined) {
  return condition?.value;
}

function rowsFor(table: { _tag: string }, condition?: { column?: { name?: string }; value?: unknown }) {
  const value = conditionValue(condition);
  if (table._tag === "billingProfilesTable") {
    const profile = [...testState.profiles.values()].find(
      (candidate) => !condition || candidate.ownerId === value,
    );
    return profile ? [profile] : [];
  }
  if (table._tag === "billingOwnerAliasesTable") {
    const billingOwnerId = testState.aliases.get(String(value));
    return billingOwnerId ? [{ billingOwnerId }] : [];
  }
  if (table._tag === "billingCustomerLinksTable") {
    const ownerId = String(value);
    return [...(testState.customerLinks.get(ownerId) ?? [])].map((stripeCustomerId) => ({
      stripeCustomerId,
    }));
  }
  return [];
}

function selectChain() {
  let table: { _tag: string } | undefined;
  let condition: { column?: { name?: string }; value?: unknown } | undefined;
  const resolve = () => Promise.resolve(table ? rowsFor(table, condition) : []);
  const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
    from(nextTable: { _tag: string }) {
      table = nextTable;
      return chain;
    },
    where(nextCondition: { column?: { name?: string }; value?: unknown }) {
      condition = nextCondition;
      return chain;
    },
    orderBy() {
      return resolve();
    },
    then(onfulfilled?: ((value: unknown[]) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
      return resolve().then(onfulfilled as never, onrejected as never);
    },
    catch(onrejected?: ((reason: unknown) => unknown) | null) {
      return resolve().catch(onrejected);
    },
    finally(onfinally?: (() => void) | null) {
      return resolve().finally(onfinally);
    },
  };
  return chain;
}

function addProfile(values: Partial<BillingProfileRow> & { ownerId: string; trialStartedAt: Date }) {
  if (testState.profiles.has(values.ownerId)) return;
  const now = new Date();
  testState.profiles.set(values.ownerId, {
    ownerId: values.ownerId,
    trialStartedAt: values.trialStartedAt,
    stripeCustomerId: values.stripeCustomerId ?? null,
    pendingCheckoutSessionId: values.pendingCheckoutSessionId ?? null,
    pendingCheckoutExpiresAt: values.pendingCheckoutExpiresAt ?? null,
    createdAt: values.createdAt ?? now,
    updatedAt: values.updatedAt ?? now,
  });
}

function insertChain(table: { _tag: string }) {
  let values: Record<string, unknown> | Record<string, unknown>[] = {};
  const apply = () => {
    const entries = Array.isArray(values) ? values : [values];
    for (const entry of entries) {
      if (table._tag === "billingProfilesTable") {
        addProfile(entry as Partial<BillingProfileRow> & { ownerId: string; trialStartedAt: Date });
      } else if (table._tag === "billingOwnerAliasesTable") {
        testState.aliases.set(String(entry.aliasOwnerId), String(entry.billingOwnerId));
      } else if (table._tag === "billingCustomerLinksTable") {
        const ownerId = String(entry.ownerId);
        const links = testState.customerLinks.get(ownerId) ?? new Set<string>();
        links.add(String(entry.stripeCustomerId));
        testState.customerLinks.set(ownerId, links);
      }
    }
    return [];
  };
  const chain = {
    values(nextValues: Record<string, unknown> | Record<string, unknown>[]) {
      values = nextValues;
      return chain;
    },
    onConflictDoNothing() {
      return Promise.resolve(apply());
    },
    onConflictDoUpdate() {
      return Promise.resolve(apply());
    },
  };
  return chain;
}

function updateChain(table: { _tag: string }) {
  let changes: Record<string, unknown> = {};
  let condition: { value?: unknown } | undefined;
  return {
    set(nextChanges: Record<string, unknown>) {
      changes = nextChanges;
      return {
        where(nextCondition: { value?: unknown }) {
          condition = nextCondition;
          const ownerId = String(condition?.value);
          if (table._tag === "billingProfilesTable") {
            const profile = testState.profiles.get(ownerId);
            if (profile) {
              Object.assign(profile, changes);
              if (changes.ownerId && changes.ownerId !== ownerId) {
                testState.profiles.delete(ownerId);
                testState.profiles.set(String(changes.ownerId), profile);
              }
            }
          } else if (table._tag === "billingCustomerLinksTable") {
            const links = testState.customerLinks.get(ownerId);
            if (links && changes.ownerId) {
              testState.customerLinks.delete(ownerId);
              testState.customerLinks.set(String(changes.ownerId), links);
            }
          }
          return Promise.resolve([]);
        },
      };
    },
  };
}

function deleteChain(table: { _tag: string }) {
  return {
    where(condition: { value?: unknown }) {
      const ownerId = String(condition.value);
      if (table._tag === "billingProfilesTable") testState.profiles.delete(ownerId);
      if (table._tag === "billingOwnerAliasesTable") testState.aliases.delete(ownerId);
      if (table._tag === "billingCustomerLinksTable") testState.customerLinks.delete(ownerId);
      return Promise.resolve([]);
    },
  };
}

async function executeQuery(query: { text: string; values: unknown[] }) {
  if (query.text.includes("stripe.subscriptions")) {
    return { rows: [...(testState.subscriptions.get(String(query.values[0])) ?? [])].sort(
      (left, right) => (right.current_period_end ?? 0) - (left.current_period_end ?? 0),
    ) };
  }
  if (query.text.includes("stripe.subscription_items")) {
    return { rows: [{ lookup_key: testState.subscriptionPlans.get(String(query.values[0])) }] };
  }
  if (query.text.includes("stripe.prices")) {
    return { rows: [{ id: testState.prices.get(String(query.values[0])) }] };
  }
  return { rows: [] };
}

const mockDb: Record<string, any> = {
  select: () => selectChain(),
  insert: (table: { _tag: string }) => insertChain(table),
  update: (table: { _tag: string }) => updateChain(table),
  delete: (table: { _tag: string }) => deleteChain(table),
  execute: executeQuery,
  transaction: async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb),
};

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join(""),
    values,
  }),
}));

vi.mock("@workspace/db", () => ({
  db: mockDb,
  billingProfilesTable,
  billingOwnerAliasesTable,
  billingCustomerLinksTable,
}));

vi.mock("../stripeClient", () => ({
  getUncachableStripeClient: vi.fn(async () => testState.stripe),
}));

const {
  BILLING_PLANS,
  createCheckoutSession,
  getBillingEntitlement,
  moveBillingProfileToAccount,
  startTrialIfNeeded,
} = await import("./billing.js");

function resetState() {
  testState.profiles.clear();
  testState.aliases.clear();
  testState.customerLinks.clear();
  testState.subscriptions.clear();
  testState.subscriptionPlans.clear();
  testState.prices.clear();
  testState.checkoutSessions.clear();
  testState.customerCounter = 0;
  testState.checkoutCounter = 0;

  testState.stripe = {
    customers: {
      create: vi.fn(async () => {
        const id = `cus_test_${++testState.customerCounter}`;
        return { id };
      }),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (params: { customer: string }) => {
          const id = `cs_test_${++testState.checkoutCounter}`;
          const session = {
            id,
            status: "open" as const,
            url: `https://checkout.test/${id}`,
            expires_at: Math.floor(Date.now() / 1000) + 3_600,
          };
          testState.checkoutSessions.set(id, session);
          expect(params.customer).toMatch(/^cus_test_/);
          return session;
        }),
        retrieve: vi.fn(async (id: string) => testState.checkoutSessions.get(id)),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async ({ customer }: { customer: string }) => ({
          url: `https://billing.test/${customer}`,
        })),
      },
    },
    prices: {
      list: vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => {
        const priceId = testState.prices.get(lookup_keys[0]);
        return { data: priceId ? [{ id: priceId }] : [] };
      }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
  resetState();
});

describe("trial ownership", () => {
  it("keeps one anonymous trial after account linking and logout", async () => {
    const anonymousSessionId = "anonymous-session";
    const accountId = "account-id";

    const anonymousEntitlement = await startTrialIfNeeded(anonymousSessionId);
    const trialStartedAt = testState.profiles.get(anonymousSessionId)?.trialStartedAt;
    expect(anonymousEntitlement.status).toBe("trialing");

    await moveBillingProfileToAccount(anonymousSessionId, accountId);
    const accountEntitlement = await getBillingEntitlement(accountId);
    const postLogoutAnonymousEntitlement = await startTrialIfNeeded(anonymousSessionId);

    expect(testState.profiles.size).toBe(1);
    expect(testState.profiles.has(anonymousSessionId)).toBe(false);
    expect(testState.profiles.get(accountId)?.trialStartedAt).toEqual(trialStartedAt);
    expect(accountEntitlement.trialEndsAt).toBe(anonymousEntitlement.trialEndsAt);
    expect(postLogoutAnonymousEntitlement.trialEndsAt).toBe(anonymousEntitlement.trialEndsAt);
    expect(postLogoutAnonymousEntitlement.status).toBe("trialing");
  });
});

describe("synced subscription entitlement", () => {
  it.each([
    { status: "active", hasAccess: true, entitlementStatus: "active" },
    { status: "trialing", hasAccess: true, entitlementStatus: "active" },
    { status: "canceled", hasAccess: false, entitlementStatus: "expired" },
    { status: "unpaid", hasAccess: false, entitlementStatus: "expired" },
  ])("maps a synced Stripe $status subscription without card entry", async ({ status, hasAccess, entitlementStatus }) => {
    const ownerId = "subscriber";
    const customerId = "cus_synced";
    addProfile({
      ownerId,
      trialStartedAt: new Date("2026-08-01T12:00:00.000Z"),
      stripeCustomerId: customerId,
    });
    testState.subscriptions.set(customerId, [{
      id: `sub_${status}`,
      customer: customerId,
      status,
      current_period_end: 1_800_000_000,
      cancel_at_period_end: status === "canceled",
    }]);
    testState.subscriptionPlans.set(`sub_${status}`, "macrocount_annual");

    const entitlement = await getBillingEntitlement(ownerId);

    expect(entitlement.hasAccess).toBe(hasAccess);
    expect(entitlement.status).toBe(entitlementStatus);
    expect(entitlement.subscriptionStatus).toBe(status);
    expect(entitlement.plan).toBe(hasAccess ? "yearly" : null);
  });

  it("keeps access when an older canceled subscription is present beside a renewed active subscription", async () => {
    const ownerId = "renewed-subscriber";
    const customerId = "cus_renewed";
    addProfile({
      ownerId,
      trialStartedAt: new Date("2026-08-01T12:00:00.000Z"),
      stripeCustomerId: customerId,
    });
    testState.subscriptions.set(customerId, [
      {
        id: "sub_previous_canceled",
        customer: customerId,
        status: "canceled",
        current_period_end: 1_900_000_000,
        cancel_at_period_end: true,
      },
      {
        id: "sub_renewed_active",
        customer: customerId,
        status: "active",
        current_period_end: 1_800_000_000,
        cancel_at_period_end: false,
      },
    ]);
    testState.subscriptionPlans.set("sub_renewed_active", BILLING_PLANS.weekly.lookupKey);

    const entitlement = await getBillingEntitlement(ownerId);

    expect(entitlement.status).toBe("active");
    expect(entitlement.hasAccess).toBe(true);
    expect(entitlement.subscriptionStatus).toBe("active");
    expect(entitlement.plan).toBe("weekly");
  });
});

describe("Checkout protection", () => {
  it("reuses an open Checkout session instead of creating another one", async () => {
    const ownerId = "checkout-owner";
    addProfile({ ownerId, trialStartedAt: new Date("2026-08-24T12:00:00.000Z") });
    testState.prices.set(BILLING_PLANS.weekly.lookupKey, "price_weekly");

    const firstUrl = await createCheckoutSession(ownerId, "weekly", "https://macrocount.test");
    const secondUrl = await createCheckoutSession(ownerId, "monthly", "https://macrocount.test");
    const stripe = testState.stripe!;

    expect(secondUrl).toBe(firstUrl);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledTimes(1);
  });

  it.each(["weekly", "monthly", "yearly"] as const)(
    "creates Checkout with the current %s Price",
    async (plan) => {
      const ownerId = `checkout-${plan}`;
      const priceId = `price_${plan}`;
      addProfile({ ownerId, trialStartedAt: new Date("2026-08-24T12:00:00.000Z") });
      testState.prices.set(BILLING_PLANS[plan].lookupKey, priceId);

      await createCheckoutSession(ownerId, plan, "https://macrocount.test");

      expect(testState.stripe!.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: expect.objectContaining({ macrocount_plan: plan }),
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({ macrocount_plan: plan }),
        }),
      }));
    },
  );

  it("does not create a duplicate subscription for an active subscriber", async () => {
    const ownerId = "active-owner";
    const customerId = "cus_active";
    addProfile({
      ownerId,
      trialStartedAt: new Date("2026-08-01T12:00:00.000Z"),
      stripeCustomerId: customerId,
    });
    testState.prices.set(BILLING_PLANS.weekly.lookupKey, "price_weekly");
    testState.subscriptions.set(customerId, [{
      id: "sub_active",
      customer: customerId,
      status: "active",
      current_period_end: 1_800_000_000,
      cancel_at_period_end: false,
    }]);

    await expect(createCheckoutSession(ownerId, "weekly", "https://macrocount.test"))
      .rejects.toThrow("subscription is already active");
    expect(testState.stripe!.checkout.sessions.create).not.toHaveBeenCalled();
  });
});