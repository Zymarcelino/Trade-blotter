/**
 * Schema migrations. Creates the `trades` and `trade_audit` tables plus filter
 * indexes. Every statement is idempotent (IF NOT EXISTS), so running it on
 * every startup is safe (Requirement 2.1). Runs synchronously before routes.
 */
import type Database from 'better-sqlite3';

const CREATE_TRADES_TABLE = `
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
  )
`;

const CREATE_TRADE_AUDIT_TABLE = `
  CREATE TABLE IF NOT EXISTS trade_audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id     TEXT NOT NULL REFERENCES trades(id),
    field        TEXT NOT NULL,
    old_value    TEXT,
    new_value    TEXT,
    changed_at   TEXT NOT NULL,
    changed_by   TEXT NOT NULL DEFAULT 'SYSTEM'
  )
`;

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader)',
  'CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)',
  'CREATE INDEX IF NOT EXISTS idx_audit_trade_id ON trade_audit(trade_id)',
];

/** Creates the trade blotter schema if it does not already exist. */
export function runMigrations(db: Database.Database): void {
  db.exec(CREATE_TRADES_TABLE);
  db.exec(CREATE_TRADE_AUDIT_TABLE);
  for (const indexStatement of CREATE_INDEXES) {
    db.exec(indexStatement);
  }
}
