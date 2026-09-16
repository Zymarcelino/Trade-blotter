/**
 * <CreateTradeModal /> — the "create trade" dialog.
 *
 * Composes the generic {@link Modal} with the shared {@link TradeForm} in
 * `create` mode and wires it to the {@link useCreateTrade} mutation hook. The
 * UX contract (Requirement 10.x, ux-best-practices "Forms"):
 *
 *  - on submit: the create mutation runs; the submit button is disabled while
 *    the request is in flight so a rapid double-click cannot fire twice
 *  - on success: `useCreateTrade` raises a success toast and the modal closes
 *    (via the hook's `onSuccess` calling this component's `onClose`)
 *  - on error: `useCreateTrade` raises an error toast and the modal STAYS open
 *    so the user can correct their input and resubmit without re-typing
 *
 * This component holds no business logic — it maps validated form values to a
 * `CreateTradeRequest` and delegates. There is deliberately no optimistic store
 * update: the `TRADE_CREATED` WebSocket broadcast is the source of truth.
 *
 * _Requirements: 10.1_
 */

import { useCreateTrade } from '../../hooks/useCreateTrade';
import type { CreateTradeRequest, TradeSide } from '../../types/trade.types';
import { Modal } from '../../components/Modal';
import { TradeForm, type TradeFormValues } from './TradeForm';
import type { CreateTradeFormValues } from '../../utils/tradeSchema';

/** Props for {@link CreateTradeModal}. */
export interface CreateTradeModalProps {
  /** Whether the dialog is open. */
  readonly isOpen: boolean;
  /** Closes the dialog (called on success, cancel, Escape, or backdrop). */
  readonly onClose: () => void;
}

export function CreateTradeModal({
  isOpen,
  onClose,
}: CreateTradeModalProps): React.JSX.Element {
  const { submit, isPending } = useCreateTrade({
    // On a successful create the hook toasts; we close the dialog here.
    onSuccess: () => onClose(),
  });

  function handleSubmit(values: TradeFormValues): void {
    // In create mode the resolver guarantees every field is present and valid.
    const v = values as CreateTradeFormValues;
    const dto: CreateTradeRequest = {
      symbol: v.symbol,
      quantity: v.quantity,
      price: v.price,
      side: v.side as TradeSide,
      trader: v.trader,
      book: v.book,
      counterparty: v.counterparty,
    };
    submit(dto);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create trade">
      <TradeForm
        mode="create"
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        onCancel={onClose}
      />
    </Modal>
  );
}
