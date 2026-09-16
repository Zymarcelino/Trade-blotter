# Architecture: Decisions and Trade-offs

This document captures the significant technical decisions behind the Trade Blotter
and the trade-offs accepted for each. It complements the layered-architecture rules
in `.kiro/steering/architecture.md` and the design in
`.kiro/specs/trade-blotter/design.md`.

---

## 1. System shape

A React 18 + TypeScript + Vite SPA talks to a Fastify + TypeScript API over SQLite,
which broadcasts every mutation to all clients over native WebSockets. The frontend
is served by nginx that reverse-proxies `/api` and `/ws` to the backend, so the SPA
is same-origin.

```
Browser (React SPA, Zustand store, WS client)
   |  REST  /api/v1            ^  WS  /ws (server -> client)
   v                           |
Fastify routes -> TradeService -> TradeRepository -> SQLite
                       |
                       +-> broadcast (ws) -> all clients
```

Consistency model: **commit-then-broadcast**. A mutation is persisted first, then
broadcast as a post-commit side effect; the originating client updates its store
from the broadcast (not the HTTP response), so every client follows one code path.

---

## 2. Key decisions and trade-offs

### Fastify over Express / NestJS
First-class TypeScript typing and built-in JSON Schema validation at the edge (reject
bad requests before any handler runs). Lighter than NestJS's decorator/module
ceremony for this scope; better native typing than Express.
- **Trade-off:** a smaller ecosystem of middleware than Express - acceptable here.

### SQLite (better-sqlite3) over Postgres / Mongo
Zero-config, file-based, and synchronous - which keeps the repository honest (no fake
async wrappers). Sufficient for a single-instance demo of hundreds to thousands of
trades.
- **Trade-off:** single-instance, not horizontally scalable. Mitigated by design: the
  repository sits behind `ITradeRepository`, so moving to Postgres is a new
  implementation + connection change, not a service/route rewrite.
- **Trade-off (native addon):** better-sqlite3 must be compiled against the runtime's
  Node + libc; the Docker build rebuilds it from source on Alpine to avoid a
  glibc/musl segfault.

### Native WebSockets (ws) over Socket.IO / SSE
The requirement is "broadcast JSON to all clients". Native `ws` + the browser
`WebSocket` API meets that with no extra protocol layer or client library. WS (vs SSE)
keeps a bidirectional channel open for the future.
- **Trade-off:** we implement reconnect ourselves (bounded exponential backoff,
  min(1000 * 2^(n-1), 30000)) rather than getting it from Socket.IO.

### TanStack Table (+ Virtual) over AG Grid
Headless and unstyled, so the grid markup stays semantic and fully controllable for
accessibility and styling. Virtualisation handles large streamed sets.
- **Trade-off:** we build cell rendering and toolbar ourselves; more code than a
  batteries-included grid, but full control.

### Zustand over Redux
Global trade state is small with simple update patterns. Zustand delivers it with far
less boilerplate; server state stays in TanStack Query, and WS updates patch the
Zustand store directly.
- **Trade-off:** less formal structure than Redux - fine at this size.

### Commit-then-broadcast, no rollback on broadcast failure
A persisted mutation returns 200/201 even if the subsequent broadcast throws (logged
at error level). The DB is the source of truth; we never roll back a committed trade
because a socket send failed.
- **Trade-off:** a client that missed a broadcast is briefly stale until it reconnects
  and refetches.

### No optimistic UI updates
The store updates only after the server-confirmed WebSocket broadcast, keeping
displayed and server state in lockstep.
- **Trade-off:** a small round-trip delay before a change appears, in exchange for
  never showing a trade that then fails to persist.

### Same-origin runtime URL resolution
`frontend/src/config/env.ts` defaults the API to a relative `/api/v1` and derives the
WS URL from `window.location`; `VITE_*` are optional dev-only overrides.
- **Benefit:** one frontend build runs local Docker and hosted deployment unchanged.

### Simulated, VWAP-seeded price feed
There is no external market-data API (keys, rate limits, offline failure). Prices are
seeded from the volume-weighted average price of active trades and drift slightly each
tick, broadcast as `PRICE_TICK`.
- **Trade-off:** P&L is a simulated mark-to-market, surfaced in the UI as "simulated".

### Client-side positions / P&L
Positions and P&L are computed on the client from the live trade store + latest prices
(`computePositions`), so they update instantly on both new trades and price ticks.
- **Trade-off:** duplicates some aggregation the backend can also do (there are
  `/positions` and `/pnl` endpoints), but gives real-time updates without polling.

### Streaming performance
High-frequency `TRADE_CREATED` messages are buffered and drained at a user-tunable,
rate-capped cadence (rows/tick + interval + pause), with virtualization, a rolling
store cap (10k), scroll-position preservation, and a freeze-while-scrolled snapshot.
Filter controls use predefined stable options and a memoised toolbar so they stay
interactive during the stream.
- **Trade-off:** the rolling cap means only the most recent N trades are retained in
  the client window.

---

## 3. Assumptions

- **No authentication.** The API is open; all audit entries are attributed to SYSTEM.
- **Single-user / single-instance demo**, not multi-tenant.
- **Trades are cancelled, never deleted** (soft status transition; row retained for
  the audit trail).
- **Symbol validation is format-only** (`^[A-Z]+$`), not checked against a real
  instrument reference.

---

## 4. Known gaps / what I would do next

- **Backend unit tests are not currently in the repo.** The backend source was
  reconstructed from compiled output after a file-loss incident; the co-located
  `.test.ts` files (described in the spec, ~274 tests) were not recovered and would be
  re-added next. The frontend suite (130 tests) is intact.
- Add a CI workflow (lint + typecheck + tests on push).
- Extract a shared types package (or OpenAPI-generated client) to remove the FE/BE
  type duplication.
- Push pagination/filtering into SQL (keyset pagination) for very large datasets.
- For horizontal scale: Postgres behind `ITradeRepository` + a Redis/NATS pub-sub
  backplane so a mutation on one node reaches clients on another.
- Add E2E tests (Playwright) for the create -> live-update -> cancel flow.
