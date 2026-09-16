/**
 * <AuditHistoryPanel /> — the amendment-history side panel for a single trade.
 *
 * Opens when the user clicks a trade row in the blotter. It is a NON-BLOCKING
 * side drawer (fixed to the right edge, no opaque full-page overlay), so the
 * blotter behind it stays visible and interactive — per the audit-trail and
 * ux-best-practices steering.
 *
 * The panel NEVER renders blank: it always shows exactly one of four states —
 * loading skeleton, populated audit table, empty-history message, or an error
 * state with a Retry button. The loading skeleton is rendered IMMEDIATELY on
 * open (the panel structure paints before the fetch resolves), and the audit
 * query is driven by {@link useAuditHistory} which is gated on `isOpen`.
 *
 * `changedAt` is always rendered via {@link formatTimestamp} as human-readable
 * local time (e.g. "18 Aug 2026, 10:32:00") — a raw ISO 8601 string is never
 * shown to the user.
 *
 * Accessibility: the audit body is an `aria-live` region with `aria-busy`
 * reflecting the loading state, so screen readers announce when history arrives
 * or an error appears; the history itself is a semantic `<table>`.
 *
 * _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 7.4_
 */

import { useAuditHistory } from '../../hooks/useAuditHistory';
import { resolveErrorMessage } from '../../utils/errorMessages';
import { formatCurrency } from '../../utils/formatters';
import { TradeSide, TradeStatus } from '../../types/trade.types';
import type { AuditEntry, Trade } from '../../types/trade.types';
import styles from './AuditHistoryPanel.module.css';

/**
 * Formats an ISO 8601 timestamp as human-readable local time, e.g.
 * `"18 Aug 2026, 10:32:00"`. The result never contains a raw `T`/`Z` separator.
 *
 * This mirrors the shared `utils/formatters.ts#formatTimestamp` contract
 * (design Property 23); it is defined locally so the audit panel does not
 * depend on a module that may be authored in a parallel task. Invalid input is
 * returned unchanged rather than surfacing `"Invalid Date"` to the user.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Props for {@link AuditHistoryPanel}. */
export interface AuditHistoryPanelProps {
  /** The trade whose audit history is shown; also drives the read-only summary. */
  readonly trade: Readonly<Trade>;
  /** Whether the panel is open. Gates the audit query and controls rendering. */
  readonly isOpen: boolean;
  /** Called when the user dismisses the panel via the close button. */
  readonly onClose: () => void;
}

/** Number of placeholder rows shown in the loading skeleton. */
const SKELETON_ROWS = 4;

/**
 * The audit history side panel. Renders nothing while closed; while open it
 * always shows one of: loading skeleton, table, empty message, or error state.
 */
