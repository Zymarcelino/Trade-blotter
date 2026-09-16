/**
 * <TradeRow /> — a single trade rendered as a semantic table row.
 *
 * Presentational only: it receives a `Readonly<Trade>` and renders its cells,
 * applying two pieces of visual behaviour from the UX steering:
 *
 *  - CANCELLED trades get the `cancelled` class, which de-emphasises the row
 *    with BOTH reduced opacity AND strikethrough (never colour alone).
 *
 * The row is keyboard-focusable and activates `onRowClick` on click or
 * Enter/Space, so opening the audit panel never requires a mouse.
 *
 * _Requirements: 9.5, 9.6_
 */

import { memo } from 'react';

import { formatCurrency, formatTimestamp } from '../../utils/formatters';
import { TradeSide, TradeStatus, type Trade } from '../../types/trade.types';
import styles from './TradeRow.module.css';

/** Props for {@link TradeRow}. */
export interface TradeRowProps {
  /** The trade to render (immutable). */
  readonly trade: Readonly<Trade>;
  /** Called with the trade when the row is clicked or keyboard-activated. */
  readonly onRowClick: (trade: Readonly<Trade>) => void;
  /** Opens the amend flow for this trade (inline row action; ACTIVE rows only). */
  readonly onAmend: (trade: Readonly<Trade>) => void;
  /** Opens the cancel-confirm flow for this trade (inline row action; ACTIVE only). */
  readonly onCancel: (trade: Readonly<Trade>) => void;
}

function TradeRowComponent({
  trade,
  onRowClick,
  onAmend,
  onCancel,
}: TradeRowProps): React.JSX.Element {
  const isCancelled = trade.status === TradeStatus.CANCELLED;
  const className = [styles.row, isCancelled ? styles.cancelled : '']
    .filter(Boolean)
    .join(' ');

  const handleActivate = (): void => {
    onRowClick(trade);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(trade);
    }
  };

  return (
    <tr
      className={className}
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <td className={styles.timeCell}>{formatTimestamp(trade.tradeDate)}</td>
      <td>
        <span
          className={`${styles.pill} ${
            isCancelled ? styles.cancelledPill : styles.activePill
          }`}
        >
          {trade.status}
        </span>
      </td>
      <td className={styles.strong}>{trade.symbol}</td>
      <td>
        <span
          className={`${styles.pill} ${
            trade.side === TradeSide.BUY ? styles.buyPill : styles.sellPill
          }`}
        >
          {trade.side}
        </span>
      </td>
      <td className={styles.strong}>{formatCurrency(trade.price)}</td>
      <td className={styles.strong}>{trade.quantity}</td>
      <td className={styles.muted}>{trade.book}</td>
      <td className={styles.muted}>{trade.counterparty}</td>
      <td className={styles.actions}>
        {!isCancelled && (
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.amend}
              onClick={(e) => {
                e.stopPropagation();
                onAmend(trade);
              }}
              aria-label={`Amend trade ${trade.id}`}
            >
              Amend
            </button>
            <button
              type="button"
              className={styles.cancel}
              onClick={(e) => {
                e.stopPropagation();
                onCancel(trade);
              }}
              aria-label={`Cancel trade ${trade.id}`}
            >
              Cancel
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Memoised so a re-render of the table body (e.g. from a WS update to a
 * *different* row) does not re-render every row — only rows whose props
 * actually changed.
 */
export const TradeRow = memo(TradeRowComponent);
