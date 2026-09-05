---
name: Billing outage isolation
description: How MacroCount should behave when Stripe initialization is unavailable.
---

Treat billing readiness separately from overall API health. Nutrition, meal logging, profiles, and account flows should remain usable while Stripe initialization is in progress or retrying. Billing endpoints must fail explicitly with a retryable unavailable response until initialization succeeds.

**Why:** Stripe is not on the critical path for recording nutrition data, so a temporary provider or synchronization outage must not take unrelated user data flows offline or produce misleading entitlement and checkout results.

**How to apply:** Any new route that depends on synchronized Stripe data or a live Stripe client must use the billing-availability gate. Any non-billing route that consults entitlement state must bypass that check while billing is unavailable.

After bounded startup retries are exhausted, keep recovery automatic with a slower capped backoff. Recovery attempts must be serialized, must not keep the process alive on their own, and must start periodic reconciliation once Stripe becomes available.

**Why:** A provider outage can outlast the startup retry budget, and requiring an API restart leaves checkout and subscription management unavailable after Stripe itself has recovered.

**How to apply:** Keep startup and long-outage logs distinct, schedule the next recovery only after the current attempt finishes, and stop pending recovery timers when the server closes.