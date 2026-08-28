import { text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

/**
 * MacroCount-owned billing state. Stripe remains the source of truth for
 * products, prices, customers, and subscriptions in the managed stripe schema.
 */
export const billingProfilesTable = pgTable(
  "billing_profiles",
  {
    ownerId: text("owner_id").primaryKey(),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    pendingCheckoutSessionId: text("pending_checkout_session_id"),
    pendingCheckoutExpiresAt: timestamp("pending_checkout_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("billing_profiles_stripe_customer_unique").on(table.stripeCustomerId)],
);

export type BillingProfile = typeof billingProfilesTable.$inferSelect;

/**
 * Retains the billing identity for an anonymous device after its progress is
 * linked to an account. This does not authenticate the device as that account;
 * it only prevents the device from starting a second trial after sign-out.
 */
export const billingOwnerAliasesTable = pgTable("billing_owner_aliases", {
  aliasOwnerId: text("alias_owner_id").primaryKey(),
  billingOwnerId: text("billing_owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An owner can have more than one Stripe customer after linking anonymous
 * progress to an existing account. These are relationship records only; all
 * customer and subscription data remains Stripe-owned and synced in stripe.*.
 */
export const billingCustomerLinksTable = pgTable(
  "billing_customer_links",
  {
    ownerId: text("owner_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_customer_links_owner_customer_unique").on(
      table.ownerId,
      table.stripeCustomerId,
    ),
    uniqueIndex("billing_customer_links_customer_unique").on(table.stripeCustomerId),
  ],
);