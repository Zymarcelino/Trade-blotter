/**
 * Zustand toast store — the notification queue for mutation feedback.
 *
 * Holds the list of active toasts; the {@link import('../components/ToastContainer')}
 * owns the presentation and the auto-dismiss timing. Toasts convey their kind
 * with BOTH an explicit text label and styling, never colour alone.
 */

import { create } from 'zustand';

/** How long a toast stays visible before auto-dismissal (ms). */
export const TOAST_AUTO_DISMISS_MS = 4500;

/** The kind of a toast. */
export const ToastType = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;
export type ToastType = (typeof ToastType)[keyof typeof ToastType];

/** A single toast notification. */
export interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly message: string;
}

/** The toast store state and actions. */
export interface ToastStoreState {
  /** The active toasts, in insertion order. */
  readonly toasts: ReadonlyArray<Toast>;
  /** Pushes a success toast; returns its id. */
  showSuccess: (message: string) => number;
  /** Pushes an error toast; returns its id. */
  showError: (message: string) => number;
  /** Removes the toast with the given id. */
  dismiss: (id: number) => void;
  /** Removes all toasts. */
  clear: () => void;
}

/** Monotonic id source so every toast is uniquely keyed. */
let nextId = 1;

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],

  showSuccess: (message) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, type: ToastType.SUCCESS, message }],
    }));
    return id;
  },

  showError: (message) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, type: ToastType.ERROR, message }],
    }));
    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));
