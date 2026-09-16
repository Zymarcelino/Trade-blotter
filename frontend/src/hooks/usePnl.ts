/**
 * usePnl — fetches notional-based P&L aggregates by symbol for the analytics
 * view. Enabled only while the Positions / P&L view is active.
 */

import { useQuery } from '@tanstack/react-query';

import { getPnl } from '../services/trade.api';
import { ApiError } from '../services/errors';
import type { PnlSummary } from '../types/trade.types';

/** The shape returned by {@link usePnl}. */
export interface UsePnlResult {
  readonly pnl: PnlSummary[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function usePnl(enabled = true): UsePnlResult {
  const query = useQuery({
    queryKey: ['pnl'],
    queryFn: () => getPnl(),
    enabled,
  });

  return {
    pnl: query.data?.data ?? [],
    isLoading: query.isLoading && enabled,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
