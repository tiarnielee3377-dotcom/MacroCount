import { beforeEach, describe, expect, it, vi } from "vitest";

const Stripe = vi.hoisted(() => vi.fn());
const StripeSync = vi.hoisted(() => vi.fn());
const reconciliationState = vi.hoisted(() => ({
  getStripeSubscriptionReconciliationCheckpoint: vi.fn(),
  getPendingStripeSubscriptionReconciliationRetries: vi.fn(),
  recordStripeSubscriptionReconciliationFailure: vi.fn(),
  resolveStripeSubscriptionReconciliationRetry: vi.fn(),
  saveStripeSubscriptionReconciliationCheckpoint: vi.fn(),
}));
const catalog = vi.hoisted(() => ({
  products: {
    search: vi.fn(),
    create: vi.fn(),
  },
  prices: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  events: {
    list: vi.fn(),
  },
}));

vi.mock("stripe-replit-sync", () => ({
  StripeSync,
}));
vi.mock("stripe", () => ({
  default: Stripe,
}));
vi.mock("./lib/stripeReconciliationState", () => reconciliationState);

const {
  ensureMacroCountStripeCatalog,
  getStripeSync,
  reconcileRecentStripeSubscriptions,
} = await import("./stripeClient.js");

describe("Stripe synchronization configuration", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://stripe-sync-test");
    vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "connectors.test");
    vi.stubEnv("REPLIT_IDENTITY", "identity-test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_configured");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                settings: {
                  secret_key: "sk_test_sync",
                  webhook_secret: "whsec_test_sync",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    StripeSync.mockReset();
    Stripe.mockReset();
    Stripe.mockImplementation(function MockStripeClient() {
      return catalog;
    });
    catalog.products.search.mockReset();
    catalog.products.create.mockReset();
    catalog.prices.list.mockReset();
    catalog.prices.create.mockReset();
    catalog.prices.update.mockReset();
    catalog.events.list.mockReset();
  });

  it("keeps the connected Stripe account paired with its managed webhook secret", async () => {
    await getStripeSync();

    expect(StripeSync).toHaveBeenCalledWith({
      poolConfig: { connectionString: "postgres://stripe-sync-test" },
      stripeSecretKey: "sk_test_sync",
      stripeWebhookSecret: "whsec_test_sync",
      revalidateObjectsViaStripeApi: ["subscription"],
    });
  });
});

