---
name: Stripe subscription reconciliation
description: Durable recovery of missed Stripe subscription webhooks.
---

Reconcile subscription changes from Stripe Events rather than using the subscriptions API's `created` filter. Persist a replaying event cursor and a separate retry queue for failed subscription refreshes; retry queue items survive event-retention limits.

**Why:** Renewals, pauses, resumptions, and status changes do not create new subscriptions, while temporary Stripe or database failures must remain eligible for later repair.

**How to apply:** Any billing recovery job should fetch recent subscription lifecycle events, retrieve the current subscription state from Stripe, write failed items to durable retry state before advancing its event cursor, and remove retry items only after a successful refresh.