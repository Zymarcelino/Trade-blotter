/**
 * Unit tests for <ErrorBoundary />.
 *
 * The boundary must catch render errors from its subtree and show a full-page
 * fallback with a "Reload" button, while logging the error for debugging. React
 * intentionally logs caught errors to the console, so these tests silence the
 * expected console noise and assert on the observable behaviour only.
 *
 * _Requirements: 14.3_
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ErrorBoundary } from './ErrorBoundary';

/** A component that throws on render, to trip the boundary. */
function Boom(): React.JSX.Element {
  throw new Error('kaboom');
}

/** A harmless component used to assert the happy path. */
function Safe(): React.JSX.Element {
  return <div>all good</div>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs the caught error and a component-stack warning; silence both so
  // the test output stays clean while still letting us assert our own log call.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children when no error is thrown', () => {
    // Act
    render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws during render', () => {
    // Act
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Assert — the safe subtree is gone; the fallback is shown.
    expect(screen.queryByText('all good')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload/i }),
    ).toBeInTheDocument();
  });

  it('logs the caught error to the console', () => {
    // Act
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Assert — our componentDidCatch logged at least once.
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('calls window.location.reload when the Reload button is clicked', () => {
    // Arrange — stub the non-configurable reload on jsdom's location.
    const reloadSpy = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload: reloadSpy },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Act
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    // Assert
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Cleanup — restore the real location descriptor.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    });
  });
});
