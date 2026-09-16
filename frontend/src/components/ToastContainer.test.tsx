import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastContainer } from './ToastContainer';
import {
  TOAST_AUTO_DISMISS_MS,
  useToastStore,
} from '../store/toast.store';

/**
 * ToastContainer renders the toast stack owned by the toast store and owns the
 * timing (auto-dismiss) and manual-dismiss concerns. These tests cover: empty
 * render, success/error styling with BOTH text label + icon (colour is never
 * the only cue), top-right live region, auto-dismiss after 4.5s, manual dismiss,
 * multiple independent toasts, and accessible roles.
 */

/** Clears the store between tests so toasts never leak across cases. */
afterEach(() => {
  // Unmount the container BEFORE resetting the store: clearing the store
  // triggers a state update, and if the component were still mounted that
  // update would fire outside act() (and any pending auto-dismiss timer would
  // run against a live tree). Unmounting first makes both a no-op.
  cleanup();
  act(() => {
    useToastStore.getState().clear();
  });
  vi.useRealTimers();
});

describe('ToastContainer', () => {
  it('renders an empty live region when there are no toasts', () => {
    render(<ToastContainer />);

    const container = screen.getByTestId('toast-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(within(container).queryByRole('status')).not.toBeInTheDocument();
    expect(within(container).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a success toast with an explicit text label and message', () => {
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showSuccess('Trade created');
    });

    const toast = screen.getByRole('status');
    // Colour is never the only signal — the word "Success" is present.
    expect(toast).toHaveTextContent('Success');
    expect(toast).toHaveTextContent('Trade created');
  });

  it('renders an error toast with role=alert and an explicit "Error" label', () => {
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showError('Something failed');
    });

    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('Error');
    expect(toast).toHaveTextContent('Something failed');
  });

  it('renders multiple toasts simultaneously in insertion order', () => {
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showSuccess('first');
      useToastStore.getState().showError('second');
    });

    expect(screen.getByRole('status')).toHaveTextContent('first');
    expect(screen.getByRole('alert')).toHaveTextContent('second');
  });

  it('auto-dismisses a toast after the 4.5s window', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showSuccess('auto go away');
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not auto-dismiss before the window elapses', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showSuccess('still here');
    });

    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('dismisses a toast when the × button is clicked', async () => {
    const user = userEvent.setup();
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showError('dismiss me');
    });

    await user.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses each toast independently on its own timer', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    // First toast mounts now; second mounts 1000ms later.
    act(() => {
      useToastStore.getState().showSuccess('early');
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      useToastStore.getState().showSuccess('late');
    });

    // Advance so the first toast's timer (mounted at t=0) fires but the second
    // (mounted at t=1000) has not yet.
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1_000);
    });

    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('late');
  });
});
