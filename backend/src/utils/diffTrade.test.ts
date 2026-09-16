import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { diffTrade, AUDITABLE_FIELDS } from './diffTrade';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type Trade,
  type AmendTradeRequest,
} from '../types/trade.types';

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 500,
    price: 100,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:00:00.000Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_UK',
    counterparty: 'Citi',
    ...over,
  };
}

describe('diffTrade', () => {
  it('returns an empty array when nothing changes', () => {
    const t = makeTrade();
    expect(diffTrade(t, {})).toEqual([]);
    expect(diffTrade(t, { symbol: 'AAPL', quantity: 500 })).toEqual([]);
  });

  it('returns one entry per changed field with SYSTEM actor', () => {
    const t = makeTrade();
    const entries = diffTrade(t, { quantity: 300, price: 120 });
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.tradeId).toBe(t.id);
      expect(e.changedBy).toBe('SYSTEM');
      expect(typeof e.changedAt).toBe('string');
    }
    const qty = entries.find((e) => e.field === 'quantity');
    expect(qty?.oldValue).toBe('500');
    expect(qty?.newValue).toBe('300');
  });

  it('ignores fields absent from the update', () => {
    const t = makeTrade();
    const entries = diffTrade(t, { price: 101 });
    expect(entries.map((e) => e.field)).toEqual(['price']);
  });

  it('only audits allowed fields', () => {
    for (const f of AUDITABLE_FIELDS) {
      expect([
        'symbol', 'quantity', 'price', 'side', 'trader', 'status', 'book', 'counterparty',
      ]).toContain(f);
    }
  });

  // Feature: trade-blotter, Property 11: Audit row count equals changed field count
  it('produces exactly N entries for N genuinely-changed fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.option(fc.constantFrom('AAPL', 'MSFT', 'TSLA'), { nil: undefined }),
          quantity: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: undefined }),
          price: fc.option(fc.integer({ min: 1, max: 999 }), { nil: undefined }),
          side: fc.option(fc.constantFrom(TradeSide.BUY, TradeSide.SELL), { nil: undefined }),
        }),
        (partial) => {
          const current = makeTrade();
          const update = partial as AmendTradeRequest;
          const expected = AUDITABLE_FIELDS.filter((f) => {
            const v = (update as Record<string, unknown>)[f];
            return v !== undefined && String(v) !== String((current as Record<string, unknown>)[f]);
          }).length;
          expect(diffTrade(current, update)).toHaveLength(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
