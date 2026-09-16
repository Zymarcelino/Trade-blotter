/**
 * <AddRandomTradesModal /> - a small dialog to bulk-create random trades.
 *
 * The user enters how many random trades to generate; on submit it calls the
 * backend `POST /api/v1/trades/random` endpoint, which persists and broadcasts
 * each one, so the created trades stream back into the blotter over the live
 * WebSocket (no local insertion). A success toast reports how many landed; an
 * error toast reports failures with a human-readable message. The modal closes
 * on success and stays open (preserving input) on error.
 *
 * This is a demo/load helper reusing the real create path - not a core trade
 * workflow - so it lives beside the create/amend forms.
 */

import { useState } from 'react';

import { Modal } from '../../components/Modal';
import { addRandomTrades } from '../../services/trade.api';
import { ApiError } from '../../services/errors';
import { resolveErrorMessage } from '../../utils/errorMessages';
import { useToastStore } from '../../store/toast.store';
import styles from './AddRandomTradesModal.module.css';

/** Server-enforced maximum per request (mirrors the backend cap). */
const MAX_RANDOM = 10000;

/** Props for {@link AddRandomTradesModal}. */
export interface AddRandomTradesModalProps {
  /** Whether the dialog is open. */
  readonly isOpen: boolean;
  /** Called to close the dialog (cancel, backdrop, Escape, or success). */
  readonly onClose: () => void;
}

export function AddRandomTradesModal({
  isOpen,
  onClose,
}: AddRandomTradesModalProps): React.JSX.Element {
  const [count, setCount] = useState('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showSuccess = useToastStore((s) => s.showSuccess);
  const showError = useToastStore((s) => s.showError);

  const parsed = Number(count);
  const isValid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_RANDOM;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!isValid || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await addRandomTrades(parsed);
      showSuccess(`Added ${res.data.created} random trades.`);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? resolveErrorMessage(err.code)
          : 'Failed to add random trades.';
      setError(message);
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Random Trades">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <p className={styles.hint}>
          Generate randomised trades on the server. They stream into the blotter
          live over the WebSocket.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="random-count">
            How many trades? <span className={styles.required} aria-hidden="true">*</span>
          </label>
          <input
            id="random-count"
            type="number"
            min={1}
            max={MAX_RANDOM}
            step={1}
            className={styles.input}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-required="true"
            aria-invalid={!isValid}
            aria-describedby={error ? 'random-count-error' : undefined}
          />
          {!isValid && count !== '' && (
            <p className={styles.error} role="alert">
              Enter a whole number between 1 and {MAX_RANDOM.toLocaleString()}.
            </p>
          )}
        </div>

        {error && (
          <p id="random-count-error" className={styles.serverError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Trades'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
