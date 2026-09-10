---
name: Apple subscription state ordering
description: Durable rules for safely reconciling verified Apple subscription transactions, renewals, notifications, and account ownership.
---

Version transaction-derived state and renewal-derived state with separate Apple-signed timestamps. Apply only monotonic updates, with deterministic terminal precedence for equal-time revocations and renewal-state clears.

**Why:** App Store notifications can be duplicated, delayed, or delivered out of order. A newer transaction JWS does not necessarily supersede independently signed grace-period or billing-retry state, and an older client transaction must never clear a newer refund or revocation.

**How to apply:** Persist every fully verified notification transaction even before an owner claims it, but keep it unowned so it grants no access. Serialize ownership claims and account moves, attach retained rows on claim, and keep Apple schema/entitlement evaluation independent from Stripe network readiness.