describe("Stripe subscription reconciliation", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://stripe-sync-test");
    vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "connectors.test");
    vi.stubEnv("REPLIT_IDENTITY", "identity-test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_configured");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [{ settings: { secret_key: "sk_test_sync" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    Stripe.mockReset();
    Stripe.mockImplementation(function MockStripeClient() {
      return catalog;
    });
    catalog.events.list.mockReset();
    reconciliationState.getStripeSubscriptionReconciliationCheckpoint.mockReset();
    reconciliationState.getStripeSubscriptionReconciliationCheckpoint.mockResolvedValue(null);
    reconciliationState.getPendingStripeSubscriptionReconciliationRetries.mockReset();
    reconciliationState.getPendingStripeSubscriptionReconciliationRetries.mockResolvedValue([]);
    reconciliationState.recordStripeSubscriptionReconciliationFailure.mockReset();
    reconciliationState.resolveStripeSubscriptionReconciliationRetry.mockReset();
    reconciliationState.saveStripeSubscriptionReconciliationCheckpoint.mockReset();
  });

  it("refreshes each recently changed subscription from Stripe once", async () => {
    let syncedSubscriptionStatus = "canceled";
    const syncSingleEntity = vi.fn(async (id: string) => {
      if (id === "sub_active") syncedSubscriptionStatus = "active";
    });
    StripeSync.mockReset();
    StripeSync.mockImplementation(function MockStripeSync() {
      return { syncSingleEntity };
    });

    catalog.events.list.mockReturnValue({
      autoPagingEach: async (
        handler: (event: {
          type: string;
          created: number;
          data: { object: { id: string } };
        }) => unknown,
      ) => {
        await handler({
          type: "customer.subscription.updated",
          created: 1_800_000_100,
          data: { object: { id: "sub_active" } },
        });
        await handler({
          type: "customer.subscription.updated",
          created: 1_800_000_101,
          data: { object: { id: "sub_active" } },
        });
        await handler({
          type: "customer.subscription.resumed",
          created: 1_800_000_102,
          data: { object: { id: "sub_active" } },
        });
      },
    });

    expect(syncedSubscriptionStatus).toBe("canceled");
    const result = await reconcileRecentStripeSubscriptions(3_600);

    expect(catalog.events.list).toHaveBeenCalledWith(expect.objectContaining({
      created: { gte: expect.any(Number) },
      types: [
        "customer.subscription.created",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.pending_update_applied",
        "customer.subscription.pending_update_expired",
        "customer.subscription.resumed",
        "customer.subscription.updated",
      ],
      limit: 100,
    }));
    expect(result).toEqual({ events: 3, subscriptions: 1, failures: 0 });
    expect(syncedSubscriptionStatus).toBe("active");
    expect(syncSingleEntity).toHaveBeenCalledOnce();
    expect(reconciliationState.resolveStripeSubscriptionReconciliationRetry)
      .toHaveBeenCalledWith("sub_active");
    expect(reconciliationState.saveStripeSubscriptionReconciliationCheckpoint)
      .toHaveBeenCalledWith(1_800_000_102);

    await reconcileRecentStripeSubscriptions(3_600);

    expect(syncedSubscriptionStatus).toBe("active");
    expect(syncSingleEntity).toHaveBeenCalledTimes(2);
  });

  it("records failed subscriptions for retry while advancing past unrelated events", async () => {
    const syncSingleEntity = vi.fn(async (id: string) => {
      if (id === "sub_unavailable") throw new Error("Stripe temporarily unavailable");
    });
    StripeSync.mockReset();
    StripeSync.mockImplementation(function MockStripeSync() {
      return { syncSingleEntity };
    });
    reconciliationState.getStripeSubscriptionReconciliationCheckpoint.mockResolvedValue(1_800_000_000);
    catalog.events.list.mockReturnValue({
      autoPagingEach: async (
        handler: (event: { type: string; created: number; data: { object: { id: string } } }) => unknown,
      ) => {
        await handler({
          type: "customer.subscription.updated",
          created: 1_800_000_100,
          data: { object: { id: "sub_unavailable" } },
        });
        await handler({
          type: "customer.subscription.updated",
          created: 1_800_000_101,
          data: { object: { id: "sub_active" } },
        });
      },
    });

    const result = await reconcileRecentStripeSubscriptions(3_600);

    expect(result).toEqual({ events: 2, subscriptions: 2, failures: 1 });
    expect(syncSingleEntity).toHaveBeenCalledWith("sub_unavailable");
    expect(syncSingleEntity).toHaveBeenCalledWith("sub_active");
    expect(reconciliationState.recordStripeSubscriptionReconciliationFailure).toHaveBeenCalledWith(
      "sub_unavailable",
      1_800_000_100,
      expect.any(Error),
    );
    expect(reconciliationState.saveStripeSubscriptionReconciliationCheckpoint)
      .toHaveBeenCalledWith(1_800_000_101);
  });

  it("retries a failed subscription after its Stripe event is no longer in the lookback", async () => {
    let syncedSubscriptionStatus = "canceled";
    const syncSingleEntity = vi.fn(async (id: string) => {
      if (id === "sub_retry") syncedSubscriptionStatus = "active";
    });
    StripeSync.mockReset();
    StripeSync.mockImplementation(function MockStripeSync() {
      return { syncSingleEntity };
    });
    reconciliationState.getPendingStripeSubscriptionReconciliationRetries.mockResolvedValue([
      { subscriptionId: "sub_retry" },
    ]);
    reconciliationState.getStripeSubscriptionReconciliationCheckpoint.mockResolvedValue(1_900_000_000);
    catalog.events.list.mockReturnValue({
      autoPagingEach: async () => undefined,
    });

    const result = await reconcileRecentStripeSubscriptions(3_600);

    expect(result).toEqual({ events: 0, subscriptions: 1, failures: 0 });
    expect(syncedSubscriptionStatus).toBe("active");
    expect(reconciliationState.resolveStripeSubscriptionReconciliationRetry)
      .toHaveBeenCalledWith("sub_retry");
    expect(reconciliationState.saveStripeSubscriptionReconciliationCheckpoint).not.toHaveBeenCalled();
  });

  it("keeps post-listing events eligible when a subscription refresh outlives the replay window", async () => {
    const syncSingleEntity = vi.fn(async () => {
      vi.setSystemTime(new Date("2027-01-01T00:10:00.000Z"));
    });
    StripeSync.mockReset();
    StripeSync.mockImplementation(function MockStripeSync() {
      return { syncSingleEntity };
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
    reconciliationState.getStripeSubscriptionReconciliationCheckpoint.mockResolvedValue(1_798_768_000);
    catalog.events.list.mockReturnValue({
      autoPagingEach: async (
        handler: (event: {
          type: string;
          created: number;
          data: { object: { id: string } };
        }) => unknown,
      ) => {
        await handler({
          type: "customer.subscription.updated",
          created: 1_798_768_100,
          data: { object: { id: "sub_listed_before_slow_sync" } },
        });
      },
    });

    await reconcileRecentStripeSubscriptions(3_600);

    // The cursor remains at the newest observed event, not the clock after a
    // ten-minute refresh. A later event remains inside the next replay query.
    expect(reconciliationState.saveStripeSubscriptionReconciliationCheckpoint)
      .toHaveBeenCalledWith(1_798_768_100);
    vi.useRealTimers();
  });
});

describe("MacroCount Stripe catalog", () => {
  beforeEach(() => {
    vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "connectors.test");
    vi.stubEnv("REPLIT_IDENTITY", "identity-test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_configured");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [{ settings: { webhook_secret: "whsec_test_sync" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    Stripe.mockReset();
    Stripe.mockImplementation(function MockStripeClient() {
      return catalog;
    });
    catalog.products.search.mockReset();
    catalog.products.create.mockReset();
    catalog.prices.list.mockReset();
    catalog.prices.create.mockReset();
    catalog.prices.update.mockReset();
  });

  it("replaces superseded Prices and creates the three current recurring plans", async () => {
    const pricesByLookupKey = new Map<string, Array<Record<string, unknown>>>([
      [
        "macrocount_weekly",
        [{
          id: "price_weekly_legacy",
          active: true,
          currency: "usd",
          unit_amount: 799,
          recurring: { interval: "week" },
        }],
      ],
      [
        "macrocount_annual",
        [{
          id: "price_annual_legacy",
          active: true,
          currency: "usd",
          unit_amount: 3999,
          recurring: { interval: "year" },
        }],
      ],
    ]);
    catalog.products.search.mockResolvedValue({ data: [{ id: "prod_macrocount" }] });
    catalog.prices.list.mockImplementation(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
      data: pricesByLookupKey.get(lookup_keys[0]) ?? [],
    }));
    catalog.prices.create.mockImplementation(async (params: Record<string, unknown>) => {
      const price = {
        id: `price_${params.lookup_key}`,
        active: true,
        currency: params.currency,
        unit_amount: params.unit_amount,
        recurring: params.recurring,
      };
      pricesByLookupKey.set(String(params.lookup_key), [price]);
      return price;
    });
    catalog.prices.update.mockResolvedValue({});

    await ensureMacroCountStripeCatalog();

    expect(catalog.prices.create).toHaveBeenCalledTimes(3);
    expect(catalog.prices.create).toHaveBeenCalledWith(expect.objectContaining({
      lookup_key: "macrocount_weekly",
      unit_amount: 999,
      recurring: { interval: "week" },
      transfer_lookup_key: true,
    }));
    expect(catalog.prices.create).toHaveBeenCalledWith(expect.objectContaining({
      lookup_key: "macrocount_monthly",
      unit_amount: 3900,
      recurring: { interval: "month" },
      transfer_lookup_key: false,
    }));
    expect(catalog.prices.create).toHaveBeenCalledWith(expect.objectContaining({
      lookup_key: "macrocount_yearly",
      unit_amount: 19900,
      recurring: { interval: "year" },
      transfer_lookup_key: false,
    }));
    expect(catalog.prices.update).toHaveBeenCalledWith("price_weekly_legacy", { active: false });
    expect(catalog.prices.update).toHaveBeenCalledWith("price_annual_legacy", { active: false });
  });

  it("leaves a current three-plan catalog unchanged on later startups", async () => {
    const pricesByLookupKey = new Map<string, Array<Record<string, unknown>>>([
      ["macrocount_weekly", [{
        id: "price_weekly_current",
        active: true,
        currency: "usd",
        unit_amount: 999,
        recurring: { interval: "week" },
      }]],
      ["macrocount_monthly", [{
        id: "price_monthly_current",
        active: true,
        currency: "usd",
        unit_amount: 3900,
        recurring: { interval: "month" },
      }]],
      ["macrocount_yearly", [{
        id: "price_yearly_current",
        active: true,
        currency: "usd",
        unit_amount: 19900,
        recurring: { interval: "year" },
      }]],
    ]);
    catalog.products.search.mockResolvedValue({ data: [{ id: "prod_macrocount" }] });
    catalog.prices.list.mockImplementation(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
      data: pricesByLookupKey.get(lookup_keys[0]) ?? [],
    }));

    await ensureMacroCountStripeCatalog();

    expect(catalog.prices.create).not.toHaveBeenCalled();
    expect(catalog.prices.update).not.toHaveBeenCalled();
  });
});