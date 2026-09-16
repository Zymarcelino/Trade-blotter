import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computePositions } from './computePositions';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type Trade,
} from '../types/trade.types';

/** Builds a Trade with sensible defaults for tests. */
function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: createTradeId(over.id ?? createTradeId('TRD-100001')),
    symbol: 'AAPL',
    quantity: 100,
    price: 10,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:00:00.000Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_UK',
    counterparty: 'Citi',
    ...over,
  } as Trade;
}

describe('computePositions', () => {
  it('nets BUY minus SELL per symbol and marks to the live price', () => {
    const trades = [
      makeTrade({ id: createTradeId('TRD-1'), symbol: 'AAPL', side: TradeSide.BUY, quantity: 500, price: 100 }),
      makeTrade({ id: createTradeId('TRD-2'), symbol: 'AAPL', side: TradeSide.SELL, quantity: 200, price: 110 }),
    ];
    const [pos] = computePositions(trades, { AAPL: 120 });
    expect(pos.symbol).toBe('AAPL');
    expect(pos.netQty).toBe(300);
    expect(pos.marketPrice).toBe(120);
    // avg entry on the net (long) side is the avg BUY = 100
    expect(pos.avgPrice).toBe(100);
    // unrealised = 300 * (120 - 100) = 6000
    expect(pos.unrealisedPnl).toBe(6000);
    // realised = min(500,200) * (avgSell - avgBuy) = 200 * (110 - 100) = 2000
    expect(pos.realisedPnl).toBe(2000);
    expect(pos.totalPnl).toBe(8000);
  });

  it('excludes CANCELLED trades entirely', () => {
    const trades = [
      makeTrade({ id: createTradeId('TRD-1'), side: TradeSide.BUY, quantity: 500, status: TradeStatus.CANCELLED }),
    ];
    expect(computePositions(trades, { AAPL: 100 })).toEqual([]);
  });

  it('omits symbols whose net quantity is zero', () => {
    const trades = [
      makeTrade({ id: createTradeId('TRD-1'), side: TradeSide.BUY, quantity: 100 }),
      makeTrade({ id: createTradeId('TRD-2'), side: TradeSide.SELL, quantity: 100 }),
    ];
    expect(computePositions(trades, { AAPL: 100 })).toEqual([]);
  });

  it('uses marketPrice 0 when the symbol has no price yet', () => {
    const trades = [makeTrade({ side: TradeSide.BUY, quantity: 100, price: 50 })];
    const [pos] = computePositions(trades, {});
    expect(pos.marketPrice).toBe(0);
  });

  it('orders rows by symbol ascending', () => {
    const trades = [
      makeTrade({ id: createTradeId('TRD-1'), symbol: 'TSLA', side: TradeSide.BUY, quantity: 10 }),
      makeTrade({ id: createTradeId('TRD-2'), symbol: 'AAPL', side: TradeSide.BUY, quantity: 10 }),
    ];
    const out = computePositions(trades, { TSLA: 1, AAPL: 1 });
    expect(out.map((p) => p.symbol)).toEqual(['AAPL', 'TSLA']);
  });

  it('property: net quantity always equals summed BUY minus SELL over ACTIVE trades', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            side: fc.constantFrom(TradeSide.BUY, TradeSide.SELL),
            quantity: fc.integer({ min: 1, max: 10000 }),
            price: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (rows) => {
          const trades = rows.map((r, i) =>
            makeTrade({
              id: createTradeId(`TRD-${100000 + i}`),
              symbol: 'AAPL',
              side: r.side,
              quantity: r.quantity,
              price: r.price,
            }),
          );
          const expectedNet = trades.reduce(
            (s, t) => s + (t.side === TradeSide.BUY ? t.quantity : -t.quantity),
            0,
          );
          const out = computePositions(trades, { AAPL: 100 });
          if (expectedNet === 0) {
            expect(out).toEqual([]);
          } else {
            expect(out[0].netQty).toBe(expectedNet);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
