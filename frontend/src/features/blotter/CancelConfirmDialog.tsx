/**
 * <CancelConfirmDialog /> - confirmation before cancelling a trade.
 *
 * Cancelling is a destructive, non-undoable status transition, so the blotter
 * requires an explicit confirmation (Requirement 19.4). This wraps the shared,
 * accessible {@link Modal} (focus trap + Escape/backdrop close) and offers a
 * non-destructive dismiss ("Keep") alongside the confirming action
 * ("Cancel trade"). The destructive intent is conveyed by BOTH the word
 * "Cancel" and colour, so colour is never the only signal (Requirement 19.8).
 */

import { Modal } from '../../components/Modal';
import type { TradeId } from '../../types/trade.types';
import styles from './CancelConfirmDialog.module.css';

/** Props for {@link CancelConfirmDialog}. */
export interface CancelConfirmDialogProps {
  /** The trade id awaiting cancellation, or `null` when the dialog is closed. */
  readonly tradeId: TradeId | null;
  /** Dismisses the dialog without cancelling ("Keep"). */
  readonly onKeep: () => void;
  /** Confirms cancellation of {@link tradeId}. */
  readonly onConfirm: (id: TradeId) => void;
  /** True while the cancel mutation is in flight (disables the confirm button). */
  readonly isPending?: boolean;
}

export function CancelConfirmDialog({
  tradeId,
  onKeep,
  onConfirm,
  isPending = false,
}: CancelConfirmDialogProps): React.JSX.Element | null {
  if (tradeId === null) {
    return null;
  }

  return (
    <Modal isOpen onClose={onKeep} title="Confirm cancellation">
      <div className={styles.body}>
        <p className={styles.lead}>
          Cancel trade <span className={styles.tradeId}>{tradeId}</span>?
        </p>
        <p className={styles.detail}>
          This sets the trade status to CANCELLED. This action cannot be undone.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.keep}
            onClick={onKeep}
            disabled={isPending}
          >
            Keep
          </button>
          <button
            type="button"
            className={styles.confirm}
            onClick={() => onConfirm(tradeId)}
            disabled={isPending}
          >
            {isPending ? 'Cancelling...' : 'Cancel trade'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
