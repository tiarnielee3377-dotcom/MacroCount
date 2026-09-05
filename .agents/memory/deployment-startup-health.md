---
name: Deployment startup health
description: Keep deployment health checks independent of slow external-service initialization.
---

Bind the HTTP server and expose its lightweight health endpoint before running long Stripe backfills or other external-service startup work.

**Why:** Replit publish promotion requires the configured port and startup health route to respond within its timeout. Waiting for a full remote synchronization before listening can fail promotion even when the application would eventually start correctly.

**How to apply:** Keep health checks independent of external APIs and databases where possible. Start listening first, then run network-heavy initialization while preserving explicit failure logging and process-failure behavior for unrecoverable startup errors.