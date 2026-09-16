/**
 * Pure mark-to-market position math for the analytics view.
 *
 * Combines net-position aggregates (from the server) with the latest simulated
 * market prices (from the live PRICE_TICK stream) to produce a per-symbol row
 * carrying the market price and an unrealised mark-to-market value. Kept pure
 * and framework-free so it is trivially unit-testable.
 */

import type { PositionSummary } from '../types/trade.types';

/** A position enriched with mark-to-market against the latest market price. */
export interface Position {
  readonly symbol: string;
  readonly netQuantity: number;
  readonly buyQuantity: number;
  readonly sellQuantity: number;
  readonly tradeCount: number;
  /** Latest simulated market price for the symbol, or null if none seen. */
  readonly marketPrice: number | null;
  /** netQuantity * marketPrice, or null when the price is unknown. */
  readonly marketValue: number | null;
}

/**
 * Enriches server position summaries with market prices, producing the rows
 * rendered by the Positions / P&L view. Symbols are returned in the input
 * order (the server sorts by symbol ascending).
 */
export function computePositions(
  summaries: ReadonlyArray<PositionSummary>,
  marketPrices: Readonly<Record<string, number>>,
): Position[] {
  return summaries.map((summary) => {
    const marketPrice = marketPrices[summary.symbol] ?? null;
    const marketValue =
      marketPrice === null ? null : summary.netQuantity * marketPrice;
    return {
      symbol: summary.symbol,
      netQuantity: summary.netQuantity,
      buyQuantity: summary.buyQuantity,
      sellQuantity: summary.sellQuantity,
      tradeCount: summary.tradeCount,
      marketPrice,
      marketValue,
    };
  });
}
