---
name: Stripe webhook signing
description: How MacroCount configures verification for StripeSync webhook delivery.
---

Supply the Stripe connector's managed webhook secret when constructing the Stripe synchronization client.

**Why:** StripeSync otherwise tries to discover the secret from its managed-webhook database record. Explicit connector configuration makes signature verification available immediately and prevents a newly configured or changed endpoint from depending on that lookup.

**How to apply:** Preserve the webhook-secret option whenever Stripe synchronization client construction is changed, and cover it with configuration-level testing.