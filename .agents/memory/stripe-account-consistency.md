---
name: Stripe account consistency
description: Keeping Stripe API clients aligned with the StripeSync account and its synchronized customer records.
---

When the app has StripeSync data or billing profiles already tied to a connected Stripe account, use that same connected account for catalog provisioning, Checkout, and StripeSync. Treat a separately configured `STRIPE_SECRET_KEY` only as a fallback when no connection is available.

**Why:** A different test-mode Stripe key can point to another account. Mixing it with an existing StripeSync database creates cross-account customer and Price references that fail at checkout or during sync.

**How to apply:** Prefer the connection credential whenever its runtime identity is available, preserve its managed webhook secret, and resolve Checkout Prices directly from that account rather than choosing ambiguous synced rows.

## Connector burst resilience

Concurrent Stripe webhook deliveries can briefly rate-limit the Replit connection credential endpoint even when the connection itself is healthy.

**Why:** Constructing a fresh StripeSync client per webhook fetches the connected credential each time; a checkout event burst can therefore produce a transient 429 before Stripe's own retry and periodic reconciliation repair the state.

**How to apply:** Preserve the connected-account preference, but add bounded retry/backoff around transient connection retrieval failures and test webhook bursts. Do not cache Stripe client objects across requests.