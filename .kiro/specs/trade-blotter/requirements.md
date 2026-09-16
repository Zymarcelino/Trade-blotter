# Requirements Document

## Introduction

The Trade Blotter is a full-stack, real-time trading-desk application. It presents a
data-dense grid of equity trades that desk and operations users can filter, sort,
page through, create, amend, and cancel. Every change is broadcast live over
WebSockets so all connected clients converge on the same state without a page
refresh, and every amendment is recorded in a per-field audit trail.

Requirements are written in EARS format (Easy Approach to Requirements Syntax).
Each requirement has a user story and numbered acceptance criteria. Criteria are
referenced by number (e.g. 4.2) from design.md and tasks.md for full traceability.

The domain model, DTOs, and API/WebSocket contracts are the single source of truth
shared between backend and frontend (mirrored, not physically shared, for this scope).

---

## Glossary

- **Trade**: An equity trade record with symbol, quantity, price, side, trader, book, counterparty, status, and timestamp.
- **Blotter**: The live grid listing all trades.
- **Amend**: A partial update to an ACTIVE trade that records per-field audit entries.
- **Cancel**: A soft status transition to CANCELLED; the row is retained, never deleted.
- **Audit entry**: A single recorded field-level change (field, oldValue, newValue, changedAt, changedBy).
- **EARS**: Easy Approach to Requirements Syntax, used for the acceptance criteria below.
- **Broadcast**: A server-to-client WebSocket message fanned out to all connected clients after a mutation.

---

## Requirements

## Requirement 1: Domain model and type safety

**User story:** As a developer, I want a strongly-typed domain model shared across
the stack, so that trades, DTOs, and messages are used consistently and incorrectly
typed values are rejected at compile time.

#### Acceptance criteria
1.1 The system SHALL define a branded `TradeId` type (`TRD-XXXXXX`) with a
    `createTradeId()` factory as the only sanctioned way to produce one.
1.2 The system SHALL model `TradeSide` (`BUY`/`SELL`) and `TradeStatus`
    (`ACTIVE`/`CANCELLED`) as const objects with derived union types (no enums).
1.3 The system SHALL define a `Trade` interface handled as `Readonly<Trade>` in the
    service and store layers so fields cannot be mutated after retrieval.
1.4 The system SHALL define `CreateTradeRequest` as `Omit<Trade, 'id' | 'tradeDate' | 'status'>`
    so the caller cannot supply server-generated fields.
1.5 The system SHALL define `AmendTradeRequest` as `Partial<Omit<Trade, 'id' | 'tradeDate'>>`.
1.6 The system SHALL define the `WsMessage` discriminated union so each `type`
    narrows its `payload` to a statically known shape.
1.7 The repository and service contracts SHALL contain no `any`.

---

## Requirement 2: Persistence and seeding

**User story:** As a user, I want trades stored durably and a realistic starting
dataset, so that the blotter is useful immediately on first run.

_Note: the brief calls for a dataset of approximately 100-1,000 trades and treats
startup seeding as optional. This system implements it: it seeds a fixed 500 trades
(within that range) when the table is empty._

#### Acceptance criteria
2.1 The system SHALL persist trades in SQLite and run schema migrations on startup
    before any route is served.
2.2 WHEN the `trades` table is empty on startup, the system SHALL seed a realistic
    dataset within the brief's 100-1,000 guidance; this implementation seeds exactly 500 trades.
2.3 The system SHALL assign seeded trade IDs `TRD-100001` through `TRD-100500` using
    a zero-padded 6-digit format.
2.4 Seeded trades SHALL use symbols from a fixed allowed set and valid books,
    counterparties, and traders.
2.5 Seeded trades SHALL have quantity in [100, 10000], price in [10.00, 1000.00], a
    valid ISO 8601 `tradeDate`, side in {BUY, SELL}, and status in {ACTIVE, CANCELLED}.
2.6 The system SHALL NOT seed when the `trades` table already contains rows.
2.7 The system SHALL NOT leak database row types or `snake_case` column names beyond
    the `db/` layer.
2.8 The system SHALL create indexes on `symbol`, `trader`, `status`, and `trade_audit.trade_id`.

---

## Requirement 3: List trades (filter, sort, paginate)

**User story:** As a desk user, I want to list, filter, and page through trades, so
that I can find the trades I care about quickly.

#### Acceptance criteria
3.1 The system SHALL expose `GET /api/v1/trades` returning `{ data, meta }`.
3.2 The endpoint SHALL accept optional `symbol`, `side`, `status`, `trader`, `page`,
    and `pageSize` query parameters.
3.3 The system SHALL apply all supplied filters conjunctively; every returned trade
    SHALL satisfy every supplied filter predicate.
3.4 The system SHALL default to page 1 and page size 50 when pagination is omitted.
3.5 The `meta` object SHALL report the full filtered `total`, the current `page`, and `pageSize`.

---

## Requirement 4: Create trade

**User story:** As a desk user, I want to create a trade with validation, so that only
well-formed trades enter the system.

