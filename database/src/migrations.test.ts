import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from './migrations';

describe('runMigrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });
  afterEach(() => db.close());

  function tableNames(): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);
  }
  function indexNames(): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[])
      .map((r) => r.name);
  }

  it('creates the trades and trade_audit tables', () => {
    runMigrations(db);
    const tables = tableNames();
    expect(tables).toContain('trades');
    expect(tables).toContain('trade_audit');
  });

  it('creates the four filter/lookup indexes', () => {
    runMigrations(db);
    const idx = indexNames();
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_trades_symbol',
        'idx_trades_trader',
        'idx_trades_status',
        'idx_audit_trade_id',
      ]),
    );
  });

  it('is idempotent (safe to run twice)', () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('enforces the positive-quantity CHECK constraint', () => {
    runMigrations(db);
    const insert = db.prepare(
      `INSERT INTO trades (id, symbol, quantity, price, side, trader, trade_date, status, book, counterparty)
       VALUES (@id,@symbol,@quantity,@price,@side,@trader,@trade_date,@status,@book,@counterparty)`,
    );
    expect(() =>
      insert.run({
        id: 'TRD-1', symbol: 'AAPL', quantity: 0, price: 10, side: 'BUY',
        trader: 'X', trade_date: '2026-01-01T00:00:00.000Z', status: 'ACTIVE',
        book: 'B', counterparty: 'C',
      }),
    ).toThrow();
  });
});
