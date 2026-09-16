# Reviewer Prep - Principal Engineer Q&A

A pre-submission self-review of the Trade Blotter against the assessment rubric, plus
the questions a reviewer is most likely to ask and crisp answers. Weighted by the
published rubric: Engineering 30 / TypeScript 20 / Full-Stack 20 / UX 10 / Testing 10
/ Communication 10.

---

## 1. Scorecard (honest)

| Area | Weight | State | Notes |
|------|--------|-------|-------|
| Engineering quality | 30% | Strong | Layered routes -> service -> repository, DI, single composition root, no SQL outside db/. |
| TypeScript usage | 20% | Strong | Branded TradeId, discriminated-union WsMessage, Readonly domain, Omit/Partial DTOs, unknown+guards at boundaries, no any. |
| Full-stack design | 20% | Strong | REST + WS split, envelope responses, soft-cancel status model, audit in one transaction, same-origin runtime URLs. |
| UX | 10% | Strong | Loading/empty/error states, toasts, disabled submits, semantic a11y table, colour+text cues, dense reference-matched UI, live P&L. |
| Testing | 10% | Strong | Backend 68 tests (13 files, incl. property-based against in-memory SQLite + Fastify inject); frontend 130 tests (incl. property-based). |
| Communication | 10% | Strong | README, ARCHITECTURE.md, AI-USAGE-REPORT.md, PROMPT-LOG(-HIGHLIGHTS).md all present. |

All functional + non-functional requirements are met. Bonus features done: audit
trail, position summary, P&L, virtualised grid, containerisation, deployment. Only
bonus NOT done: User Authentication (deliberate, documented).

---

## 2. Gaps a reviewer will spot (be ready / fix)

