# Reviewer Prep — Principal Engineer Q&A

A pre-submission review of the Trade Blotter against the assessment criteria, plus
the questions a reviewer is most likely to ask and crisp answers you can give.
Weighted by the published rubric: Engineering 30%, TypeScript 20%, Full-Stack 20%,
UX 10%, Testing 10%, Communication 10%.

---

## 1. Scorecard (honest self-assessment)

| Area | Weight | State | Notes |
|------|--------|-------|-------|
| Engineering quality | 30% | Strong | Layered routes -> service -> repository, DI, single composition root, no SQL outside db/. |
| TypeScript usage | 20% | Strong | Branded TradeId, discriminated-union WsMessage, Readonly domain, Omit/Partial DTOs, unknown+guards at boundaries, no any. |
| Full-stack design | 20% | Strong | REST + WS split, envelope responses, soft-cancel status model, audit in same transaction. |
| UX | 10% | Good | Loading/empty/error states, toasts, disabled submits, a11y semantic table, colour+text state cues. |
| Testing | 10% | Strong | Backend 274, frontend 408; property-based via fast-check on parsers/validators/pagination. |
| Communication | 10% | Strong | README + AI-USAGE-REPORT + PROMPT-LOG all present and specific. |

Total functional + non-functional requirements: met. Bonus features done: audit
trail, position summary, P&L, virtualised grid, containerisation, deployment.
Only bonus NOT done: User Authentication (deliberate — documented as an assumption).

---

## 2. Gaps a reviewer will spot (fix before or be ready to explain)

1. **`database/` deliverable naming.** The brief lists `database/` as a top-level
   deliverable; our DB code lives in `backend/src/db/`. Not a functional problem,
   but a literal-minded reviewer may tick it as "missing". *Answer:* the database
   layer is `backend/src/db/` (connection, migrations, seed, repository); SQLite is
   file-based so there is no separate database service to host. Point them at the
   README Project Structure section. If you want zero doubt, add a short
   `database/README.md` pointing to `backend/src/db/` and the schema.
2. **Scratch files in the repo root** (`_be.txt`, `_bt.txt`, `_burst.txt`,
   `_sim.txt`, `_fe.txt`, `_tsc.txt`, `_toast.txt`). These are test-run capture
   files and should be gitignored/removed before submission — they look untidy.
3. **`figma-referemce/`** (note the typo) is a reference dump, not part of the app.
   Either remove it or note in the README that it is design reference only.
4. **No CI workflow.** Tests exist but there is no `.github/workflows`. A reviewer
   may ask "how do tests run on push?" *Answer:* run locally / in Docker build;
   CI was out of scope but is a one-file add.
5. **No authentication.** Expected — it is an explicit documented assumption. Have
   the "how I'd add it" answer ready (below).

---

## 3. Architecture decisions — the deep-dive answers

These are the questions most likely in an assessment titled around architecture.

### Q: Walk me through the request lifecycle for creating a trade.
Client POSTs `/api/v1/trades` -> Fastify validates the body against a JSON Schema
at the edge (rejects with 400 before any handler runs) -> route handler calls
`ITradeService.createTrade` -> service calls `ITradeRepository.create` (prepared
INSERT, server-generated id + tradeDate + ACTIVE status) -> repository returns the
persisted `Trade` -> service broadcasts `TRADE_CREATED` to all WS clients as a
post-commit side effect -> route returns 201 `{ data: trade }`. The originating
client updates its store from the broadcast, not the HTTP response — one code path
for all clients.

### Q: Why Fastify over Express or NestJS?
First-class TypeScript typing and built-in JSON Schema validation (ajv) so
requests are rejected at the edge without hand-written validation. Lighter and
faster than NestJS, whose decorator/module ceremony would add structure this
scope does not need. Better native types than Express.

### Q: Why SQLite / better-sqlite3? Isn't that a toy?
For a single-instance demo it is the right amount of database: zero-config,
file-based, no separate container or pool. `better-sqlite3` is synchronous, which
keeps the repository honest (no fake async wrappers around sync calls). I
documented the trade-off explicitly: it does not scale horizontally. Migration
path: the repository sits behind `ITradeRepository`, so swapping to Postgres is a
new implementation of that interface plus a connection change — no service or
route changes.

### Q: Why native WebSockets over Socket.IO or SSE?
The requirement is "broadcast JSON to all clients". Native `ws` + the browser
`WebSocket` API does exactly that with no extra protocol layer or client library.
SSE was viable (one-directional, simpler) but WS keeps the door open for future
client->server messages and is the more standard trading-desk choice. Socket.IO's
reconnection/room features are nice but unnecessary here, and its wire protocol is
non-standard.