#### Acceptance criteria
4.1 The system SHALL expose `POST /api/v1/trades` and return 201 with the created trade.
4.2 The system SHALL reject a missing required field with 400 `VALIDATION_ERROR`.
4.3 The system SHALL require `symbol` to be non-empty and match `^[A-Z]+$`.
4.4 The system SHALL require `quantity` to be a positive integer (> 0).
4.5 The system SHALL require `price` to be a positive number (> 0).
4.6 The system SHALL require `side` to be `BUY` or `SELL`, and `trader`, `book`, and
    `counterparty` to be non-empty.
4.7 The system SHALL generate `id`, `tradeDate`, and `status` (ACTIVE) server-side and
    ignore any client-supplied values for them.

---

## Requirement 5: Amend trade

**User story:** As a desk user, I want to update an existing active trade, so that I
can correct or adjust its details.

#### Acceptance criteria
5.1 The system SHALL expose `PATCH /api/v1/trades/:id` accepting any subset of mutable fields.
5.2 The system SHALL return 404 `TRADE_NOT_FOUND` when the trade does not exist.
5.3 The system SHALL return 409 `TRADE_CANCELLED` when amending a cancelled trade.
5.4 The system SHALL reject invalid field values with 400 `VALIDATION_ERROR`.
5.5 The system SHALL update only the supplied fields and leave absent fields unchanged.
5.6 A no-op amendment (no changed fields) SHALL succeed with 200 and the unchanged trade.

---

## Requirement 6: Cancel trade

**User story:** As a desk user, I want to cancel a trade via a simple status
transition, so that it is retained for history but marked inactive.

#### Acceptance criteria
6.1 The system SHALL expose `DELETE /api/v1/trades/:id` that transitions status to `CANCELLED`.
6.2 The system SHALL return 404 `TRADE_NOT_FOUND` when the trade does not exist.
6.3 The system SHALL return 409 `TRADE_ALREADY_CANCELLED` when the trade is already cancelled.
6.4 The system SHALL retain the row (soft cancel) and never physically delete it.

---

## Requirement 7: Audit trail

**User story:** As a compliance/ops user, I want a history of amendments per trade, so
that every change is traceable.

#### Acceptance criteria
7.1 The system SHALL record one audit entry per genuinely changed field on amend.
7.2 An audit entry SHALL capture `field`, `oldValue`, `newValue`, `changedAt`, and `changedBy`.
7.3 A field whose value does not change SHALL NOT produce an audit entry.
7.4 The system SHALL expose `GET /api/v1/trades/:id/audit` returning entries newest-first.
7.5 The endpoint SHALL return an empty array (not 404) when the trade exists with no history.
7.6 The endpoint SHALL return 404 `TRADE_NOT_FOUND` when the trade does not exist.
7.7 The trade update and its audit inserts SHALL be written atomically in one transaction.

---

## Requirement 8: Real-time updates

**User story:** As a connected user, I want changes made by others to appear live, so
that all clients share one consistent view without refreshing.

#### Acceptance criteria
8.1 The system SHALL accept WebSocket upgrades only on `/ws` and send `CONNECTION_ACK`
    (`payload.message === "Connected"`) to every new client.
8.2 The system SHALL broadcast `TRADE_CREATED` after a successful create, and the client
    SHALL add the trade to the store.
8.3 The system SHALL broadcast `TRADE_AMENDED` after a successful amend, and the client
    SHALL replace the trade in the store by id.
8.4 The system SHALL broadcast `TRADE_CANCELLED` after a successful cancel, and the client
    SHALL set that trade's status without removing it.
8.5 The client SHALL reconnect with bounded exponential backoff (1s start, cap 30s, factor 2).
8.6 The client SHALL reflect connection state in the store and show a "Disconnected" indicator
    using both colour and text.
8.7 A broadcast SHALL be attempted for every OPEN client, and a per-client send failure SHALL
    NOT prevent delivery to the others.
8.8 An unrecognised WebSocket message type SHALL NOT mutate the store.
8.9 The client SHALL resolve the API base URL from a single config module, defaulting to a
    same-origin relative `/api/v1`.
8.10 The client SHALL resolve the WebSocket URL from the same config module, defaulting to a
    host-derived `ws(s)://<host>/ws`.

---

## Requirement 9: Trade blotter grid

**User story:** As a desk user, I want a fast, sortable, filterable grid, so that I can
work with a large trade set comfortably.

#### Acceptance criteria
9.1 The system SHALL display trades in a grid sourced from the live store.
9.2 The grid SHALL support sorting on columns with a visible sort-direction indicator.
9.3 The grid SHALL support a debounced global text filter and per-column filters for
    symbol, side, status, and trader, preserving filter/sort state across live updates.
9.4 The grid SHALL paginate (50 rows/page default) and show a "Showing X-Y of Z" summary
    with keyboard-accessible Previous/Next controls.
