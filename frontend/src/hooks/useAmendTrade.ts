/**
 * useAmendTrade — wraps the amend mutation with toast + inline-conflict feedback.
 *
 * On success: shows a success toast and calls `onSuccess` (the modal closes).
 * On a 409 conflict (amending a CANCELLED trade): exposes `conflictMessage` for
 * the form to render INLINE near the submit area — never a generic toast. On
 * any other error: shows an error toast. There is no optimistic store update.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { amendTrade } from '../services/trade.api';
import { ApiError } from '../services/errors';
import { resolveErrorMessage } from '../utils/errorMessages';
import { useToastStore } from '../store/toast.store';
import type { AmendTradeRequest, TradeId } from '../types/trade.types';

/** Options for {@link useAmendTrade}. */
export interface UseAmendTradeOptions {
  /** Called after a successful amend (e.g. to close the modal). */
  readonly onSuccess?: () => void;
}

/** Arguments to the amend mutation. */
interface AmendArgs {
  readonly id: TradeId;
  readonly dto: AmendTradeRequest;
}

/** The shape returned by {@link useAmendTrade}. */
export interface UseAmendTradeResult {
  /** Fires the amend mutation for a trade id + partial fields. */
  readonly submit: (id: TradeId, dto: AmendTradeRequest) => void;
  /** True while the mutation is in flight. */
  readonly isPending: boolean;
  /** Inline conflict message (409), or null. */
  readonly conflictMessage: string | null;
}

export function useAmendTrade(
  options: UseAmendTradeOptions = {},
): UseAmendTradeResult {
  const showSuccess = useToastStore((s) => s.showSuccess);
  const showError = useToastStore((s) => s.showError);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, dto }: AmendArgs) => amendTrade(id, dto),
    onMutate: () => {
      setConflictMessage(null);
    },
    onSuccess: () => {
      showSuccess('Trade amended.');
      options.onSuccess?.();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.statusCode === 409) {
        // A conflict is surfaced inline in the form, not as a toast.
        setConflictMessage(resolveErrorMessage(error.code));
        return;
      }
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      showError(resolveErrorMessage(code));
    },
  });

  return {
    submit: (id, dto) => mutation.mutate({ id, dto }),
    isPending: mutation.isPending,
    conflictMessage,
  };
}
