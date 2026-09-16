/**
 * useTrades — loads the initial trade page and pushes it into the Zustand store.
 *
 * TanStack Query owns the fetch lifecycle (loading/error/refetch); on success
 * the rows are written to the store, which is the source of truth the grid
 * renders from. Live WebSocket updates patch the store afterwards, so this
 * query is not refetched on every change.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getTrades } from '../services/trade.api';
import { useTradeStore } from '../store/trade.store';
import { ApiError } from '../services/errors';

/** A large client-side page so the whole seeded set is loaded once. */
export const CLIENT_FETCH_PAGE_SIZE = 10000;

/** The shape returned by {@link useTrades}. */
export interface UseTradesResult {
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function useTrades(): UseTradesResult {
  const setTrades = useTradeStore((s) => s.setTrades);

  const query = useQuery({
    queryKey: ['trades'],
    queryFn: () =>
      getTrades(undefined, { page: 1, pageSize: CLIENT_FETCH_PAGE_SIZE }),
  });

  useEffect(() => {
    if (query.data) {
      setTrades(query.data.data);
    }
  }, [query.data, setTrades]);

  return {
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