1. **Test suites are present on both sides.** Backend 68 tests (13 files): utils,
   db layer against real in-memory SQLite, service against a mocked repository +
   broadcast, routes via Fastify `inject`, websocket ack/broadcast, the app error
   handler, and an in-memory create->get->amend->cancel->audit smoke test - plus the
   numbered property tests (1,2,3,6,8,9,10,11,14,15,18,4,5,7). Frontend 130 tests.
   (These were re-authored after a file-loss incident that wiped the original
   co-located tests; they match the current source and the spec's property list.)
2. **`database/` deliverable naming.** The brief lists `database/` as a deliverable;
   ours lives in `backend/src/db/` (connection, migrations, seed, repository). SQLite
   is file-based so there is no separate DB service. Point to the README structure; a
   one-line `database/README.md` pointer removes all doubt.
3. **No CI workflow.** Tests run locally / in the Docker build; CI is a one-file add.
4. **No authentication** - expected and documented as an assumption.
5. **FE/BE type duplication** - `Trade` is defined on both sides (kept in sync); at
   larger scale I would extract a shared package or generate from OpenAPI.

---

## 3. Architecture deep-dive answers

### Walk me through creating a trade end to end.
Client POSTs `/api/v1/trades` -> Fastify JSON-schema validates at the edge (400 on
failure) -> route calls `ITradeService.createTrade` -> service calls
`ITradeRepository.create` (server-generates id/tradeDate/ACTIVE status) -> repo
returns the Trade -> service broadcasts `TRADE_CREATED` post-commit -> route returns
201. The originating client updates its store from the broadcast, not the response.

### Why Fastify / SQLite / native ws?
Fastify: first-class TS + built-in schema validation, lighter than Nest. SQLite:
zero-config, synchronous, behind `ITradeRepository` so Postgres is a drop-in later.
Native ws: the requirement is JSON broadcast; no need for Socket.IO's protocol.

### Consistency model? Broadcast fails after the DB write?
Commit-then-broadcast, no rollback. DB is the source of truth; a failed broadcast is
logged and the 200/201 still returns. A client that missed it recovers on reconnect.

### Why no optimistic updates?
Consistency over perceived speed: the store updates only after the confirmed
broadcast, so we never show a trade that then fails to persist. Cost: a small
round-trip delay.

### SQL injection, given you build some SQL dynamically?
Every user value is bound via `?`/named params. The dynamic parts are a fixed set of
WHERE-clause fragments and an UPDATE SET built from a hardcoded column allowlist; the
one string interpolation is a compile-time status enum constant. No injection surface.

### Atomicity of amend + audit?
better-sqlite3 transaction: the trade UPDATE and all audit INSERTs commit together or
not at all.

### How does the P&L stay live?
Positions/P&L are computed on the client from the live trade store + latest prices
(`computePositions`), so they recompute on every new trade and every price tick. There
are also `/positions` and `/pnl` endpoints for a server view.

### How do filters stay usable during a high-frequency stream?
Incoming trades are buffered and drained at a rate-capped cadence. Filter options are
predefined (stable identity) and the toolbar is memoised with useCallback-stable
handlers, so the search box and dropdowns keep focus while trades stream in.

### How would you scale horizontally?
Postgres behind `ITradeRepository`, and a Redis/NATS pub-sub backplane so a mutation
on node A reaches clients connected to node B. Service/route layers are untouched
because both are behind abstractions.

---

## 4. TypeScript answers

- **Branded TradeId:** `string & { __brand }` - nominal at compile time, zero runtime
  cost; a raw string can't be passed where an id is expected.
- **Discriminated WsMessage:** `type` narrows the payload; handlers switch
  exhaustively.
- **Untrusted data:** received as `unknown`, narrowed with type guards
  (`isApiErrorBody`, message-type checks); no `as` on untrusted input; no `any` in
  domain code.
- **FE/BE contract:** `Trade` mirrored both sides; the Zod schema mirrors the backend
  JSON schema field-for-field.

---

## 5. UX answers

Every async surface renders loading/empty/error (errors retryable; during a retry
both show). Toasts on mutations (solid/opaque). Submit disabled in flight. Colour is
never the only signal (cancelled = opacity + strikethrough; connection = dot + text).
Timestamps are human-readable local time. The blotter stays interactive during the
stream (freeze-while-scrolled, memoised filters). Dense dark trading-desk UI matched to
the Figma reference on the required React + CSS Modules stack.

---

## 6. Testing answers

- **Frontend:** 130 tests (Vitest + RTL + MSW), including fast-check property tests
  (e.g. positions net qty = sum BUY - sum SELL).
- **Backend:** 68 tests across 13 files - service against a mocked repository +
  broadcast, repository against real in-memory SQLite, routes via Fastify inject, the
  app error handler, websocket ack/broadcast, and an in-memory round-trip smoke test,
  with fast-check property tests for the numbered correctness properties.
- **Next:** add CI (lint + typecheck + both suites on push) and Playwright E2E for the
  create -> live-update -> cancel flow.

---

## 7. The recovery story (if asked why some history looks unusual)

Mid-project a partial file deletion/corruption removed the backend `src`, parts of the
frontend `src`, the specs, and some docs (a few files were overwritten with binary
data). Recovery: backend restored from the compiled Docker output (runnable `dist` +
TypeScript source reconstructed from the emitted `.js`/`.d.ts`), frontend source and
the original CSS recovered from the compiled stylesheet, specs and steering
regenerated, all under version control now. It is documented honestly in the prompt
log; the backend tests have since been re-authored (68 tests).

---

## 8. One-line openers

- **Elevator:** "Full-stack real-time trade blotter: React 18 + TanStack Table front
  end, Fastify + SQLite + native WebSocket back end, layered and interface-driven,
  Dockerised, one-command run, with live mark-to-market P&L."
- **Biggest strength:** "Clean layering behind interfaces - SQL never leaves the db
  layer, business rules never leave the service, and the composition root is the only
  place that knows concrete classes."
- **Biggest gap:** "No CI yet and no browser E2E - both are small adds; the unit +
  integration suites (backend 68, frontend 130) and the spec's property list are in
  place."
