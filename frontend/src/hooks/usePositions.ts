/**
 * usePositions - derives mark-to-market positions from the LIVE store state.
 *
 * Reads the live trade list and the latest simulated market prices from the
 * Zustand store and runs the pure {@link computePositions}. Because both inputs
 * are store selectors, the Positions / P&L view recomputes automatically as new
 * trades stream in (TRADE_CREATED/AMENDED/CANCELLED) and as prices tick
 * (PRICE_TICK) - no server refetch involved.
 */

import { useMemo } from 'react';

import { useTradeStore } from '../store/trade.store';
import { computePositions, type Position } from '../utils/computePositions';

/** The shape returned by {@link usePositions}. */
export interface UsePositionsResult {
  readonly positions: Position[];
}

export function usePositions(): UsePositionsResult {
  const trades = useTradeStore((s) => s.trades);
  const marketPrices = useTradeStore((s) => s.marketPrices);

  const positions = useMemo(
    () => computePositions(trades, marketPrices),
    [trades, marketPrices],
  );

  return { positions };
}
