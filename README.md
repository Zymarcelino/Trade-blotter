# Trade Blotter

A full-stack, real-time trade blotter for equity trades. Users can view, create, amend, and cancel trades; every change is broadcast live over WebSockets so all connected clients converge on the same state without refreshing. Bonus features include a per-field audit trail, net positions by symbol, and mark-to-market P&L.

- **Frontend:** React 18 + TypeScript + Vite, TanStack Table (+ Virtual), Zustand, TanStack Query, React Hook Form + Zod, CSS Modules.
- **Backend:** Fastify + TypeScript, SQLite (better-sqlite3), native WebSockets (ws).
- **Packaging:** Docker + Docker Compose; deployable to Render.

## Live demo (Render)

- **App (use this):** https://trade-blotter-frontend-r14l.onrender.com
- **API:** https://trade-blotter-backend-02lg.onrender.com/api/v1

The hosted services may sleep when idle; the first request wakes them (about 30-60s).

---

## 1. Architecture decisions

- **Fastify over Express / NestJS** - first-class TypeScript typing and built-in JSON Schema validation, so bad requests are rejected at the edge. Lighter than NestJS for this scope; better native typing than Express.
- **SQLite (better-sqlite3) over Postgres / Mongo** - zero-config, file-based, synchronous (no fake async in the repository). It sits behind an `ITradeRepository` interface, so swapping to Postgres later is a new implementation, not a service/route rewrite.
- **Native WebSockets (ws) over Socket.IO / SSE** - the requirement is JSON broadcast to all clients; native `ws` + the browser `WebSocket` API meets it with no extra protocol layer. The client reconnects with bounded exponential backoff.
- **TanStack Table (+ Virtual) over AG Grid** - headless and semantic, so the grid markup stays accessible and controllable; virtualization handles large sets.
- **Zustand over Redux** - small global trade state with simple update patterns; server state stays in TanStack Query, and WebSocket updates patch the store directly.
- **Layered architecture** - routes to service to repository to db, wired only in a single composition root (`backend/src/server.ts`). No SQL leaves the persistence layer; no business logic lives in routes.
- **Multi-package layout** - the persistence layer is a standalone top-level `database/` package (`@trade-blotter/database`), and the domain types/interfaces it shares with the backend live in `shared/` (`@trade-blotter/shared`). The backend consumes both via TypeScript project references. This makes the database layer an explicit, independently testable deliverable and keeps a clean one-directional dependency (`shared <- database <- backend`) with no import cycle. Trade-off: a small monorepo (three `tsconfig`s, a repo-root Docker build context) instead of a single backend package.
- **Commit-then-broadcast** - a mutation is persisted first, then broadcast as a post-commit side effect. A failed broadcast is logged, never rolled back; the originating client updates from the broadcast (not the HTTP response), so all clients follow one code path.

## 2. Project structure

```
/
  README.md                 this file
  docker-compose.yml        one-command local run (frontend + backend)
  render.yaml               hosted deployment blueprint (two services)
  AI-USAGE-REPORT.md        how AI tools were used
  PROMPT-LOG.md             representative prompts + outcomes
  shared/                   @trade-blotter/shared - domain types, repo interface, id gen (source of truth)
  database/                 @trade-blotter/database - the SQLite persistence layer (all SQL)
    src/                    connection, migrations, seed, trade.repository (+ co-located tests)
    schema.sql, seed.sql    standalone DDL + seed reference
  backend/                  Fastify + WebSocket API (depends on shared + database)
    src/routes/             HTTP handlers (HTTP only)
    src/services/           business logic
    src/websocket/          WS server + broadcast fan-out
    src/marketdata/         simulated price feed (VWAP-seeded)
    src/types/              domain types + interfaces
    src/utils/              errors, id generation, diffing
    src/app.ts              Fastify app factory (routes + error handler)
    src/server.ts           composition root (wires concrete classes)
  frontend/                 React 18 + TypeScript + Vite SPA
    nginx.conf              static SPA serving (SPA routing)
    src/components/         Modal, ToastContainer, ErrorBoundary, ...
    src/features/           blotter, forms, audit, analytics
    src/hooks/              data fetching + WebSocket bridge
    src/services/           api client, trade api, websocket client
    src/store/              Zustand trade store
    src/types/              domain types (mirror backend)
    src/utils/              formatters, validation schema, positions math
    src/config/             env.ts (single source of API/WS URL resolution)
```

The `database/` package IS the SQLite persistence layer (`connection`, `migrations`, `seed`, `trade.repository`). It depends only on `@trade-blotter/shared` and is consumed by the backend via TypeScript project references. SQLite is an embedded file, not a separate service. See `database/README.md`.

## 3. Prerequisites

- Node.js 20+
- Docker & Docker Compose (for the containerised run)

## 4. Installation and running

