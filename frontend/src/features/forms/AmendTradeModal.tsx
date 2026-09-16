/**
 * <AmendTradeModal /> — the "amend trade" dialog.
 *
 * Composes the generic {@link Modal} with the shared {@link TradeForm} in
 * `amend` mode and wires it to the {@link useAmendTrade} mutation hook. The UX
 * contract (Requirement 11.x, ux-best-practices "Forms"):
 *
 *  - the form is PRE-POPULATED with every current value of the selected trade
 *    so the user edits from the existing state (Req 11.2)
 *  - on submit: the amend mutation runs; the submit button is disabled while in
 *    flight to prevent double-submission
 *  - on success: `useAmendTrade` toasts and the modal closes
 *  - on a 409 conflict (amending a CANCELLED trade): the hook exposes a
 *    `conflictMessage`, rendered INLINE near the submit area — never a generic
 *    toast (Req 11.3). The modal stays open.
 *  - on any other error: the hook raises an error toast; the modal stays open
 *
 * No optimistic store update — the `TRADE_AMENDED` broadcast patches the store
 * after the server confirms.
 *
 * _Requirements: 11.1, 11.2, 11.3_
 */

import { useAmendTrade } from '../../hooks/useAmendTrade';
import type {
  AmendTradeRequest,
  Trade,
  TradeSide,
  TradeStatus,
} from '../../types/trade.types';
import { Modal } from '../../components/Modal';
import { TradeForm, type TradeFormValues } from './TradeForm';
import type { AmendTradeFormValues } from '../../utils/tradeSchema';

/** Props for {@link AmendTradeModal}. */
export interface AmendTradeModalProps {
  /** Whether the dialog is open. */
  readonly isOpen: boolean;
  /** Closes the dialog (called on success, cancel, Escape, or backdrop). */
  readonly onClose: () => void;
  /**
   * The trade being amended. Its current values pre-populate the form. When
   * `null` (nothing selected) the dialog renders nothing.
   */
  readonly trade: Readonly<Trade> | null;
}

/** Maps a trade to the form's default values (all editable fields). */
function toDefaults(
  trade: Readonly<Trade>,
): Partial<Record<keyof AmendTradeFormValues, unknown>> {
  return {
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price,
    side: trade.side,
    trader: trade.trader,
    book: trade.book,
    counterparty: trade.counterparty,
    status: trade.status,
  };
}

export function AmendTradeModal({
  isOpen,
  onClose,
  trade,
}: AmendTradeModalProps): React.JSX.Element | null {
  const { submit, isPending, conflictMessage } = useAmendTrade({
    onSuccess: () => onClose(),
  });

  if (!trade) return null;

  function handleSubmit(values: TradeFormValues): void {
    if (!trade) return;
    const v = values as AmendTradeFormValues;
    // Only forward fields the resolver produced (all optional in amend mode).
    const dto: AmendTradeRequest = {
      ...(v.symbol !== undefined ? { symbol: v.symbol } : {}),
      ...(v.quantity !== undefined ? { quantity: v.quantity } : {}),
      ...(v.price !== undefined ? { price: v.price } : {}),
      ...(v.side !== undefined ? { side: v.side as TradeSide } : {}),
      ...(v.trader !== undefined ? { trader: v.trader } : {}),
      ...(v.book !== undefined ? { book: v.book } : {}),
      ...(v.counterparty !== undefined ? { counterparty: v.counterparty } : {}),
      ...(v.status !== undefined ? { status: v.status as TradeStatus } : {}),
    };
    submit(trade.id, dto);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Amend trade ${trade.id}`}>
      <TradeForm
        mode="amend"
        onSubmit={handleSubmit}
        defaultValues={toDefaults(trade)}
        isSubmitting={isPending}
        onCancel={onClose}
        conflictMessage={conflictMessage}
      />
    </Modal>
  );
}
