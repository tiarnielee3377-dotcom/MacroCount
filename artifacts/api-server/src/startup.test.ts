import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { logger } from "./lib/logger";
import { isBillingAvailable } from "./lib/billing";

vi.stubEnv("DATABASE_URL", "postgres://startup-test");
vi.stubEnv("PORT", "8080");
vi.stubEnv("NODE_ENV", "test");

const { startServer } = await import("./index");

const runningServers: Array<ReturnType<typeof startServer>["server"]> = [];

async function closeServer(server: ReturnType<typeof startServer>["server"]) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

beforeAll(() => {
  vi.spyOn(logger, "info").mockImplementation(() => logger);
  vi.spyOn(logger, "error").mockImplementation(() => logger);
  vi.spyOn(logger, "warn").mockImplementation(() => logger);
});

afterAll(async () => {
  await Promise.all(runningServers.map(closeServer));
  vi.restoreAllMocks();
});

describe("production startup", () => {
  it("binds the health endpoint before slow Stripe initialization completes", async () => {
    let initializationFinished = false;
    let resolveInitialization!: () => void;
    const delayedInitialization = new Promise<void>((resolve) => {
      resolveInitialization = () => {
        initializationFinished = true;
        resolve();
      };
    });

    const startup = startServer(
      0,
      () => delayedInitialization,
      () => {},
    );
    runningServers.push(startup.server);

    const response = await request(startup.server).get("/api/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(initializationFinished).toBe(false);

    resolveInitialization();
    await startup.initialization;
    expect(initializationFinished).toBe(true);
  });

  it("keeps the API online when Stripe initialization is unavailable", async () => {
    const initializationError = new Error("Stripe setup is unavailable");
    const startup = startServer(
      0,
      async () => {
        throw initializationError;
      },
      () => {},
      { maxAttempts: 1, baseDelayMs: 0 },
    );
    runningServers.push(startup.server);

    await expect(startup.initialization).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      { err: initializationError, attempt: 1, maxAttempts: 1 },
      "Stripe initialization unavailable after retries",
    );

    const response = await request(startup.server).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(await request(startup.server).get("/api/billing/entitlement")).toMatchObject({
      status: 503,
      body: {
        code: "BILLING_UNAVAILABLE",
        retryable: true,
      },
    });
  });

  it("recovers billing after the startup retry budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      const initializationError = new Error("Extended Stripe outage");
      let attempts = 0;
      const startup = startServer(
        0,
        async () => {
          attempts += 1;
          if (attempts === 1) throw initializationError;
        },
        () => {},
        {
          maxAttempts: 1,
          recoveryBaseDelayMs: 1_000,
          recoveryMaxDelayMs: 2_000,
        },
      );
      runningServers.push(startup.server);

      await expect(startup.initialization).resolves.toBeUndefined();
      expect(attempts).toBe(1);
      expect(isBillingAvailable()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        { attempt: 1, nextDelayMs: 1_000, maxDelayMs: 2_000 },
        "Stripe long-outage recovery scheduled",
      );

      await vi.advanceTimersByTimeAsync(1_000);

      expect(attempts).toBe(2);
      expect(isBillingAvailable()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        { attempt: 1 },
        "Stripe synchronization recovered after long outage",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers billing after an initial Stripe initialization failure", async () => {
    const initializationError = new Error("Temporary Stripe setup failure");
    let attempts = 0;
    const startup = startServer(
      0,
      async () => {
        attempts += 1;
        if (attempts === 1) throw initializationError;
      },
      () => {},
      { baseDelayMs: 0 },
    );
    runningServers.push(startup.server);

    await expect(startup.initialization).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: initializationError, attempt: 1, maxAttempts: 4, nextDelayMs: 0 },
      "Stripe initialization failed; retrying",
    );
    expect(isBillingAvailable()).toBe(true);
  });
});
