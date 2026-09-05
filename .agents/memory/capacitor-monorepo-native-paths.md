---
name: Capacitor monorepo native paths
description: How to handle invalid generated iOS dependency paths in pnpm monorepo CI builds.
---

Capacitor-generated iOS dependency paths can point into a machine-specific or incorrectly relative pnpm store location in monorepos. Resolve the native dependency from the app workspace and rewrite the generated reference after every Capacitor sync and before native dependency installation or Xcode resolution.

**Why:** Capacitor sync regenerates these references, so committing a corrected generated file is not durable; CI must repair the path after sync.

**How to apply:** In Codemagic or similar CI, place the repair immediately after `cap sync ios`. Confirm the resolved target exists and print the final rewritten reference before running CocoaPods or Swift package resolution.

Capacitor's Podfile may reference `scripts/pods_helpers` without its `.rb` extension. Node package resolution does not infer Ruby extensions, so a general path fixer must explicitly try an `.rb` fallback.