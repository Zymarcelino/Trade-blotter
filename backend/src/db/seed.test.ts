import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fc from 'fast-check';

import { runMigrations } from './migrations';
import {
  seedIfEmpty,
  generateSeedRow,
  SEED_SYMBOLS,
  SEED_TRADERS,
  SEED_BOOKS,
  SEED_COUNTERPARTIES,
} from './seed';

describe('seedIfEmpty', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });
  afterEach(() => db.close());

  function count(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM trades').get() as { c: number }).c;
  }

  it('inserts exactly 500 rows into an empty table', () => {
    seedIfEmpty(db);
    expect(count()).toBe(500);
  });

  it('is a no-op when the table already has rows', () => {
    seedIfEmpty(db);
    seedIfEmpty(db);
    expect(count()).toBe(500);
  });

  // Feature: trade-blotter, Property 3: Seed data field constraints
  it('generateSeedRow always satisfies the field constraints', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100001, max: 100500 }), (seq) => {
        const r = generateSeedRow(seq);
        expect(r.id).toMatch(/^TRD-\d{6}$/);
        expect(SEED_SYMBOLS as readonly string[]).toContain(r.symbol);
        expect(SEED_TRADERS as readonly string[]).toContain(r.trader);
        expect(SEED_BOOKS as readonly string[]).toContain(r.book);
        expect(SEED_COUNTERPARTIES as readonly string[]).toContain(r.counterparty);
        expect(r.quantity).toBeGreaterThanOrEqual(100);
        expect(r.quantity).toBeLessThanOrEqual(10000);
        expect(r.price).toBeGreaterThanOrEqual(10);
        expect(r.price).toBeLessThanOrEqual(1000);
        expect(['BUY', 'SELL']).toContain(r.side);
        expect(['ACTIVE', 'CANCELLED']).toContain(r.status);
        expect(Number.isNaN(Date.parse(r.trade_date))).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