### Option A - Docker Compose (recommended)

From the repository root:

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:80
- API: http://localhost:3000/api/v1
- WebSocket: ws://localhost:3000/ws

The frontend nginx serves the SPA and proxies `/api` and `/ws` to the backend, so everything is same-origin locally. The SQLite file is persisted to `./backend/data` via a mounted volume.

### Option B - run each package directly (no Docker)

The backend depends on two local packages (`shared/`, `database/`) via TypeScript project references, so install and build those first.

```bash
# One-time: install + build the shared and database packages first
cd shared    && npm install && npm run build && cd ..
cd database  && npm install && npm run build && cd ..

# Terminal 1 - backend on http://localhost:3000
cd backend
npm install
npm run dev

# Terminal 2 - frontend on http://localhost:5173
cd frontend
npm install
npm run dev
```

In this split-origin dev setup, `frontend/.env.development` points Vite at the backend (`VITE_API_BASE_URL=http://localhost:3000/api/v1`, `VITE_WS_URL=ws://localhost:3000/ws`). These are dev-only overrides.

### Hosted deployment (Render)

`render.yaml` (a Blueprint) provisions two web services: the backend (Fastify + SQLite + WebSocket, with a persistent disk) and the frontend (static nginx). Because Render web services cannot address each other by bare name, the frontend SPA calls the backend's PUBLIC URL directly - the backend URL is baked into the Vite build via `VITE_API_BASE_URL` / `VITE_WS_URL` build args, and the backend's CORS allows it. To deploy: Render, then New, then Blueprint, then connect this repo.

## 5. Running tests

```bash
# Database package (Vitest + fast-check; against real in-memory SQLite)
cd database
npm test

# Backend (Vitest + fast-check; service / routes / websocket / app)
cd backend
npm test
npm run test:coverage

# Frontend (Vitest + React Testing Library + MSW)
cd frontend
npm test
npm run test:coverage
```

All three suites include property-based tests (fast-check) for logic with large input spaces (id generation, row mapping, diffing, pagination, filtering, validation, position math). The SQLite repository properties live in the `database` package; the service/route/websocket tests live in `backend`.

## 6. API reference (summary)

Base URL: `/api/v1`. Success responses are `{ data }` (collections add `meta`); errors are `{ error: { code, message, statusCode } }`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | /trades | List with optional symbol/side/status/trader filters + page/pageSize |
| POST | /trades | Create a trade (validated) |
| GET | /trades/:id | Fetch one trade |
| PATCH | /trades/:id | Amend an active trade |
| DELETE | /trades/:id | Cancel a trade (soft status transition) |
| GET | /trades/:id/audit | Amendment history for a trade |
| GET | /audit | Global audit feed (newest first) |
| GET | /positions | Net position per symbol (active trades) |
| GET | /pnl | Notional-based P&L per symbol |
| GET | /prices | Current simulated market prices |
| POST | /trades/random | Bulk-create N randomised trades (demo/load) |

WebSocket at `/ws`: server-to-client CONNECTION_ACK, TRADE_CREATED, TRADE_AMENDED, TRADE_CANCELLED, and PRICE_TICK messages.

## 7. Assumptions made

- **No authentication** - the API is open; all audit entries are attributed to SYSTEM. (Auth is a listed bonus, deliberately not implemented.)
- **Single-user / single-instance demo**, not multi-tenant.
- **Trades are cancelled, never deleted** - DELETE is a soft status transition to CANCELLED; the row is retained for the audit trail.
- **Symbol validation is format-only** (`^[A-Z]+$`), not checked against a real instrument reference.
- **Prices are simulated** - seeded from the VWAP of active trades and drifted per tick (no external market feed); surfaced in the UI as "simulated".

## 8. Trade-offs accepted

- **SQLite is single-instance / not horizontally scalable** - acceptable for this scope; the repository interface makes a Postgres swap straightforward.
- **No optimistic UI updates** - the store updates only after the server-confirmed broadcast, keeping displayed and server state in lockstep at the cost of a small round-trip delay.
- **In-memory pagination/filtering** - the client loads the trade window (capped at 10k) and filters/sorts it in the browser; for very large datasets this would move to SQL (keyset pagination).
- **Hosted: frontend calls the backend cross-origin** - because Render web services cannot resolve each other by name, the SPA calls the backend public URL directly (CORS-enabled) rather than same-origin proxying.
- **Free-tier hosting is ephemeral** - without a persistent disk the DB re-seeds 500 trades on each empty startup and services sleep when idle; user-created trades do not survive a restart.

## 9. Documentation

- `AI-USAGE-REPORT.md` - which AI tools were used, how, example prompts, and where AI suggestions were accepted vs rejected.
- `PROMPT-LOG.md` - a representative sample of significant prompts and their outcomes.
- `database/README.md` - database layer location and schema.
