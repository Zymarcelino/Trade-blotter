/**
 * <ErrorBoundary /> — app-root render-error safety net.
 *
 * React error boundaries must be class components: only `getDerivedStateFromError`
 * and `componentDidCatch` can intercept a render-time throw from the subtree.
 * On catch, this boundary swaps the whole subtree for a full-page fallback with
 * a "Reload" button (never a blank screen) and logs the error to the console for
 * debugging, per the error-handling steering.
 *
 * It deliberately holds no business logic — its single responsibility is
 * catching render errors and offering the user a recovery action.
 *
 * _Requirements: 14.3_
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import styles from './ErrorBoundary.module.css';

/** Props: the subtree to guard. */
export interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

/** State: whether a render error has been caught. */
interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = { hasError: false };

  /** Flip into the error state so the next render shows the fallback. */
  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  /** Log the caught error (and component stack) for debugging. */
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught a render error:', error, info);
  }

  /** Full-page reload — the simplest reliable recovery from a broken render. */
  private readonly handleReload = (): void => {
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.fallback} role="alert">
          <div className={styles.panel}>
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.message}>
              The application hit an unexpected error. Reloading usually fixes
              it.
            </p>
            <button
              type="button"
              className={styles.reloadButton}
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
