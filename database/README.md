# Database

The brief lists `database/` as a top-level deliverable. This project uses **SQLite**
(via `better-sqlite3`), which is a single embedded file rather than a separate
database service - so the database layer lives inside the backend rather than as its
own deployable. This directory is a pointer to where it actually is.

## Where the database code lives

`backend/src/db/`:

| File | Responsibility |
|------|----------------|
| `connection.ts` | Opens the `better-sqlite3` connection and enables WAL mode. |
| `migrations.ts` | Creates the `trades` and `trade_audit` tables and the filter indexes (idempotent, run on startup). |
| `seed.ts` | Seeds 500 realistic trades when the `trades` table is empty. |
| `trade.repository.ts` | The only place SQL runs; maps snake_case rows to the camelCase domain model. |

Tests for the DB layer (against a real in-memory SQLite instance) are co-located:
`connection.test.ts`, `migrations.test.ts`, `seed.test.ts`, `trade.repository.test.ts`.

## Where the database file lives at runtime

- **Local (npm)**: `backend/data/trades.db` (created on first run).
- **Docker Compose**: persisted to the host via the `./backend/data:/app/data` volume
  (`DB_PATH=/app/data/trades.db`).
- **Hosted (Render)**: a persistent disk mounted at `DB_PATH`; without a disk the file
  is ephemeral and the app re-seeds 500 trades on each empty startup (a documented
  demo trade-off).

The database file is not committed (it is generated + seeded on startup); see
`.gitignore`.

## Schema

```sql
CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,
  symbol       TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  price        REAL NOT NULL CHECK (price > 0),
  side         TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  trader       TEXT NOT NULL,
  trade_date   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  book         TEXT NOT NULL,
  counterparty TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id     TEXT NOT NULL REFERENCES trades(id),
  field        TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  changed_at   TEXT NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'SYSTEM'
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol   ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_trader   ON trades(trader);
CREATE INDEX IF NOT EXISTS idx_trades_status   ON trades(status);
CREATE INDEX IF NOT EXISTS idx_audit_trade_id  ON trade_audit(trade_id);
```

See `ARCHITECTURE.md` for why SQLite was chosen and the scaling trade-offs (and the
migration path to Postgres behind the same `ITradeRepository` interface).
