---
name: Calendar-day rewards
description: Timezone and API-contract rules for daily history, streaks, challenges, and achievements.
---

Day-based rewards must receive the browser’s IANA timezone and use it consistently when grouping meals, filtering a selected day, calculating streaks, and choosing a daily challenge. Calendar-only API values must remain `YYYY-MM-DD` strings end-to-end rather than being coerced into timestamp values.

**Why:** UTC grouping can assign a late-night local meal to the wrong day, creating a mismatch between the dashboard and rewards. Date coercion can serialize a date-only value back as an ISO datetime, breaking client comparisons and history rendering.

**How to apply:** Any new daily nutrition endpoint or client query should include the device timezone, use the shared calendar-day helper on the client, and define calendar day fields as a patterned string in OpenAPI rather than `format: date` when the generated Zod contract coerces it to a `Date`.