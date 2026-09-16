# AI Usage Report

This document describes how AI tooling was used to build the Trade Blotter, which
decisions it influenced, and where its output was accepted as-is versus rejected or
reworked. It is written to be honest and specific rather than promotional.

---

## Which AI tools were used

- **Kiro** - an AI IDE / agent - was the primary and only code-generation tool. It was
  used in three distinct modes:
  - **Spec workflow**: structured generation of `requirements.md`, `design.md`, and
    `tasks.md` under `.kiro/specs/trade-blotter/` before any code was written.
  - **Steering files**: persistent, always-on project rules under `.kiro/steering/`
    (architecture, api-design, database, domain-modelling, error-handling,
    oop-compliance, tdd, test-coverage, typescript-best-practices, validation, docker,
    realtime, audit-trail, ux-best-practices, code-generation, readme-and-docs) that
    constrained how all subsequent code was generated.
  - **Task-scoped sub-agents**: agents that implemented one numbered task at a time
    from `tasks.md`, wrote co-located tests, and ran them.
- **Kiro agent hooks** were later added under `.kiro/hooks/` to validate code
  generation, test coverage, and TDD discipline on save.
- No other code assistant (e.g. Copilot) was used, so this report claims none.

---

## How they were used

1. **Spec first.** The feature was fully specified before implementation: an
   EARS-format requirements document, a layered design with the domain type
   contracts, DB schema, REST + WebSocket protocol, and ~26 numbered correctness
   properties, and a dependency-ordered 25-task plan.
2. **Steering encoded conventions once.** Rather than re-stating rules in every
   prompt, steering files fixed the conventions (branded IDs, no SQL outside the db
   layer, no `any`, commit-then-broadcast, tests ship with code). Generated code
   followed them without re-prompting.
3. **Implementation task-by-task in dependency order.** Backend types -> db layer ->
   service -> routes -> composition root; then frontend types -> api client -> store ->
   hooks -> components; then Docker/deploy/docs. Each module was generated with its
   co-located test.
4. **Property-based tests** (fast-check) were generated for logic with large input
   spaces (id generation, field diffing, row mapping, pagination, filtering,
   validation, position aggregation).
5. **UI was iterated against a Figma reference** for the dark trading-desk look, kept
   on the required React + CSS Modules stack (the reference used Tailwind; that was
   deliberately not adopted).

---

## Examples of prompts

1. "Create a spec for a full-stack trade blotter with a React + TypeScript frontend,
   a Node.js + Fastify backend, SQLite, native WebSockets, and Docker."
   - Outcome: 15-requirement EARS spec; Fastify chosen over Express/NestJS, SQLite via
     better-sqlite3, native `ws` over Socket.IO.
2. "Generate the shared domain types: a branded `TradeId` with a factory,
   `TradeSide`/`TradeStatus` const objects, `Trade` as Readonly, request DTOs via
   `Omit`/`Partial`, and a discriminated-union `WsMessage`."
   - Outcome: accepted with minor tightening; became the single source of truth,
     mirrored on the frontend.
3. "Implement `TradeService` with red-green-refactor: write failing tests against a
   mocked `ITradeRepository` and `BroadcastFn`, then implement."
   - Outcome: accepted; service depends only on interfaces, wired only in `server.ts`.
4. "Build the blotter grid with sorting, debounced global filter, per-column filters,
   client pagination, and dimmed + struck-through cancelled rows."
   - Outcome: accepted after adapting to the installed TanStack Table v9 API.
5. "Positions/P&L should recalculate as trades come in and as prices tick."
   - Outcome: reworked a server-fetch version into a live client-side
     `computePositions(trades, marketPrices)` so both new trades and price ticks
     update instantly.

---

## Key architectural / implementation decisions influenced by AI

- **Layered architecture with a single composition root.** Routes depend on
  `ITradeService`; the service depends on `ITradeRepository` + `BroadcastFn`; concrete
  classes are constructed only in `server.ts`. Came directly from the design + OOP
  steering.
- **Branded `TradeId` and discriminated-union `WsMessage`** for strong domain
  modelling and exhaustively-typed message handling.
- **Commit-then-broadcast with no rollback on broadcast failure** - a persisted
  mutation still returns 200/201 even if the subsequent broadcast throws (logged).
  This resolved an early inconsistency between the create and amend/cancel paths.
- **Same-origin runtime URL resolution** (`config/env.ts`) so one frontend build runs
  both local Docker and hosted deployment without a rebuild.
- **No optimistic UI updates** - the store is updated only after the server-confirmed
  WebSocket broadcast, keeping displayed and server state in lockstep.
- **Simulated VWAP-seeded price feed** (no external market API) for live
  mark-to-market P&L, surfaced in the UI as "simulated".

---

## Where AI suggestions were accepted as-is

- The `AppError` / `ApiError` shapes and the structured `{ error: { code, message,
  statusCode } }` response contract.
- The Zod client schema mirroring the backend field validation.
- The generated fast-check property generators and invariants.

## Where AI suggestions were rejected or modified, and why

- **TanStack Query v5 `onSuccess`-on-query pattern** was suggested but no longer
  exists in v5; store sync was moved into an effect reacting to query data.
- **Zod `coerce.number()` turned empty input into 0**, silently passing the
  "positive number" rule; replaced with a preprocess that treats empty/whitespace as
  missing so the required error fires.
- **TanStack Table v8 API** was assumed by generated code, but the installed version
  is v9; the grid was reworked to the v9 headless API rather than downgrading.
- **Tooling major-version drift** (a vitest 5.x / a TypeScript 7.x preview) was
  suggested; pinned to vitest 3.2.7 and TypeScript 5.9.3 for a consistent toolchain.
- **Fastify `removeAdditional: true`** silently stripped unknown request fields;
  reconfigured so unknown fields are rejected as `VALIDATION_ERROR`.
- **A reference design built on Tailwind** was used only as a visual target; the app
  stays on the required React + CSS Modules stack (no Tailwind).
- **A server-fetch Positions view** (produced during a source reconstruction) was
  reworked into a live client-side computation so P&L updates on every trade + tick.

---

*This report reflects the actual workflow. Package versions cited match those pinned
in `backend/package.json` and `frontend/package.json`.*
