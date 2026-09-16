/**
 * Pure mark-to-market position / P&L math for the analytics view.
 *
 * Given the LIVE trade set (from the Zustand store) and the latest simulated
 * market prices (from the PRICE_TICK stream), it aggregates one row per symbol
 * with a non-zero net quantity. Because it derives everything from the live
 * `trades` array, the Positions / P&L view recomputes on every new trade AND on
 * every price tick - no server refetch needed.
 *
 *  - netQty        = ACTIVE BUY qty - ACTIVE SELL qty
 *  - avgPrice      = volume-weighted average entry on the net side
 *  - unrealisedPnl = netQty * (marketPrice - avgPrice)
 *  - realisedPnl   = min(buyQty, sellQty) * (avgSell - avgBuy)
 *  - totalPnl      = unrealisedPnl + realisedPnl
 *
 * CANCELLED trades never contribute. Prices are simulated (VWAP-seeded with a
 * small random drift), surfaced in the UI as such. Kept pure + framework-free
 * so it is trivially unit-testable and side-effect free.
 */

import { TradeStatus, type Trade } from '../types/trade.types';

/** A mark-to-market position summary for a single symbol. */
export interface Position {
  readonly symbol: string;
  readonly netQty: number;
  readonly avgPrice: number;
  readonly marketPrice: number;
  readonly unrealisedPnl: number;
  readonly realisedPnl: number;
  readonly totalPnl: number;
}

interface Accumulator {
  netQty: number;
  buyQty: number;
  sellQty: number;
  buyCost: number;
  sellCost: number;
}

/** `+ 0` normalises a signed negative zero (-0) to +0 for stable display. */
function round2(n: number): number {
  return Math.round(n * 100) / 100 + 0;
}

/**
 * Computes mark-to-market positions from the live trade set and latest prices.
 * Symbols whose net quantity is zero are omitted. Ordered by symbol ascending
 * for a stable display.
 */
export function computePositions(
  trades: ReadonlyArray<Readonly<Trade>>,
  marketPrices: Readonly<Record<string, number>>,
): Position[] {
  const bySymbol = new Map<string, Accumulator>();

  for (const trade of trades) {
    if (trade.status === TradeStatus.CANCELLED) {
      continue;
    }
    const acc =
      bySymbol.get(trade.symbol) ??
      { netQty: 0, buyQty: 0, sellQty: 0, buyCost: 0, sellCost: 0 };

    if (trade.side === 'BUY') {
      acc.netQty += trade.quantity;
      acc.buyQty += trade.quantity;
      acc.buyCost += trade.quantity * trade.price;
    } else {
      acc.netQty -= trade.quantity;
      acc.sellQty += trade.quantity;
      acc.sellCost += trade.quantity * trade.price;
    }
    bySymbol.set(trade.symbol, acc);
  }

  return [...bySymbol.entries()]
    .filter(([, acc]) => acc.netQty !== 0)
    .map(([symbol, acc]) => {
      const avgBuy = acc.buyQty ? acc.buyCost / acc.buyQty : 0;
      const avgSell = acc.sellQty ? acc.sellCost / acc.sellQty : 0;
      const avgPrice = acc.netQty > 0 ? avgBuy : avgSell;
      const marketPrice = marketPrices[symbol] ?? 0;
      const unrealisedPnl = acc.netQty * (marketPrice - avgPrice);
      const realisedPnl = Math.min(acc.buyQty, acc.sellQty) * (avgSell - avgBuy);
      return {
        symbol,
        netQty: acc.netQty,
        avgPrice: round2(avgPrice),
        marketPrice: round2(marketPrice),
        unrealisedPnl: round2(unrealisedPnl),
        realisedPnl: round2(realisedPnl),
        totalPnl: round2(unrealisedPnl + realisedPnl),
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
