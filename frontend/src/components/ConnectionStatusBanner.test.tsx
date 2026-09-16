/**
 * Unit tests for <ConnectionStatusBanner />.
 *
 * The banner reflects the WebSocket connection flag held in the Zustand trade
 * store. These tests drive the store via `useTradeStore.setState` (Arrange),
 * render the component (Act), and assert on the visible text and accessibility
 * affordances (Assert).
 *
 * Accessibility requirements under test (see ux-best-practices / frontend
 * steering): state is conveyed by TEXT as well as colour, and status changes
 * are announced through an `aria-live` / `role="status"` region.
 *
 * _Requirements: 8.6_
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { ConnectionStatusBanner } from './ConnectionStatusBanner';
import { useTradeStore } from '../store/trade.store';

/** Resets the store connection flag to a known baseline before each test. */
beforeEach(() => {
  useTradeStore.setState({ isConnected: false });
});

afterEach(() => {
  cleanup();
  // Restore default state so tests remain independent.
  useTradeStore.setState({ isConnected: false });
});

describe('ConnectionStatusBanner', () => {
  describe('when disconnected (isConnected === false)', () => {
    beforeEach(() => {
      useTradeStore.setState({ isConnected: false });
    });

    it('renders the visible "Disconnected" text, not colour alone', () => {
      // Act
      render(<ConnectionStatusBanner />);

      // Assert
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });

    it('exposes a status region that screen readers announce (role=status)', () => {
      // Act
      render(<ConnectionStatusBanner />);

      // Assert
      const region = screen.getByRole('status');
      expect(region).toBeInTheDocument();
      expect(region).toHaveAttribute('aria-live', 'polite');
    });

    it('does not render the "Connected" text while disconnected', () => {
      // Act
      render(<ConnectionStatusBanner />);

      // Assert
      expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument();
    });
  });

  describe('when connected (isConnected === true)', () => {
    beforeEach(() => {
      useTradeStore.setState({ isConnected: true });
    });

    it('does not render the disconnected state', () => {
      // Act
      render(<ConnectionStatusBanner />);

      // Assert
      expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();
    });

    it('keeps the aria-live status region mounted so changes are announced', () => {
      // Act
      render(<ConnectionStatusBanner />);

      // Assert — the live region must persist even when nothing is shown,
      // otherwise a screen reader cannot announce a later disconnect.
      const region = screen.getByRole('status');
      expect(region).toBeInTheDocument();
      expect(region).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('reacting to store changes', () => {
    it('shows "Disconnected" after the connection drops from connected', () => {
      // Arrange — start connected.
      useTradeStore.setState({ isConnected: true });
      render(<ConnectionStatusBanner />);
      expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();

      // Act — connection drops.
      act(() => {
        useTradeStore.setState({ isConnected: false });
      });

      // Assert
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });

    it('shows a brief "Connected" confirmation after reconnecting', () => {
      // Arrange — start disconnected.
      useTradeStore.setState({ isConnected: false });
      render(<ConnectionStatusBanner />);
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

      // Act — reconnect.
      act(() => {
        useTradeStore.setState({ isConnected: true });
      });

      // Assert — a transient "Connected" confirmation is shown.
      expect(screen.getByText(/^connected$/i)).toBeInTheDocument();
      expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();
    });
  });
});
