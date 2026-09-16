/**
 * useAuditHistory — fetches a single trade's amendment history.
 *
 * Gated on `isOpen` so the query only runs while the audit panel is open. The
 * returned `data` is the entry array (newest first) or undefined while
 * loading/errored. Errors are surfaced as ApiError so the panel can map the
 * code to a human message.
 */

import { useQuery } from '@tanstack/react-query';

import { getAuditHistory } from '../services/trade.api';
import { ApiError } from '../services/errors';
import type { AuditEntry, TradeId } from '../types/trade.types';

/** The shape returned by {@link useAuditHistory}. */
export interface UseAuditHistoryResult {
  readonly data: AuditEntry[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function useAuditHistory(
  tradeId: TradeId,
  isOpen: boolean,
): UseAuditHistoryResult {
  const query = useQuery({
    queryKey: ['audit', tradeId],
    queryFn: () => getAuditHistory(tradeId),
    enabled: isOpen,
  });

  return {
    data: query.data?.data,
    isLoading: query.isLoading && isOpen,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
