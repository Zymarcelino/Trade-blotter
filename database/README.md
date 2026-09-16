# Database (`@trade-blotter/database`)

The brief lists `database/` as a top-level deliverable, and it is: a standalone
TypeScript package that owns the entire SQLite persistence layer. It depends only
on `@trade-blotter/shared` (domain types + the repository interface) and is consumed
by the backend through TypeScript project references. This is the ONLY place SQL runs
or where `snake_case` row shapes exist.

The database engine is **SQLite** (via `better-sqlite3`) - a single embedded file, not
a separate service - so there is no DB server to deploy; the schema is created and
seeded automatically on backend startup.

## Package contents

| Path | Responsibility |
|------|----------------|
| `src/connection.ts` | Opens the `better-sqlite3` connection and enables WAL mode. |
| `src/migrations.ts` | Creates the `trades` and `trade_audit` tables and filter indexes (idempotent, run on startup). |
| `src/seed.ts` | Seeds 500 realistic trades when the `trades` table is empty (no-op otherwise). |
| `src/trade.repository.ts` | `ITradeRepository` implementation. Maps `snake_case` rows to the camelCase domain model; multi-table writes run in one transaction. |
| `src/index.ts` | Public surface: `createConnection`, `runMigrations`, `seedIfEmpty`, `TradeRepository`, seed constants. |
| `schema.sql` | Canonical DDL (tables, CHECK constraints, indexes). Mirrors `migrations.ts`. |
| `seed.sql` | Documents the 500-row seed plus a small illustrative `INSERT`. |

Tests (against a real in-memory SQLite instance, incl. fast-check property tests) are
co-located: `src/connection.test.ts`, `src/migrations.test.ts`, `src/seed.test.ts`,
`src/trade.repository.test.ts`.

## How it is consumed

The backend imports the package, never the files directly:

```ts
import { createConnection, runMigrations, seedIfEmpty, TradeRepository } from '@trade-blotter/database';
```

Concrete classes are wired to their interfaces only in the backend composition root
(`backend/src/server.ts`), preserving the `routes -> service -> repository -> db`
layering.

## Build and test

```bash
cd database
npm install
npm run build   # tsc -b (builds @trade-blotter/shared first via project references)
npm test        # vitest run
```

## Create a database by hand (optional)

```
sqlite3 trades.db < schema.sql
sqlite3 trades.db < seed.sql   # optional illustrative rows
```

You do not need to do this to run the app - the backend creates and seeds the DB on
startup.

## Where the database file lives at runtime

- **Local (npm)**: `backend/data/trades.db` (created on first run).
- **Docker Compose**: persisted to the host via the `./backend/data:/repo/backend/data`
  volume (`DB_PATH=/repo/backend/data/trades.db`).
- **Hosted (Render)**: a persistent disk mounted at `DB_PATH` (`/data/trades.db`);
  without a disk the file is ephemeral and the app re-seeds 500 trades on each empty
  startup (a documented demo trade-off).

The database file itself is not committed (it is generated + seeded on startup).

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

The full DDL is also kept as a runnable file in `schema.sql` alongside this README.