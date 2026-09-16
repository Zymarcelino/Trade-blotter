/**
 * <AuditView /> — the global audit event feed (newest first).
 *
 * The Audit Trail tab renders this in-flow labelled region (not a drawer). It
 * shows every recorded field change across all trades, formatting timestamps as
 * human-readable local time. Handles loading / data / empty / error, with a
 * retryable error state and an explicit empty message.
 *
 * _Requirements: 7.4, 13.4_
 */

import { useAuditFeed } from '../../hooks/useAuditFeed';
import { formatTimestamp } from '../../utils/formatters';
import { resolveErrorMessage } from '../../utils/errorMessages';
import styles from './AuditView.module.css';

export function AuditView(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useAuditFeed(true);

  return (
    <section className={styles.view} aria-label="Audit Trail">
      <header className={styles.header}>
        <h2 className={styles.title}>Audit Trail</h2>
        <span className={styles.subtitle}>Global change feed, newest first</span>
      </header>

      {isError && (
        <div className={styles.errorBanner} role="alert">
          <span>{resolveErrorMessage(error?.code ?? 'INTERNAL_ERROR')}</span>
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.body} aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <p className={styles.status} role="status">
            Loading audit trail...
          </p>
        ) : !data || data.length === 0 ? (
          <p className={styles.empty}>No amendments recorded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Trade</th>
                <th scope="col">Field</th>
                <th scope="col">Old Value</th>
                <th scope="col">New Value</th>
                <th scope="col">Changed At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <tr key={entry.id}>
                  <td className={styles.tradeId}>{entry.tradeId}</td>
                  <td>{entry.field}</td>
                  <td>{entry.oldValue ?? '\u2014'}</td>
                  <td>{entry.newValue ?? '\u2014'}</td>
                  <td>{formatTimestamp(entry.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
