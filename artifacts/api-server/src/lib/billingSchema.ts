import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * The API needs billing state before it can answer entitlement checks. Keep
 * this small, idempotent migration with service startup so a new deployment
 * never serves a paywall against an unmigrated public schema.
 */
export async function ensureBillingSchema() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS billing_profiles (
      owner_id text PRIMARY KEY,
      trial_started_at timestamptz NOT NULL,
      stripe_customer_id text,
      pending_checkout_session_id text,
      pending_checkout_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `));
  await db.execute(sql.raw(`
    ALTER TABLE billing_profiles
      ADD COLUMN IF NOT EXISTS pending_checkout_session_id text,
      ADD COLUMN IF NOT EXISTS pending_checkout_expires_at timestamptz;
  `));
  await db.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_profiles_stripe_customer_unique
      ON billing_profiles (stripe_customer_id);
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS billing_owner_aliases (
      alias_owner_id text PRIMARY KEY,
      billing_owner_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS billing_customer_links (
      owner_id text NOT NULL,
      stripe_customer_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `));
  await db.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_customer_links_owner_customer_unique
      ON billing_customer_links (owner_id, stripe_customer_id);
  `));
  await db.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_customer_links_customer_unique
      ON billing_customer_links (stripe_customer_id);
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS billing_reconciliation_state (
      job_name text PRIMARY KEY,
      last_event_created bigint NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS billing_subscription_reconciliation_retries (
      subscription_id text PRIMARY KEY,
      first_event_created bigint NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      last_attempt_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `));

  // Existing people completed onboarding before billing existed. Give each
  // canonical profile the same rollout trial exactly once, without creating
  // a second billing identity for an anonymous device already linked to one.
  await db.execute(sql.raw(`
    INSERT INTO billing_profiles (owner_id, trial_started_at)
    SELECT DISTINCT profile.session_id, now()
    FROM nutrition_profiles AS profile
    WHERE NOT EXISTS (
      SELECT 1
      FROM billing_profiles AS billing
      WHERE billing.owner_id = profile.session_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM billing_owner_aliases AS alias
      WHERE alias.alias_owner_id = profile.session_id
    )
    ON CONFLICT (owner_id) DO NOTHING;
  `));
}