### Q: How does the WebSocket server attach? Same port as HTTP?
Yes. `attachWebSocketServer` creates a `ws` server in `noServer` mode and hooks
the Node HTTP server's `upgrade` event, accepting upgrades only on `/ws` (any
other path gets a 404 + socket destroy). Same port as the REST API, so one
listener and one nginx proxy target. Each new client gets a `CONNECTION_ACK`.

### Q: What is your consistency model? What if the broadcast fails after the DB write?
Commit-then-broadcast, no rollback on broadcast failure. The DB write is the
source of truth; the broadcast is a best-effort post-commit side effect. If it
throws, the error is logged and the successful 201/200 is still returned — we do
NOT roll back a persisted trade because a socket send failed. This was a
deliberate decision that also fixed an early inconsistency where create behaved
differently from amend/cancel. A disconnected client recovers via a full refetch
on reconnect (we deliberately queue nothing during disconnect).

### Q: No optimistic updates — why? Isn't that slower UX?
Correct, it is one round-trip slower. I chose consistency over perceived speed:
the store is only mutated after the server-confirmed broadcast arrives, so
displayed state and server state never diverge. For a trading blotter, showing a
trade that then fails to persist is worse than a ~50ms delay. If needed, optimistic
create is a localized change in the mutation hooks.

### Q: How do you keep SQL out of the rest of the app?
The `db/` layer is the only place that imports better-sqlite3 or writes SQL. Row
types (`TradeRow`, `AuditRow`, snake_case) are never exported; `rowToTrade` /
`rowToAuditEntry` map to the camelCase domain model at the boundary. Service and
routes only ever see `Trade`. Enforced by the oop-compliance + architecture
steering and reviewable by grepping for `better-sqlite3` imports.

### Q: SQL injection — you build some SQL strings dynamically. Talk me through it.
Every user-supplied value is bound via `?` or named `@param` placeholders — never
string-concatenated. The dynamic parts are: (a) the `findAll` WHERE clause, which
concatenates only fixed clause fragments (`side = ?`) while the values go through
`params`; (b) the `update` SET clause, built from a fixed `UPDATABLE_COLUMNS`
allowlist with named params for the values. The one interpolation is
`stmtFindActive` embedding the `TradeStatus.ACTIVE` constant — a compile-time enum
literal, not user input. So there is no injection surface.

### Q: How are multi-table writes kept atomic (trade update + audit rows)?
`better-sqlite3` transactions. `update` wraps the trade UPDATE and all audit
INSERTs in `db.transaction(...)`; if the trade is missing it throws inside the
transaction so nothing commits. One PATCH that changes 3 fields writes 3 audit
rows + 1 update, all-or-nothing.

### Q: Dependency injection without a framework?
Constructor injection against interfaces. `TradeService` takes `ITradeRepository`
+ `BroadcastFn`; routes take `ITradeService`. Concrete classes are constructed
and wired ONLY in `server.ts` (the composition root). This gives testability
(inject mocks/`:memory:` SQLite) and a clean Liskov-substitutable boundary,
without a DI container.

### Q: How would you scale this to multiple backend instances?
Two changes: (1) replace SQLite with Postgres behind the same `ITradeRepository`;
(2) replace the in-process WS fan-out with a pub/sub backplane (Redis pub/sub or
NATS) so a mutation on node A broadcasts to clients connected to node B. The
service/route layers are untouched because both are behind abstractions. Sticky
sessions or a shared session store would handle WS affinity.

---

## 4. TypeScript questions

### Q: What does branding TradeId actually buy you?
`type TradeId = string & { readonly __brand: 'TradeId' }`. It is a compile-time
nominal type: you cannot pass a raw string or a trader name where a TradeId is
expected without going through `createTradeId()`. Zero runtime cost. Prevents a
whole class of "passed the wrong string" bugs at the API/service boundary.

### Q: Why discriminated unions for WS messages?
`type WsMessage = { type:'TRADE_CREATED'; payload:Trade } | { type:'TRADE_CANCELLED'; payload:{id:string} } | ...`.
The `type` field narrows the payload, so in the handler `if (msg.type === 'TRADE_CANCELLED')`
gives you `payload.id` typed correctly and the compiler errors if you access a
field that type doesn't have. Exhaustiveness-checked.

