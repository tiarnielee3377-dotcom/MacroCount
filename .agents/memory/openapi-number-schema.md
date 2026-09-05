---
name: OpenAPI numeric schema compatibility
description: Generated Zod code in this workspace cannot consume OpenAPI integer types.
---

Use OpenAPI `number` for whole-number app values when generating the shared client and Zod validators.

**Why:** The current generator emits `zod.int()` for `integer` schemas, while the workspace's Zod runtime does not export that helper.

**How to apply:** Keep integer-like values whole with input validation and application logic, but represent them as `number` in the OpenAPI contract until the generator/runtime versions are aligned.