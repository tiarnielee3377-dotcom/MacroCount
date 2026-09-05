import app from "./app";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { ensureBillingSchema } from "./lib/billingSchema";
import {
  beginBillingInitialization,
  markBillingAvailable,
  markBillingUnavailable,
} from "./lib/billing";
import { runMigrations } from "stripe-replit-sync";
import {
  ensureMacroCountStripeCatalog,
  getStripeSync,
  reconcileRecentStripeSubscriptions,
} from "./stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const STRIPE_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;
const STRIPE_INITIALIZATION_MAX_ATTEMPTS = 4;
const STRIPE_INITIALIZATION_BASE_DELAY_MS = 1_000;
const STRIPE_INITIALIZATION_MAX_DELAY_MS = 10_000;
const STRIPE_RECOVERY_BASE_DELAY_MS = 60_000;
const STRIPE_RECOVERY_MAX_DELAY_MS = 15 * 60_000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initializeStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe synchronization.");
  }

  await ensureBillingSchema();
  await runMigrations({ databaseUrl });
  await ensureMacroCountStripeCatalog();
  const stripeSync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) {
    throw new Error("REPLIT_DOMAINS is required to configure the Stripe webhook.");
  }

  await stripeSync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  await stripeSync.syncBackfill({ object: "all" });
}

function startReconciliation() {
  let reconciliationInFlight = false;
  const reconcileSubscriptions = async () => {
    if (reconciliationInFlight) return;

    reconciliationInFlight = true;
    try {
      const result = await reconcileRecentStripeSubscriptions();
      const details = {
        events: result.events,
        subscriptions: result.subscriptions,
        failures: result.failures,
      };
      if (result.failures > 0) {
        logger.warn(details, "Stripe subscription reconciliation will retry failed subscriptions");
      } else {
        logger.info(details, "Stripe subscription reconciliation completed");
      }
    } catch (error) {
      // A failed run must not stop future scheduled attempts.
      logger.error({ err: error }, "Stripe subscription reconciliation failed");
    } finally {
      reconciliationInFlight = false;
    }
  };

  const reconciliationTimer = setInterval(() => {
    void reconcileSubscriptions();
  }, STRIPE_RECONCILIATION_INTERVAL_MS);
  reconciliationTimer.unref();
  void reconcileSubscriptions();
}

type StripeInitializer = () => Promise<void>;

export type StripeInitializationRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  recoveryBaseDelayMs?: number;
  recoveryMaxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export type ServerStartup = {
  server: ReturnType<typeof app.listen>;
  initialization: Promise<void>;
};

type StripeInitializationAttempt =
  | { initialized: true }
  | { initialized: false; error: unknown };

function getBackoffDelay(baseDelayMs: number, maxDelayMs: number, attempt: number) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

function createStripeInitializationAttempt(initialize: StripeInitializer) {
  let inFlight: Promise<StripeInitializationAttempt> | undefined;

  return async function runAttempt(): Promise<StripeInitializationAttempt> {
    if (inFlight) return inFlight;

    const attempt = (async (): Promise<StripeInitializationAttempt> => {
      beginBillingInitialization();
      try {
        await initialize();
        markBillingAvailable();
        return { initialized: true };
      } catch (error) {
        markBillingUnavailable();
        return { initialized: false, error };
      }
    })();
    inFlight = attempt;

    try {
      return await attempt;
    } finally {
      if (inFlight === attempt) inFlight = undefined;
    }
  };
}

