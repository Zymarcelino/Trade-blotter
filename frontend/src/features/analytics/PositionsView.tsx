/**
 * <PositionsView /> — the combined real-time Positions / P&L analytics view.
 *
 * Fetches net-position aggregates and notional P&L from the server and marks
 * positions to market using the latest simulated prices streamed into the
 * store. Because there is no real market feed, prices are simulated on the
 * backend and pushed via PRICE_TICK; this is surfaced with a visible
 * "simulated prices" marker so the numbers are never mistaken for real MTM.
 *
 * Renders as a labelled region with a semantic table. Handles the four async
 * surfaces (loading / data / empty / error) with a retryable error state.
 *
 * _Requirements: analytics view (positions + mark-to-market P&L)_
 */

import { useMemo } from 'react';

import { usePositions } from '../../hooks/usePositions';
import { usePnl } from '../../hooks/usePnl';
import { formatCurrency } from '../../utils/formatters';
import { resolveErrorMessage } from '../../utils/errorMessages';
import type { PnlSummary } from '../../types/trade.types';
import styles from './PositionsView.module.css';

/** Formats a signed currency value with a leading sign for clarity. */
function formatSigned(value: number | null): string {
  if (value === null) {
    return '\u2014';
  }
  const sign = value < 0 ? '-' : '';
  return `${sign}$${formatCurrency(Math.abs(value))}`;
}

export function PositionsView(): React.JSX.Element {
  const positions = usePositions(true);
  const pnl = usePnl(true);

  const isLoading = positions.isLoading || pnl.isLoading;
  const isError = positions.isError || pnl.isError;
  const errorCode =
    positions.error?.code ?? pnl.error?.code ?? 'INTERNAL_ERROR';

  // Index P&L by symbol so each position row can show its realised P&L.
  const pnlBySymbol = useMemo(() => {
    const map = new Map<string, PnlSummary>();
    for (const row of pnl.pnl) {
      map.set(row.symbol, row);
    }
    return map;
  }, [pnl.pnl]);

  const retry = (): void => {
    positions.refetch();
    pnl.refetch();
  };

  return (
    <section
      className={styles.view}
      aria-label="Positions and P&L"
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Positions / P&amp;L</h2>
        <span className={styles.simulated} title="Prices are simulated, not a live market feed">
          <span className={styles.dot} aria-hidden="true" /> Simulated prices
        </span>
      </header>

      {isError && (
        <div className={styles.errorBanner} role="alert">
          <span>{resolveErrorMessage(errorCode)}</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.tableWrapper} aria-busy={isLoading}>
        {isLoading && (
          <div className={styles.loading} role="status" aria-live="polite">
            Loading positions...
          </div>
        )}
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Net Qty</th>
              <th scope="col">Buy Qty</th>
              <th scope="col">Sell Qty</th>
              <th scope="col">Mkt Price</th>
              <th scope="col">Market Value</th>
              <th scope="col">Realised P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.positions.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  No positions to display.
                </td>
              </tr>
            ) : (
              positions.positions.map((position) => {
                const pnlRow = pnlBySymbol.get(position.symbol);
                return (
                  <tr key={position.symbol}>
                    <td className={styles.symbol}>{position.symbol}</td>
                    <td>{position.netQuantity.toLocaleString()}</td>
                    <td>{position.buyQuantity.toLocaleString()}</td>
                    <td>{position.sellQuantity.toLocaleString()}</td>
                    <td>
                      {position.marketPrice === null
                        ? '\u2014'
                        : `$${formatCurrency(position.marketPrice)}`}
                    </td>
                    <td>{formatSigned(position.marketValue)}</td>
                    <td
                      className={
                        pnlRow && pnlRow.realizedPnl < 0
                          ? styles.negative
                          : styles.positive
                      }
                    >
                      {formatSigned(pnlRow ? pnlRow.realizedPnl : null)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