### Q: How do you handle untrusted external data (API responses, WS frames, DB rows)?
Receive as `unknown`, narrow with type guards (`isApiErrorBody`, message shape
checks), never cast with `as` on untrusted input. DB rows are the one controlled
boundary where a typed row interface + explicit mapping is used. No `any`.

### Q: API contract — how do FE and BE stay in sync without a shared package?
The `Trade` type is defined in both `types/` folders with the same shape (the
brief said not to invent a shared package for this scope). The frontend Zod schema
mirrors the backend JSON Schema field-for-field. Trade-off: two definitions can
drift; mitigated by keeping them small and colocated with tests. At larger scale
I'd extract a shared types package or generate types from an OpenAPI spec.

---

## 5. Full-stack / API design questions

### Q: Why PATCH for amend and DELETE for cancel?
PATCH = partial update (amend any subset of fields), which is exactly the semantic
— not PUT (full replace). DELETE = cancel, but it is a SOFT delete: it transitions
status to CANCELLED and retains the row for the audit trail. Documented so nobody
expects a hard delete.

### Q: What is your error response contract?
Always `{ error: { code, message, statusCode } }`, with an optional `fields` map
on validation errors. Codes are machine-readable (`TRADE_NOT_FOUND`,
`TRADE_CANCELLED`, `VALIDATION_ERROR`). A global Fastify error handler maps
`AppError` instances to this shape and converts unexpected errors to a generic 500
without leaking internals. The frontend maps codes to human messages centrally.

### Q: Status codes?
200 read/update, 201 create, 400 validation, 404 not found, 409 conflict
(amending/cancelling a cancelled trade), 500 unexpected. All exercised in tests.

### Q: Why is GET /trades doing in-memory pagination?
The repository returns the filtered set ordered newest-first; the service slices
the page and reports the full `total` in `meta`. For ~500–10k trades this is
simpler and fast. Trade-off documented; for very large sets I'd push LIMIT/OFFSET
(or keyset pagination) into SQL. Filtering/sorting on the loaded set is also done
client-side in the grid so WS updates don't trigger refetches.

---

## 6. UX questions

- **States:** every async surface renders one of loading / data / empty / error;
  the audit panel and blotter both have explicit empty and retryable-error states.
- **Feedback:** success/error toasts on every mutation, now solid-opaque so they
  stay legible over the ticker tape; submit buttons disabled in-flight to stop
  double-submit.
- **Accessibility:** semantic `<table>`, labelled inputs, `aria-describedby` on
  errors, `aria-sort` on headers, colour is never the only signal (cancelled rows
  use opacity + strikethrough; connection status uses text + colour).
- **Live update UX:** new trades insert newest-first; while scrolled away the view
  freezes a snapshot so rows don't jump under the pointer; stream is paced/pausable.

---

## 7. Testing questions

- **Numbers:** backend 274 tests (16 files), frontend 408 tests (38 files). tsc
  clean both.
- **Property-based:** fast-check covers id generation format, audit-row-count ==
  changed-field-count, row-mapping round trip, pagination count invariant, filter
  correctness, validation rejection.
- **Boundaries mocked correctly:** service tested against a mocked repository +
  broadcast; repository tested against real `:memory:` SQLite; routes tested via
  Fastify `inject` with a mocked service.
- **What's thinner:** no end-to-end (browser) tests and no CI. Honest answer if
  asked: unit + integration cover the logic; E2E/CI were scoped out for time but
  are the next addition.

---

## 8. The "what would you do differently / next" answer

- Add User Authentication (JWT + a login form gating the API and UI); audit
  `changedBy` would then be the real user instead of `SYSTEM`.
- Add a CI workflow (lint + typecheck + both test suites on push).
- Extract a shared types package (or OpenAPI-generated client) to remove FE/BE
  type duplication.
- Move pagination/filtering into SQL for very large datasets; add keyset
  pagination.
- Redis pub/sub backplane + Postgres for multi-instance horizontal scale.
- Add E2E tests (Playwright) for the create -> live-update -> cancel flow.

---

## 9. One-line rehearsed openers

- **Elevator:** "Full-stack real-time trade blotter: React 18 + TanStack Table
  front end, Fastify + SQLite + native WebSocket back end, layered and
  interface-driven, ~680 tests, Dockerised, one-command run."
- **Biggest strength:** "Clean layering behind interfaces — SQL never leaves the
  db layer, business rules never leave the service, and the composition root is
  the only place that knows concrete classes."
- **Biggest trade-off:** "SQLite single-instance and no optimistic updates — both
  deliberate, both documented, both a small change to reverse if the scope grew."
