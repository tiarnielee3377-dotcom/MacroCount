import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const STRIPE_SUBSCRIPTION_RECONCILIATION_JOB = "stripe_subscription_events";

export type StripeSubscriptionReconciliationRetry = {
  subscriptionId: string;
};

export async function getStripeSubscriptionReconciliationCheckpoint(): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT last_event_created
    FROM billing_reconciliation_state
    WHERE job_name = ${STRIPE_SUBSCRIPTION_RECONCILIATION_JOB}
  `);
  const value = (result.rows[0] as { last_event_created?: number | string } | undefined)
    ?.last_event_created;
  if (value == null) return null;

  const checkpoint = Number(value);
  return Number.isFinite(checkpoint) ? checkpoint : null;
}

export async function saveStripeSubscriptionReconciliationCheckpoint(
  lastEventCreated: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO billing_reconciliation_state (job_name, last_event_created)
    VALUES (${STRIPE_SUBSCRIPTION_RECONCILIATION_JOB}, ${lastEventCreated})
    ON CONFLICT (job_name) DO UPDATE
    SET last_event_created = GREATEST(
      billing_reconciliation_state.last_event_created,
      EXCLUDED.last_event_created
    ),
    updated_at = now()
  `);
}

export async function getPendingStripeSubscriptionReconciliationRetries(): Promise<
  StripeSubscriptionReconciliationRetry[]
> {
  const result = await db.execute(sql`
    SELECT subscription_id
    FROM billing_subscription_reconciliation_retries
    ORDER BY first_event_created ASC
  `);
  return result.rows
    .map((row) => (row as { subscription_id?: unknown }).subscription_id)
    .filter((subscriptionId): subscriptionId is string => typeof subscriptionId === "string")
    .map((subscriptionId) => ({ subscriptionId }));
}

export async function recordStripeSubscriptionReconciliationFailure(
  subscriptionId: string,
  firstEventCreated: number,
  error: unknown,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
  await db.execute(sql`
    INSERT INTO billing_subscription_reconciliation_retries (
      subscription_id,
      first_event_created,
      attempts,
      last_error,
      last_attempt_at
    )
    VALUES (${subscriptionId}, ${firstEventCreated}, 1, ${errorMessage}, now())
    ON CONFLICT (subscription_id) DO UPDATE
    SET attempts = billing_subscription_reconciliation_retries.attempts + 1,
        last_error = EXCLUDED.last_error,
        last_attempt_at = EXCLUDED.last_attempt_at,
        updated_at = now()
  `);
}

export async function resolveStripeSubscriptionReconciliationRetry(
  subscriptionId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM billing_subscription_reconciliation_retries
    WHERE subscription_id = ${subscriptionId}
  `);
}