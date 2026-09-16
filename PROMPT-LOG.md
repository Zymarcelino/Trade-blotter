# Prompt Log

A representative sample of the significant prompts that shaped the Trade Blotter,
in the brief's Prompt / Outcome format. Per the brief, this is a curated sample
rather than an exhaustive log.

---

**Prompt:** "Create a spec for a full-stack trade blotter: React + TypeScript
frontend, Node.js + Fastify backend, SQLite, native WebSockets, Docker."
**Outcome:** Produced a 15-requirement EARS spec, a layered design, and a 25-task
plan. Chose Fastify over Express/NestJS (first-class TS + built-in schema
validation), SQLite via better-sqlite3 (zero-config, synchronous), and native `ws`
over Socket.IO (the brief only needs JSON broadcast).

---

**Prompt:** "Generate the shared domain types: branded `TradeId` + factory,
`TradeSide`/`TradeStatus` const objects, `Trade` as Readonly, DTOs via `Omit`/
`Partial`, and a discriminated-union `WsMessage`."
**Outcome:** Accepted with minor tightening. Branded IDs prevent passing a raw
string where a `TradeId` is expected; the discriminated union gives each WS message
a statically known payload. Became the single source of truth, mirrored on the FE.

---

**Prompt:** "Implement `TradeService` red-green-refactor against a mocked
`ITradeRepository` and `BroadcastFn`."
**Outcome:** Service depends only on interfaces; concrete classes are wired only in
`server.ts` (composition root). Business rules (e.g. a cancelled trade cannot be
amended) live here.

---

**Prompt:** "Resolve the broadcast-failure inconsistency between create and
amend/cancel."
**Outcome:** Standardised on commit-then-broadcast with no rollback: the DB write is
the source of truth; a failed broadcast is logged and the successful 200/201 still
returns. Disconnected clients recover on reconnect.

---

**Prompt:** "Add a WebSocket server on the same HTTP server via the upgrade event,
only for /ws, sending CONNECTION_ACK; plus a singleton FE client with
exponential-backoff reconnect feeding the Zustand store."
**Outcome:** Accepted. The broadcast is the source of truth after a mutation; the FE
patches only the affected row rather than refetching.

---

**Prompt:** "Build the blotter grid with sorting, a debounced global filter,
per-column filters, client pagination, and dimmed + struck-through cancelled rows."
**Outcome:** Accepted after adapting to the installed TanStack Table v9 headless API
(the generated code assumed v8).

---

**Prompt:** "The create/amend form's empty numeric input passes the positive-number
rule."
**Outcome:** Root cause was Zod `coerce.number()` turning '' into 0. Replaced with a
preprocess that treats empty/whitespace as missing, so the required-field error
fires instead of silently accepting 0.

---

**Prompt:** "The backend container segfaults on startup."
**Outcome:** better-sqlite3's prebuilt binary was glibc/musl-mismatched on Alpine.
Fixed by rebuilding it from source in the Docker builder stage against the image's
Node + musl.

---

**Prompt:** "Cancel returns 400."
**Outcome:** The FE sent `Content-Type: application/json` on a body-less DELETE, so
Fastify's JSON parser rejected the empty body. Fixed the fetch wrapper to omit the
content-type on body-less requests.

---

**Prompt:** "Virtualise the grid and make the live stream scalable to ~10k rows."
**Outcome:** Added TanStack Virtual windowing, a rolling store cap, fixed-cadence
rate-capped rendering with user dials (rows/tick, interval, pause), scroll-position
preservation, and a freeze-while-scrolled snapshot to stop misclicks and viewport
jump under the stream.

---

**Prompt:** "The initial load shows the oldest trades, not the newest."
**Outcome:** `TradeRepository.findAll` had no ORDER BY, so SQLite returned
insertion order and page 1 was the oldest rows. Added `ORDER BY trade_date DESC, id
DESC` so page 1 is the latest trades.

---

**Prompt:** "Positions/P&L should recalculate as trades come in and as prices tick."
**Outcome:** Reworked a server-fetch version into a live client-side
`computePositions(trades, marketPrices)` (net qty, VWAP entry, mark-to-market
unrealised + realised P&L) so both new trades and price ticks update instantly.

---

**Prompt:** "The reference UI is denser; match the top bar and keep my extra
controls. Also filters must stay interactive while streaming."
**Outcome:** Rebuilt the top bar (connection dot, inline stats, live ticker, New
Trade) and a compact toolbar on CSS Modules (not Tailwind). Made the filter options
predefined/stable and memoised the toolbar with useCallback-stable handlers so the
search box and dropdowns keep focus during high-frequency stream re-renders.
