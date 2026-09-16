-- Trade Blotter schema (SQLite / better-sqlite3)
--
-- This is the canonical DDL for the application database. It mirrors the
-- idempotent migrations executed on startup by backend/src/db/migrations.ts.
-- Every statement uses IF NOT EXISTS so it is safe to run repeatedly.
--
-- The application creates this schema automatically on startup; this file is
-- provided as a standalone, human-readable reference artifact.

-- Trades: one row per trade. Cancel is a soft status transition (never a
-- physical delete). CHECK constraints enforce the domain invariants.
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

-- Audit trail: one row per genuinely changed field on amend. changed_by is
-- 'SYSTEM' because there is no authentication in this build.
CREATE TABLE IF NOT EXISTS trade_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id     TEXT NOT NULL REFERENCES trades(id),
  field        TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  changed_at   TEXT NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'SYSTEM'
);

-- Indexes backing the conjunctive GET /trades filters and audit lookups.
CREATE INDEX IF NOT EXISTS idx_trades_symbol   ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_trader   ON trades(trader);
CREATE INDEX IF NOT EXISTS idx_trades_status   ON trades(status);
CREATE INDEX IF NOT EXISTS idx_audit_trade_id  ON trade_audit(trade_id);