async function initializeStripeWithRetry(
  runAttempt: () => Promise<StripeInitializationAttempt>,
  options: StripeInitializationRetryOptions = {},
): Promise<boolean> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? STRIPE_INITIALIZATION_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? STRIPE_INITIALIZATION_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? STRIPE_INITIALIZATION_MAX_DELAY_MS);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runAttempt();
    if (result.initialized) {
      logger.info({ attempt }, "Stripe synchronization initialized");
      return true;
    }

    const isLastAttempt = attempt === maxAttempts;
    if (isLastAttempt) {
      logger.error(
        { err: result.error, attempt, maxAttempts },
        "Stripe initialization unavailable after retries",
      );
      return false;
    }

    const delayMs = getBackoffDelay(baseDelayMs, maxDelayMs, attempt);
    logger.warn(
      { err: result.error, attempt, maxAttempts, nextDelayMs: delayMs },
      "Stripe initialization failed; retrying",
    );
    await sleep(delayMs);
  }

  return false;
}

function startStripeRecovery(
  runAttempt: () => Promise<StripeInitializationAttempt>,
  onRecovered: () => void,
  options: StripeInitializationRetryOptions,
  onStop?: () => boolean,
): () => void {
  const recoveryBaseDelayMs = Math.max(
    0,
    options.recoveryBaseDelayMs ?? STRIPE_RECOVERY_BASE_DELAY_MS,
  );
  const recoveryMaxDelayMs = Math.max(
    recoveryBaseDelayMs,
    options.recoveryMaxDelayMs ?? STRIPE_RECOVERY_MAX_DELAY_MS,
  );
  let recoveryAttempt = 0;
  let recoveryInFlight = false;
  let stopped = false;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleNextAttempt = () => {
    if (stopped || onStop?.()) return;

    recoveryAttempt += 1;
    const delayMs = getBackoffDelay(
      recoveryBaseDelayMs,
      recoveryMaxDelayMs,
      recoveryAttempt,
    );
    logger.info(
      { attempt: recoveryAttempt, nextDelayMs: delayMs, maxDelayMs: recoveryMaxDelayMs },
      "Stripe long-outage recovery scheduled",
    );
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      void recover();
    }, delayMs);
    recoveryTimer.unref?.();
  };

  const recover = async () => {
    if (stopped || onStop?.() || recoveryInFlight) return;

    recoveryInFlight = true;
    try {
      const result = await runAttempt();
      if (stopped || onStop?.()) return;

      if (result.initialized) {
        logger.info(
          { attempt: recoveryAttempt },
          "Stripe synchronization recovered after long outage",
        );
        onRecovered();
        return;
      }

      const nextDelayMs = getBackoffDelay(
        recoveryBaseDelayMs,
        recoveryMaxDelayMs,
        recoveryAttempt + 1,
      );
      logger.warn(
        {
          err: result.error,
          attempt: recoveryAttempt,
          nextDelayMs,
          maxDelayMs: recoveryMaxDelayMs,
        },
        "Stripe long-outage recovery attempt failed; retrying",
      );
      scheduleNextAttempt();
    } finally {
      recoveryInFlight = false;
    }
  };

  scheduleNextAttempt();

  return () => {
    stopped = true;
    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
    }
  };
}

export function startServer(
  serverPort: number,
  initialize: StripeInitializer = initializeStripe,
  afterInitialize: () => void = startReconciliation,
  retryOptions: StripeInitializationRetryOptions = {},
): ServerStartup {
  // Bind the port before the Stripe catalog/webhook setup and full backfill.
  // Replit's startup probe needs a responsive health endpoint while those
  // network-heavy initialization steps are running.
  const server = app.listen(serverPort, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port: serverPort }, "Server listening");
  });

  let serverClosed = false;
  let stopRecovery: (() => void) | undefined;
  if (server && typeof server.once === "function") {
    server.once("close", () => {
      serverClosed = true;
      stopRecovery?.();
    });
  }

  const runAttempt = createStripeInitializationAttempt(initialize);
  const initialization = initializeStripeWithRetry(runAttempt, retryOptions).then((initialized) => {
    if (initialized) {
      afterInitialize();
      return;
    }

    stopRecovery = startStripeRecovery(
      runAttempt,
      afterInitialize,
      retryOptions,
      () => serverClosed,
    );
  });

  return { server, initialization };
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const { initialization } = startServer(port);
  void initialization;
}
