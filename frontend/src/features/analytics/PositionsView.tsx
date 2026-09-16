/**
 * <PositionsView /> - the real-time Positions / P&L analytics view.
 *
 * Derives net positions and mark-to-market P&L entirely from the LIVE store via
 * {@link usePositions}, so the numbers recompute as trades stream in and as the
 * simulated prices tick - no refetch. Prices are simulated (VWAP-seeded with a
 * small drift), surfaced with a visible "simulated prices" marker so the P&L is
 * never mistaken for a real market feed.
 *
 * Renders a labelled region: a three-cell P&L summary bar (Total / Unrealised /
 * Realised) plus a semantic per-symbol table, with an explicit empty state.
 *
 * _Requirements: analytics view (positions + mark-to-market P&L)_
 */

import { usePositions } from '../../hooks/usePositions';
import styles from './PositionsView.module.css';

/** Formats a signed USD amount with a leading +/- and thousands separators. */
function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${abs}`;
}

/** Formats a plain number to 2 dp with thousands separators. */
function formatNum(value: number, dp = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Chooses the P&L colour class from the sign of the value. */
function pnlClass(value: number): string {
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.flat;
}

export function PositionsView(): React.JSX.Element {
  const { positions } = usePositions();

  const totalPnl = positions.reduce((s, p) => s + p.totalPnl, 0);
  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const totalRealised = positions.reduce((s, p) => s + p.realisedPnl, 0);

  const summary: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
    { label: 'Total P&L', value: totalPnl },
    { label: 'Unrealised P&L', value: totalUnrealised },
    { label: 'Realised P&L', value: totalRealised },
  ];

  return (
    <section className={styles.view} aria-label="Positions and P&L">
      <header className={styles.header}>
        <h2 className={styles.title}>Positions / P&amp;L</h2>
        <span
          className={styles.simulated}
          title="Prices are simulated, not a live market feed"
        >
          <span className={styles.dot} aria-hidden="true" /> Simulated prices
        </span>
      </header>

      <div className={styles.summaryBar}>
        {summary.map((item) => (
          <div key={item.label} className={styles.summaryCell}>
            <div className={styles.summaryLabel}>{item.label}</div>
            <div className={`${styles.summaryValue} ${pnlClass(item.value)}`}>
              {formatSignedCurrency(item.value)}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.left}>Symbol</th>
              <th scope="col">Net Qty</th>
              <th scope="col">Avg Price</th>
              <th scope="col">Mkt Price</th>
              <th scope="col">Unrealised P&amp;L</th>
              <th scope="col">Realised P&amp;L</th>
              <th scope="col">Total P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  No active positions.
                </td>
              </tr>
            ) : (
              positions.map((pos) => (
                <tr key={pos.symbol}>
                  <td className={`${styles.left} ${styles.symbol}`}>{pos.symbol}</td>
                  <td className={pos.netQty >= 0 ? styles.positive : styles.negative}>
                    {pos.netQty > 0 ? '+' : ''}
                    {formatNum(pos.netQty, 0)}
                  </td>
                  <td className={styles.muted}>{formatNum(pos.avgPrice)}</td>
                  <td>{formatNum(pos.marketPrice)}</td>
                  <td className={pnlClass(pos.unrealisedPnl)}>
                    {formatSignedCurrency(pos.unrealisedPnl)}
                  </td>
                  <td className={pnlClass(pos.realisedPnl)}>
                    {formatSignedCurrency(pos.realisedPnl)}
                  </td>
                  <td className={pnlClass(pos.totalPnl)}>
                    {formatSignedCurrency(pos.totalPnl)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
