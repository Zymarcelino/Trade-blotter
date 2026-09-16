/**
 * <Modal /> — a small, accessible dialog wrapper.
 *
 * Used by the create/amend trade modals. Behaviour (per the accessibility
 * steering):
 *
 *  - Rendered as `role="dialog"` with `aria-modal="true"` and labelled by its
 *    title so screen readers announce it correctly.
 *  - Focus is moved into the dialog on open and trapped with Tab/Shift+Tab so
 *    keyboard users cannot tab out to the obscured page behind it.
 *  - Escape and the header close button both trigger `onClose`.
 *  - Clicking the backdrop (outside the dialog) also closes it.
 *
 * The modal is uncontrolled beyond `isOpen`; it renders nothing when closed.
 */

import { useCallback, useEffect, useRef } from 'react';

import styles from './Modal.module.css';

/** Props for {@link Modal}. */
export interface ModalProps {
  /** Whether the dialog is visible. When false, nothing is rendered. */
  readonly isOpen: boolean;
  /** Invoked on Escape, backdrop click, or the close button. */
  readonly onClose: () => void;
  /** Accessible dialog title, shown in the header and used as its label. */
  readonly title: string;
  /** Dialog body content. */
  readonly children: React.ReactNode;
}

/** CSS selector matching focusable elements for the focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
}: ModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  /** Returns the currently focusable elements inside the dialog. */
  const focusableElements = useCallback((): HTMLElement[] => {
    const node = dialogRef.current;
    if (!node) return [];
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  // Move focus into the dialog once it opens.
  useEffect(() => {
    if (!isOpen) return;
    const [first] = focusableElements();
    first?.focus();
  }, [isOpen, focusableElements]);

  // Escape to close + Tab focus trap while open.
  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, focusableElements]);

  if (!isOpen) return null;

  const titleId = 'modal-title';

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        // Close only when the backdrop itself (not the dialog) is clicked.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