export function AuditHistoryPanel({
  trade,
  isOpen,
  onClose,
}: AuditHistoryPanelProps): React.JSX.Element | null {
  const { data, isLoading, isError, error, refetch } = useAuditHistory(
    trade.id,
    isOpen,
  );

  if (!isOpen) {
    return null;
  }

  const headingId = 'audit-panel-heading';

  return (
    <aside
      className={styles.panel}
      role="complementary"
      aria-label={`Audit history for ${trade.id}`}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Trade Detail</span>
          <h2 id={headingId} className={styles.title}>
            {trade.id}
          </h2>
          <div className={styles.pillRow}>
            <span
              className={`${styles.pill} ${
                trade.side === TradeSide.BUY ? styles.buyPill : styles.sellPill
              }`}
            >
              {trade.side}
            </span>
            <span className={styles.headerSymbol}>{trade.symbol}</span>
            <span
              className={`${styles.pill} ${
                trade.status === TradeStatus.CANCELLED
                  ? styles.cancelledPill
                  : styles.activePill
              }`}
            >
              {trade.status}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close audit history panel"
        >
          ×
        </button>
      </div>

      <div className={styles.body}>
        <TradeSummary trade={trade} />

        <section aria-labelledby="audit-table-heading">
          <h3 id="audit-table-heading" className={styles.tableHeading}>
            Amendment history
          </h3>
          <div aria-live="polite" aria-busy={isLoading}>
            <AuditBody
              isLoading={isLoading}
              isError={isError}
              errorCode={error?.code ?? null}
              entries={data}
              onRetry={refetch}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}

/**
 * Read-only summary of the trade the audit history belongs to, laid out as a
 * label-left / value-right detail list (matching the reference). Side/status/
 * symbol live in the panel header pill row, so this list carries the numeric
 * and context fields, including a computed Notional and formatted Timestamp.
 */
function TradeSummary({ trade }: { readonly trade: Readonly<Trade> }): React.JSX.Element {
  const notional = trade.price * trade.quantity;
  return (
    <section className={styles.summary} aria-label="Trade detail">
      <dl className={styles.summaryList}>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Quantity</dt>
          <dd className={styles.summaryValue}>{trade.quantity.toLocaleString()}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Price</dt>
          <dd className={styles.summaryValue}>${formatCurrency(trade.price)}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Notional</dt>
          <dd className={styles.summaryValue}>
            ${notional.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Trader</dt>
          <dd className={styles.summaryValue}>{trade.trader}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Book</dt>
          <dd className={styles.summaryValue}>{trade.book}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Counterparty</dt>
          <dd className={styles.summaryValue}>{trade.counterparty}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryTerm}>Timestamp</dt>
          <dd className={styles.summaryValue}>{formatTimestamp(trade.tradeDate)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Props for {@link AuditBody}. */
interface AuditBodyProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorCode: string | null;
  readonly entries: readonly AuditEntry[] | undefined;
  readonly onRetry: () => void;
}

/**
 * Selects and renders exactly one of the four panel body states. Loading takes
 * priority (so the skeleton shows immediately on open), then error, then the
 * empty message, then the populated table.
 */
function AuditBody({
  isLoading,
  isError,
  errorCode,
  entries,
  onRetry,
}: AuditBodyProps): React.JSX.Element {
  if (isLoading) {
    return <AuditLoadingSkeleton />;
  }
  if (isError) {
    return <AuditErrorState errorCode={errorCode} onRetry={onRetry} />;
  }
  if (!entries || entries.length === 0) {
    return (
      <p className={styles.empty}>No amendments recorded for this trade.</p>
    );
  }
  return <AuditTimeline entries={entries} />;
}

/** Shimmer placeholder shown while the audit query is in flight. */
function AuditLoadingSkeleton(): React.JSX.Element {
  return (
    <div className={styles.skeleton} data-testid="audit-loading-skeleton">
      {Array.from({ length: SKELETON_ROWS }, (_unused, index) => (
        <div key={index} className={styles.skeletonRow} aria-hidden="true" />
      ))}
      <span className="sr-only">Loading audit history…</span>
    </div>
  );
}

/** Error state with a Retry button that re-runs the audit query. */
function AuditErrorState({
  errorCode,
  onRetry,
}: {
  readonly errorCode: string | null;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.errorMessage}>
        {resolveErrorMessage(errorCode ?? '')}
      </p>
      <button type="button" className={styles.retryButton} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/**
 * Timeline of audit entries (most recent first, as returned by the API).
 *
 * Rendered as a semantic ordered list: each event is a node on a vertical
 * timeline showing the changed field, the old -> new transition, and the local
 * timestamp. The old/new transition is text (with an arrow), so the change is
 * legible without relying on colour.
 */
function AuditTimeline({
  entries,
}: {
  readonly entries: readonly AuditEntry[];
}): React.JSX.Element {
  return (
    <ol className={styles.timeline}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.timelineItem}>
          <span className={styles.timelineDot} aria-hidden="true" />
          <div className={styles.timelineContent}>
            <div className={styles.timelineTop}>
              <span className={styles.timelineField}>{entry.field}</span>
              <time className={styles.timelineTime}>
                {formatTimestamp(entry.changedAt)}
              </time>
            </div>
            <div className={styles.timelineChange}>
              <span className={styles.oldVal}>{entry.oldValue ?? '—'}</span>
              <span className={styles.arrow} aria-label="changed to">
                →
              </span>
              <span className={styles.newVal}>{entry.newValue ?? '—'}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
