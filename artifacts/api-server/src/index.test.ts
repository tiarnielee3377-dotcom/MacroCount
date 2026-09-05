import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureBillingSchema: vi.fn(),
  ensureMacroCountStripeCatalog: vi.fn(),
  findOrCreateManagedWebhook: vi.fn(),
  getStripeSync: vi.fn(),
  listen: vi.fn(),
  reconcileRecentStripeSubscriptions: vi.fn(),
  runMigrations: vi.fn(),
  syncBackfill: vi.fn(),
}));

vi.mock("./app", () => ({
  default: { listen: mocks.listen },
}));
vi.mock("./lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("./lib/billingSchema", () => ({
  ensureBillingSchema: mocks.ensureBillingSchema,
}));
vi.mock("stripe-replit-sync", () => ({
  runMigrations: mocks.runMigrations,
}));
vi.mock("./stripeClient", () => ({
  ensureMacroCountStripeCatalog: mocks.ensureMacroCountStripeCatalog,
  getStripeSync: mocks.getStripeSync,
  reconcileRecentStripeSubscriptions: mocks.reconcileRecentStripeSubscriptions,
}));

describe("API startup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PORT", "8080");
    vi.stubEnv("DATABASE_URL", "postgres://startup-test");
    vi.stubEnv("REPLIT_DOMAINS", "macrocount.example");
    mocks.ensureBillingSchema.mockResolvedValue(undefined);
    mocks.runMigrations.mockResolvedValue(undefined);
    mocks.ensureMacroCountStripeCatalog.mockResolvedValue(undefined);
    mocks.findOrCreateManagedWebhook.mockResolvedValue(undefined);
    mocks.getStripeSync.mockResolvedValue({
      findOrCreateManagedWebhook: mocks.findOrCreateManagedWebhook,
      syncBackfill: mocks.syncBackfill,
    });
    mocks.reconcileRecentStripeSubscriptions.mockResolvedValue({
      events: 0,
      subscriptions: 0,
      failures: 0,
    });
  });

  it("opens the configured port before a slow Stripe backfill completes", async () => {
    let finishBackfill: (() => void) | undefined;
    mocks.syncBackfill.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishBackfill = resolve;
        }),
    );

    const { startServer } = await import("./index.js");
    const startup = startServer(8080);

    await vi.waitFor(() => {
      expect(mocks.listen).toHaveBeenCalledWith(8080, expect.any(Function));
      expect(mocks.syncBackfill).toHaveBeenCalledTimes(1);
    });
    expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncBackfill.mock.invocationCallOrder[0],
    );

    finishBackfill?.();
    await startup.initialization;
  });
});