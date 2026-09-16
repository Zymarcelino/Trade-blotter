/**
 * usePositions — fetches net-position aggregates and enriches them with the
 * latest simulated market prices from the store to produce mark-to-market rows
 * for the Positions / P&L view.
 */

import { useQuery } from '@tanstack/react-query';

import { getPositions } from '../services/trade.api';
import { ApiError } from '../services/errors';
import { useTradeStore } from '../store/trade.store';
import { computePositions, type Position } from '../utils/computePositions';

/** The shape returned by {@link usePositions}. */
export interface UsePositionsResult {
  readonly positions: Position[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function usePositions(enabled = true): UsePositionsResult {
  const marketPrices = useTradeStore((s) => s.marketPrices);

  const query = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions(),
    enabled,
  });

  const summaries = query.data?.data ?? [];

  return {
    positions: computePositions(summaries, marketPrices),
    isLoading: query.isLoading && enabled,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
