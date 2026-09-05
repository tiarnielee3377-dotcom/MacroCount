---
name: OpenAPI format compatibility
description: Compatibility rule for string formats in the shared OpenAPI contract and generated Zod validators.
---

Use an explicit OpenAPI `pattern` for email-shaped input instead of `format: email` until the generator and installed Zod runtime are aligned.

**Why:** The current generator emits `zod.email()` for `format: email`, but the workspace runtime does not export that helper. Code generation succeeds before the chained TypeScript validation fails.

**How to apply:** For email fields in the shared API contract, use `type: string` with a practical validation pattern and keep client form inputs as `type="email"`. Revisit this rule only after validating a generator/runtime upgrade with a fresh codegen run.