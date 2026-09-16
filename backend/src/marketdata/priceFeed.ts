/**
 * Market-price feed derived from trade data. Base prices are seeded from the
 * VWAP of ACTIVE trades per symbol (no external API); each tick applies a small
 * random-walk drift and broadcasts PRICE_TICK so clients mark-to-market live.
 */
import type { BroadcastFn } from '../websocket/broadcast';
import type { Trade } from '../types/trade.types';

export const DEFAULT_PRICE_INTERVAL_MS = 2000;

/** Computes VWAP per symbol from ACTIVE trades (honest, derived mark price). */
export function computeVwap(trades: readonly Readonly<Trade>[]): Record<string, number> {
  const acc = new Map<string, { notional: number; qty: number }>();
  for (const t of trades) {
    if (t.status === 'CANCELLED') continue;
    const prev = acc.get(t.symbol) ?? { notional: 0, qty: 0 };
    prev.notional += t.price * t.quantity;
    prev.qty += t.quantity;
    acc.set(t.symbol, prev);
  }
  const vwap: Record<string, number> = {};
  for (const [symbol, { notional, qty }] of acc) {
    if (qty > 0) {
      vwap[symbol] = Math.round((notional / qty) * 100) / 100;
    }
  }
  return vwap;
}

/** In-memory market-price source. Prices drift on each tick(). */
export class PriceFeed {
  private prices: Record<string, number>;

  constructor(seed: Record<string, number>) {
    this.prices = { ...seed };
  }

  getPrices(): Record<string, number> {
    return { ...this.prices };
  }

  tick(): Record<string, number> {
    for (const symbol of Object.keys(this.prices)) {
      const driftPct = (Math.random() - 0.5) * 0.4; // +/- 0.2%
      const next = (this.prices[symbol] as number) * (1 + driftPct / 100);
      this.prices[symbol] = Math.max(0.01, Math.round(next * 100) / 100);
    }
    return this.getPrices();
  }
}

/** Starts the feed: ticks and broadcasts PRICE_TICK. Returns a stop function. */
export function startPriceFeed(
  broadcast: BroadcastFn,
  feed: PriceFeed,
  intervalMs: number = DEFAULT_PRICE_INTERVAL_MS,
): () => void {
  const handle = setInterval(() => {
    const prices = feed.tick();
    try {
      broadcast({ type: 'PRICE_TICK', payload: prices });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('PRICE_TICK broadcast failed', error);
    }
  }, intervalMs);
  return () => clearInterval(handle);
}
