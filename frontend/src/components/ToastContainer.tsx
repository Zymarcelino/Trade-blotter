/**
 * <ToastContainer /> — renders the toast stack from the toast store and owns
 * both the auto-dismiss timing and the manual-dismiss control.
 *
 * Accessibility / UX:
 *  - The container is always mounted as an `aria-live="polite"` region (testid
 *    `toast-container`) so screen readers announce toasts as they arrive.
 *  - A success toast is `role="status"`; an error toast is `role="alert"`.
 *  - Each toast carries an explicit text label ("Success"/"Error") so its kind
 *    is never conveyed by colour alone.
 *  - Each toast auto-dismisses on its own timer (TOAST_AUTO_DISMISS_MS); the ×
 *    button dismisses immediately. Timers are cleaned up on unmount so a pending
 *    dismiss never fires against an unmounted tree.
 */

import { useEffect } from 'react';

import {
  TOAST_AUTO_DISMISS_MS,
  ToastType,
  useToastStore,
  type Toast,
} from '../store/toast.store';
import styles from './ToastContainer.module.css';

export function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className={styles.container}
      data-testid="toast-container"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

/** A single rendered toast, owning its own auto-dismiss timer. */
function ToastItem({ toast }: { readonly toast: Toast }): React.JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss);
  const isSuccess = toast.type === ToastType.SUCCESS;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismiss(toast.id);
    }, TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div
      className={`${styles.toast} ${isSuccess ? styles.success : styles.error}`}
      role={isSuccess ? 'status' : 'alert'}
    >
      <span className={styles.icon} aria-hidden="true">
        {isSuccess ? '\u2713' : '\u26A0'}
      </span>
      <div className={styles.text}>
        <span className={styles.label}>{isSuccess ? 'Success' : 'Error'}</span>
        <span className={styles.message}>{toast.message}</span>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        {'\u00D7'}
      </button>
    </div>
  );
}
