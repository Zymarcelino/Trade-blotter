---
inclusion: always
---

# Steering: Test-Driven Development

TDD is the default workflow for all logic in this repo. "Logic" means anything
with behaviour: services, repositories, routes, hooks, stores, pure utilities,
and reducers. Trivial presentational-only components are the only exception.

## The loop (red -> green -> refactor)
1. RED: write a failing test that states the desired behaviour before (or
   alongside) the implementation. Run it and see it fail for the RIGHT reason.
2. GREEN: write the minimum implementation to make it pass.
3. REFACTOR: clean up with the test as a safety net; keep it green.

## Co-location
- Tests live next to the code they cover: `foo.ts` -> `foo.test.ts`,
  `Foo.tsx` -> `Foo.test.tsx`. No separate `__tests__` mirror tree.

## Test at the right boundary
- Service: against a MOCKED `ITradeRepository` + mocked `BroadcastFn` (unit).
- Repository: against a REAL in-memory SQLite (`:memory:`) - exercise real SQL.
- Routes: via Fastify `inject()` with a mocked service.
- Frontend hooks/stores: unit; components via React Testing Library; network via MSW.
- Test observable behaviour and contracts, not private internals.

## Property-based tests
- For logic with a large input space (id generation, field diffing, row
  mapping, pagination, filtering, validation, aggregation/P&L), add a
  `fast-check` property test alongside the example-based ones.
- Minimum 100 iterations per property. Tag each with the exact format:
  `// Feature: trade-blotter, Property N: <property text>`.

## Cover the error paths
- Do not test only the happy path. Assert the 4xx/409/404/400 branches, network
  failure (`statusCode: 0`), parse failure, and "failed mutation does not mutate
  state" invariants.

## Definition of done
- New or changed behaviour ships WITH its tests in the same change.
- The affected suite passes (`npx vitest run`) and `npx tsc --noEmit` is clean.
- No skipped/`.only` tests are committed.
