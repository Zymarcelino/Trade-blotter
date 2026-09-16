/**
 * useAuditFeed — fetches the global audit event feed (newest first) for the
 * Audit Trail view. Enabled only while the view is active so it does not run
 * behind the other tabs.
 */

import { useQuery } from '@tanstack/react-query';

import { getAuditFeed } from '../services/trade.api';
import { ApiError } from '../services/errors';
import type { AuditEntry } from '../types/trade.types';

/** The shape returned by {@link useAuditFeed}. */
export interface UseAuditFeedResult {
  readonly data: AuditEntry[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function useAuditFeed(enabled = true): UseAuditFeedResult {
  const query = useQuery({
    queryKey: ['audit-feed'],
    queryFn: () => getAuditFeed(),
    enabled,
  });

  return {
    data: query.data?.data,
    isLoading: query.isLoading && enabled,
    isError: query.isError,
    error: query.error instanceof ApiError ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
