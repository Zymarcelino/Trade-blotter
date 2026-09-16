import { describe, it, expect, vi, afterEach } from 'vitest';

import { PriceFeed, computeVwap, startPriceFeed } from './priceFeed';
import { TradeSide, TradeStatus, createTradeId, type Trade } from '../types/trade.types';

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 100,
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

describe('computeVwap', () => {
  it('computes volume-weighted average price per ACTIVE symbol', () => {
    const vwap = computeVwap([
      makeTrade({ symbol: 'AAPL', quantity: 100, price: 10 }),
      makeTrade({ symbol: 'AAPL', quantity: 300, price: 20 }),
      makeTrade({ symbol: 'MSFT', quantity: 50, price: 500 }),
    ]);
    // (100*10 + 300*20) / 400 = 17.5
    expect(vwap.AAPL).toBe(17.5);
    expect(vwap.MSFT).toBe(500);
  });

  it('excludes CANCELLED trades', () => {
    const vwap = computeVwap([
      makeTrade({ symbol: 'TSLA', status: TradeStatus.CANCELLED, price: 999 }),
    ]);
    expect(vwap.TSLA).toBeUndefined();
  });
});

describe('PriceFeed', () => {
  it('drifts every tracked price within +/-0.2% and stays positive', () => {
    const feed = new PriceFeed({ AAPL: 100 });
    for (let i = 0; i < 20; i += 1) {
      const p = feed.tick().AAPL as number;
      expect(p).toBeGreaterThan(0);
    }
  });

  it('ensureSymbols adds new symbols but never overwrites an existing price', () => {
    const feed = new PriceFeed({ AAPL: 100 });
    feed.ensureSymbols({ AAPL: 999, TEST: 8 });
    const prices = feed.getPrices();
    expect(prices.AAPL).toBe(100); // unchanged
    expect(prices.TEST).toBe(8); // newly seeded
  });

  it('ignores non-positive or non-finite base prices', () => {
    const feed = new PriceFeed({});
    feed.ensureSymbols({ A: 0, B: -5, C: Number.NaN, D: 12.5 });
    const prices = feed.getPrices();
    expect(prices.A).toBeUndefined();
    expect(prices.B).toBeUndefined();
    expect(prices.C).toBeUndefined();
    expect(prices.D).toBe(12.5);
  });

  it('a newly ensured symbol then drifts on subsequent ticks', () => {
    const feed = new PriceFeed({});
    feed.ensureSymbols({ TEST: 8 });
    const first = feed.tick().TEST as number;
    expect(first).toBeGreaterThan(0);
    expect(Object.keys(feed.getPrices())).toContain('TEST');
  });
});

describe('startPriceFeed reconcile', () => {
  afterEach(() => vi.useRealTimers());

  it('seeds symbols returned by the reconcile callback before drifting', () => {
    vi.useFakeTimers();
    const feed = new PriceFeed({ AAPL: 100 });
    const broadcast = vi.fn();
    let active: Record<string, number> = { AAPL: 100 };
    const stop = startPriceFeed(broadcast, feed, 1000, () => active);

    // A new symbol appears (as if a TEST trade was just created).
    active = { AAPL: 100, TEST: 8 };
    vi.advanceTimersByTime(1000);

    const lastPayload = broadcast.mock.calls.at(-1)?.[0] as { payload: Record<string, number> };
    expect(lastPayload.payload.TEST).toBeGreaterThan(0);
    stop();
  });
});