9.5 A CANCELLED trade row SHALL render with both reduced opacity and strikethrough.
9.6 A row touched by a live update SHALL briefly flash, and SHALL NOT flash on initial load.
9.7 The grid SHALL show a loading state while the initial fetch is in flight.
9.8 The grid SHALL show a retryable error banner when the initial fetch fails.
9.9 During a retry the grid SHALL show both the loading state and the error banner.

---

## Requirement 10: Create-trade form

**User story:** As a desk user, I want a validated create form, so that I cannot submit
a malformed trade.

#### Acceptance criteria
10.1 The system SHALL provide a create-trade modal that calls the create API.
10.2 The form SHALL validate all fields client-side with rules mirroring the backend.
10.3 The form SHALL show inline field-level errors and not show errors on untouched fields.
10.4 On success the form SHALL show a success toast and close; on error it SHALL stay open,
     preserve input, and show an error toast.
10.5 Whitespace-only values in required text fields SHALL be treated as empty (invalid).
10.6 The submit control SHALL be disabled while a submission is in flight (no double submit).

---

## Requirement 11: Amend-trade form

**User story:** As a desk user, I want to amend a trade from a pre-populated form, so
that I can adjust an existing trade safely.

#### Acceptance criteria
11.1 The system SHALL provide an amend modal that calls the amend API.
11.2 The amend form SHALL pre-populate every field with the trade's current values.
11.3 A 409 conflict SHALL be shown as an inline message near the submit area, not a generic toast.
11.4 The amend form SHALL apply the same field validation as the create form (status optional).

---

## Requirement 12: Cancel-trade action

**User story:** As a desk user, I want to cancel a trade with clear feedback, so that I
know the outcome.

#### Acceptance criteria
12.1 The system SHALL provide a cancel action that calls the cancel API.
12.2 On a 409 already-cancelled response the UI SHALL show only the "already cancelled"
     message, not a generic error toast.
12.3 On other errors the UI SHALL show an error toast.

---

## Requirement 13: Audit history panel

**User story:** As a compliance/ops user, I want to view a trade's amendment history in
context, so that I can inspect changes without leaving the blotter.

#### Acceptance criteria
13.1 The panel SHALL open without blocking blotter interaction.
13.2 The panel SHALL fetch audit history lazily (only when open).
13.3 The panel SHALL show a loading skeleton immediately on open.
13.4 The panel SHALL format `changedAt` as human-readable local time (never raw ISO).
13.5 The panel SHALL show an explicit empty-state message when there is no history.
13.6 The panel SHALL show a retryable error state when the fetch fails.

---

## Requirement 14: Error handling

**User story:** As a user and developer, I want consistent, safe error handling, so that
failures are understandable and never leak internals.

#### Acceptance criteria
14.1 The backend SHALL define a typed `AppError` (code, message, statusCode, cause) and a
     global handler that maps it to `{ error: { code, message, statusCode } }`.
14.2 The frontend SHALL define a typed `ApiError` (code, message, statusCode, with statusCode 0
     for network failures) and never let a raw fetch rejection escape the API client.
14.3 The frontend SHALL wrap the app in an error boundary with a reload fallback.
14.4 A failed mutation SHALL NOT mutate the client store.
14.5 The backend SHALL log 4xx business errors at warn and unexpected 5xx errors at error,
     converting unexpected errors to a generic 500 `INTERNAL_ERROR`.

---

## Requirement 15: Packaging, configuration, and deployment

**User story:** As an evaluator, I want the app to run with one command and deploy in an
OS-agnostic way, so that I can preview it easily.

#### Acceptance criteria
15.1 The system SHALL provide a root `docker-compose.yml` starting frontend and backend with
     `docker compose up --build`.
15.2 The frontend SHALL be served by nginx that reverse-proxies `/api` and `/ws` to the backend.
15.3 The backend SHALL ship a multi-stage Dockerfile (build TypeScript, run compiled output on
     node:20-alpine).
15.4 The compose backend service SHALL mount a host volume so the SQLite file survives restarts.
15.5 The nginx config SHALL forward both `/api` and `/ws` with WebSocket upgrade headers.
15.6 The backend SHALL read `DB_PATH`, `PORT`, and `CORS_ORIGIN` from the environment with no
     hardcoded values, and enable SQLite WAL mode.
15.7 The frontend SHALL treat `VITE_API_BASE_URL`/`VITE_WS_URL` as optional dev-only overrides and
     default to same-origin resolution otherwise.
15.8 The frontend URL resolution SHALL be OS-agnostic (forward slashes, no absolute host paths baked in).
15.9 The system SHALL provide a hosted container deployment blueprint (`render.yaml`).
15.10 The hosted backend SHALL bind `0.0.0.0` on the platform-provided `PORT`.
15.11 The hosted deployment SHALL support a persistent disk at `DB_PATH` so SQLite survives restarts,
      and SHALL document the ephemeral-fallback re-seed behaviour when no disk is attached.
15.12 The same frontend build SHALL work for both local Docker and hosted deployment without a rebuild.
