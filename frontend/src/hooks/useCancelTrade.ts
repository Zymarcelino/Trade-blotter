/**
 * useCancelTrade — wraps the cancel mutation with toast feedback.
 *
 * On success: shows a success toast and calls `onSuccess`. On a 409 (already
 * cancelled): shows only the "already cancelled" message, not a generic toast.
 * On any other error: shows an error toast. No optimistic store update — the
 * TRADE_CANCELLED broadcast patches the store after the server confirms.
 */

import { useMutation } from '@tanstack/react-query';

import { cancelTrade } from '../services/trade.api';
import { ApiError } from '../services/errors';
import { resolveErrorMessage } from '../utils/errorMessages';
import { useToastStore } from '../store/toast.store';
import type { TradeId } from '../types/trade.types';

/** Options for {@link useCancelTrade}. */
export interface UseCancelTradeOptions {
  /** Called after a successful cancel (e.g. to close the confirm dialog). */
  readonly onSuccess?: () => void;
}

/** The shape returned by {@link useCancelTrade}. */
export interface UseCancelTradeResult {
  /** Fires the cancel mutation for a trade id. */
  readonly submit: (id: TradeId) => void;
  /** True while the mutation is in flight. */
  readonly isPending: boolean;
}

export function useCancelTrade(
  options: UseCancelTradeOptions = {},
): UseCancelTradeResult {
  const showSuccess = useToastStore((s) => s.showSuccess);
  const showError = useToastStore((s) => s.showError);

  const mutation = useMutation({
    mutationFn: (id: TradeId) => cancelTrade(id),
    onSuccess: () => {
      showSuccess('Trade cancelled.');
      options.onSuccess?.();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.statusCode === 409) {
        // Already cancelled: show only the specific message.
        showError(resolveErrorMessage(error.code));
        return;
      }
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      showError(resolveErrorMessage(code));
    },
  });

  return {
    submit: (id) => mutation.mutate(id),
    isPending: mutation.isPending,
  };
}
