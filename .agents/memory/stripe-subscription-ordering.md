---
name: Stripe subscription ordering
description: How MacroCount protects paid access from delayed or out-of-order subscription webhooks.
---

Treat Stripe subscription webhook payloads as notifications, not the final authority for billing state: revalidate subscriptions from Stripe before syncing and retain access when any linked customer subscription is active or trialing.

**Why:** Webhooks can be retried and delivered out of order. Persisting an old cancellation after a later renewal could otherwise remove paid access incorrectly.

**How to apply:** Preserve subscription revalidation in the Stripe sync client and make entitlement changes consider every synced subscription belonging to the billing owner’s linked customers.