/**
 * useCreateTrade — wraps the create mutation with toast feedback.
 *
 * On success: shows a success toast and calls the supplied `onSuccess`
 * (the modal closes). On error: shows an error toast with a human-readable
 * message and leaves the form open. There is no optimistic store update — the
 * TRADE_CREATED broadcast patches the store after the server confirms.
 */

import { useMutation } from '@tanstack/react-query';

import { createTrade } from '../services/trade.api';
import { ApiError } from '../services/errors';
import { resolveErrorMessage } from '../utils/errorMessages';
import { useToastStore } from '../store/toast.store';
import type { CreateTradeRequest } from '../types/trade.types';

/** Options for {@link useCreateTrade}. */
export interface UseCreateTradeOptions {
  /** Called after a successful create (e.g. to close the modal). */
  readonly onSuccess?: () => void;
}

/** The shape returned by {@link useCreateTrade}. */
export interface UseCreateTradeResult {
  /** Fires the create mutation. */
  readonly submit: (dto: CreateTradeRequest) => void;
  /** True while the mutation is in flight (disables the submit button). */
  readonly isPending: boolean;
}

export function useCreateTrade(
  options: UseCreateTradeOptions = {},
): UseCreateTradeResult {
  const showSuccess = useToastStore((s) => s.showSuccess);
  const showError = useToastStore((s) => s.showError);

  const mutation = useMutation({
    mutationFn: (dto: CreateTradeRequest) => createTrade(dto),
    onSuccess: () => {
      showSuccess('Trade created.');
      options.onSuccess?.();
    },
    onError: (error: unknown) => {
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      showError(resolveErrorMessage(code));
    },
  });

  return {
    submit: (dto) => mutation.mutate(dto),
    isPending: mutation.isPending,
  };
}
