# MacroCount

MacroCount is a mobile-first nutrition logger that estimates meal calories and macros from food photos or text descriptions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/macrosnap/` — mobile-first React app and its theme.
- `artifacts/api-server/src/routes/macrosnap.ts` — profile, meal logging, and AI estimate endpoints.
- `lib/api-spec/openapi.yaml` — API contract and generated hook source.
- `lib/db/src/schema/macrosnap.ts` — persistent profiles and meal logs.

## Architecture decisions

- Anonymous users receive an HTTP-only session cookie so onboarding and meals persist without requiring a login.
- Meal photos are sent as data URLs only for live analysis; they are not retained after the estimate is generated.

## Product

- Guided onboarding calculates daily calorie and macro targets from weight, goal, and activity level.
- Users can upload/capture a meal image or describe it, review an AI estimate, adjust portions, and save the meal.
- The dashboard shows remaining calories, macro progress, and today's meals with deletion.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run API code generation after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
