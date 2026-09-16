/**
 * Test helper: a `QueryClientProvider` wrapper for `renderHook`.
 *
 * Every hook test that uses TanStack Query needs a provider. This factory
 * builds a fresh `QueryClient` per call (so caches never leak between tests)
 * with retries disabled — tests assert on the *first* settled result, and
 * retries would otherwise delay error states and slow the suite.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** The wrapper component type expected by `renderHook`'s `wrapper` option. */
export type QueryWrapper = ({ children }: { children: ReactNode }) => JSX.Element;

/** A fresh `QueryClient` plus the wrapper that provides it. */
export interface QueryWrapperResult {
  readonly queryClient: QueryClient;
  readonly wrapper: QueryWrapper;
}

/**
 * Creates an isolated `QueryClient` (retries off, no dev logging noise) and a
 * matching provider wrapper for use with `renderHook`.
 */
export function createQueryWrapper(): QueryWrapperResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper: QueryWrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}
