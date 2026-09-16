import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fc from 'fast-check';

import { runMigrations } from './migrations';
import { TradeRepository } from './trade.repository';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type AuditInsert,
  type NewTrade,
} from '@trade-blotter/shared';

function newTrade(over: Partial<NewTrade> = {}): NewTrade {
  return {
    symbol: 'AAPL',
    quantity: 500,
    price: 100,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    book: 'EQUITIES_UK',
    counterparty: 'Citi',
    ...over,
  };
}

describe('TradeRepository', () => {
  let db: Database.Database;
  let repo: TradeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new TradeRepository(db);
  });
  afterEach(() => db.close());

  it('create() persists with a generated id, ISO tradeDate and ACTIVE status', () => {
    const t = repo.create(newTrade());
    expect(t.id).toMatch(/^TRD-\d{6}$/);
    expect(t.status).toBe(TradeStatus.ACTIVE);
    expect(Number.isNaN(Date.parse(t.tradeDate))).toBe(false);
    expect(t.symbol).toBe('AAPL');
  });

  it('findById returns the trade or null', () => {
    const t = repo.create(newTrade());
    expect(repo.findById(t.id)?.id).toBe(t.id);
    expect(repo.findById(createTradeId('TRD-999999'))).toBeNull();
  });

  it('findAll applies filters and returns newest-first', () => {
    repo.create(newTrade({ symbol: 'AAPL', side: TradeSide.BUY }));
    repo.create(newTrade({ symbol: 'MSFT', side: TradeSide.SELL }));
    const all = repo.findAll();
    expect(all.length).toBe(2);
    // newest-first: the later-created id sorts first (tie broken by id desc)
    expect(all[0].id > all[1].id).toBe(true);
    expect(repo.findAll({ symbol: 'AAPL' }).every((t) => t.symbol === 'AAPL')).toBe(true);
    expect(repo.findAll({ side: TradeSide.SELL }).every((t) => t.side === 'SELL')).toBe(true);
  });

  it('update changes only supplied fields and writes one audit row per change', () => {
    const t = repo.create(newTrade({ quantity: 500, price: 100 }));
    const audits: AuditInsert[] = [
      { tradeId: t.id, field: 'quantity', oldValue: '500', newValue: '300', changedAt: new Date().toISOString(), changedBy: 'SYSTEM' },
    ];
    const updated = repo.update(t.id, { quantity: 300 }, audits);
    expect(updated.quantity).toBe(300);
    expect(updated.price).toBe(100);
    expect(repo.findAuditHistory(t.id)).toHaveLength(1);
  });

  it('cancel sets status to CANCELLED, retains the row, and writes an audit row', () => {
    const t = repo.create(newTrade());
    const cancelled = repo.cancel(t.id);
    expect(cancelled.status).toBe(TradeStatus.CANCELLED);
    expect(repo.findById(t.id)?.status).toBe(TradeStatus.CANCELLED);
    const audit = repo.findAuditHistory(t.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].field).toBe('status');
    expect(audit[0].newValue).toBe('CANCELLED');
  });

  it('findAuditHistory returns empty for a trade with no changes and is newest-first', () => {
    const t = repo.create(newTrade());
    expect(repo.findAuditHistory(t.id)).toEqual([]);
    repo.update(t.id, { quantity: 1 }, [
      { tradeId: t.id, field: 'quantity', oldValue: '500', newValue: '1', changedAt: new Date(Date.now() - 1000).toISOString(), changedBy: 'SYSTEM' },
    ]);
    repo.update(t.id, { price: 2 }, [
      { tradeId: t.id, field: 'price', oldValue: '100', newValue: '2', changedAt: new Date().toISOString(), changedBy: 'SYSTEM' },
    ]);
    const hist = repo.findAuditHistory(t.id);
    expect(hist).toHaveLength(2);
    expect(hist[0].changedAt >= hist[1].changedAt).toBe(true);
  });

  it('getActiveTrades excludes cancelled trades', () => {
    const a = repo.create(newTrade());
    repo.create(newTrade({ symbol: 'MSFT' }));
    repo.cancel(a.id);
    const active = repo.getActiveTrades();
    expect(active.every((t) => t.status === TradeStatus.ACTIVE)).toBe(true);
    expect(active.some((t) => t.id === a.id)).toBe(false);
  });

  // Feature: trade-blotter, Property 1: Database row mapping round-trip
  it('round-trips every field through create/findById (camelCase mapping)', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('AAPL', 'MSFT', 'TSLA', 'NVDA'),
          quantity: fc.integer({ min: 1, max: 10000 }),
          price: fc.integer({ min: 1, max: 1000 }),
          side: fc.constantFrom(TradeSide.BUY, TradeSide.SELL),
          trader: fc.constantFrom('JSMITH', 'ABROWN'),
          book: fc.constantFrom('EQUITIES_UK', 'EQUITIES_US'),
          counterparty: fc.constantFrom('Citi', 'UBS'),
        }),
        (nt) => {
          const created = repo.create(nt);
          const fetched = repo.findById(created.id);
          expect(fetched).not.toBeNull();
          expect(fetched?.symbol).toBe(nt.symbol);
          expect(fetched?.quantity).toBe(nt.quantity);
          expect(fetched?.price).toBe(nt.price);
          expect(fetched?.side).toBe(nt.side);
          expect(fetched?.trader).toBe(nt.trader);
          expect(fetched?.book).toBe(nt.book);
          expect(fetched?.counterparty).toBe(nt.counterparty);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: trade-blotter, Property 14: Amendment and audit atomicity
  it('rolls back the trade update AND audit rows together on a mid-write failure', () => {
    const t = repo.create(newTrade({ quantity: 500 }));
    const before = repo.findById(t.id);
    const beforeAudit = repo.findAuditHistory(t.id).length;
    // An audit row missing a required column (changed_at NULL) fails the second
    // statement in the transaction; the whole transaction must roll back.
    const badAudit = [
      { tradeId: t.id, field: 'quantity', oldValue: '500', newValue: '999', changedAt: null as unknown as string, changedBy: 'SYSTEM' },
    ];
    expect(() => repo.update(t.id, { quantity: 999 }, badAudit)).toThrow();
    expect(repo.findById(t.id)?.quantity).toBe(before?.quantity);
    expect(repo.findAuditHistory(t.id).length).toBe(beforeAudit);
  });
});
