/**
 * <App /> — the composition root and shell of the trade blotter SPA.
 *
 * Responsibilities:
 *  - Wrap the whole tree in an {@link ErrorBoundary} and a
 *    {@link QueryClientProvider} (a QueryClient may be injected for tests).
 *  - Own the app-lifetime concerns: the live WebSocket via {@link useTradeSocket}
 *    and the initial trade load via {@link useTrades}. Both live here (not inside
 *    a tab) so switching tabs never disconnects the feed or refetches.
 *  - Render the top bar (title + live connection dot + desk stats + live price
 *    ticker + New Trade), the view switcher tabs (Blotter | Positions / P&L |
 *    Audit Trail), and the always-mounted toast stack. The connection state is
 *    folded into the top-bar status dot (colour AND text) rather than a
 *    full-width banner; the {@link ConnectionStatusBanner} component is retained
 *    but no longer rendered here.
 *  - Coordinate the create/amend/cancel modals and the audit side panel.
 *
 * The socket and the trades query are hosted in an inner AppShell so they mount
 * once under the provider and persist across tab switches.
 *
 * _Requirements: 14.3, 8.6_
 */

import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { TradeTable } from './features/blotter/TradeTable';
import { CancelConfirmDialog } from './features/blotter/CancelConfirmDialog';
import { CreateTradeModal } from './features/forms/CreateTradeModal';
import { AmendTradeModal } from './features/forms/AmendTradeModal';
import { AddRandomTradesModal } from './features/forms/AddRandomTradesModal';
import { AuditHistoryPanel } from './features/audit/AuditHistoryPanel';
import { AuditView } from './features/audit/AuditView';
import { PositionsView } from './features/analytics/PositionsView';
import { useTrades } from './hooks/useTrades';
import { useCancelTrade } from './hooks/useCancelTrade';
import { useTradeSocket } from './hooks/useTradeSocket';
import { useTradeStore } from './store/trade.store';
import { TradeStatus } from './types/trade.types';
import type { Trade } from './types/trade.types';
import styles from './App.module.css';

/** The selectable top-level views. */
const View = {
  BLOTTER: 'BLOTTER',
  POSITIONS_PNL: 'POSITIONS_PNL',
  AUDIT: 'AUDIT',
} as const;
type View = (typeof View)[keyof typeof View];

/** Props for {@link App}. */
export interface AppProps {
  /** Optional injected QueryClient (tests supply a retry-free client). */
  readonly queryClient?: QueryClient;
}

export default function App({ queryClient }: AppProps = {}): React.JSX.Element {
  // A stable default client for production; tests inject their own.
  const client = useMemo(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    [queryClient],
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <AppShell />
        <ToastContainer />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

/**
 * The socket/query host + view switcher. Kept as a child of the provider so the
 * WebSocket and the trades query mount once and survive tab changes.
 */
function AppShell(): React.JSX.Element {
  // App-lifetime concerns: live feed + initial load. Owned here, never per-tab.
  useTradeSocket();
  const tradesQuery = useTrades();

  const trades = useTradeStore((s) => s.trades);
  const isConnected = useTradeStore((s) => s.isConnected);
  const marketPrices = useTradeStore((s) => s.marketPrices);

  const [view, setView] = useState<View>(View.BLOTTER);

  // Modal / panel selection state.
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isRandomOpen, setRandomOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<Readonly<Trade> | null>(null);
  const [auditTarget, setAuditTarget] = useState<Readonly<Trade> | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Readonly<Trade> | null>(null);

  const cancelMutation = useCancelTrade({
    onSuccess: () => setCancelTarget(null),
  });

  // Desk stats for the top bar, derived from the live store. Active trades
  // (status !== CANCELLED) drive both the active count and the notional total
  // (sum of price * quantity over active trades).
  const stats = useMemo(() => {
    let active = 0;
    let notional = 0;
    for (const trade of trades) {
      if (trade.status !== TradeStatus.CANCELLED) {
        active += 1;
        notional += trade.price * trade.quantity;
      }
    }
    return { total: trades.length, active, notional };
  }, [trades]);

  // Up to 8 live prices for the top-bar ticker (order follows the store map).
  const tickerPrices = useMemo(
    () => Object.entries(marketPrices).slice(0, 8),
    [marketPrices],
  );

  const tabs: ReadonlyArray<{ readonly id: View; readonly label: string }> = [
    { id: View.BLOTTER, label: 'Blotter' },
    { id: View.POSITIONS_PNL, label: 'Positions / P&L' },
    { id: View.AUDIT, label: 'Audit Trail' },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          {/* Connection state: colour AND text so colour is never the only cue. */}
          <span
            className={`${styles.statusDot} ${
              isConnected ? styles.statusDotLive : styles.statusDotDown
            }`}
            aria-hidden="true"
          />
          <h1 className={styles.title}>Trade Blotter</h1>
          <span
            className={`${styles.connBadge} ${
              isConnected ? styles.connBadgeLive : styles.connBadgeDown
            }`}
            role="status"
            aria-live="polite"
          >
            {isConnected ? 'LIVE' : 'Disconnected'}
          </span>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.stats}>
          <span className={styles.stat}>
            <span className={styles.statLabel}>Active</span>
            <span className={styles.statValueActive}>{stats.active}</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statLabel}>Total</span>
            <span className={styles.statValue}>{stats.total}</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statLabel}>Notional</span>
            <span className={styles.statValueNotional}>
              ${(stats.notional / 1_000_000).toFixed(1)}M
            </span>
          </span>
        </div>

        <div className={styles.ticker} aria-label="Live prices">
          {tickerPrices.map(([symbol, price]) => (
            <span key={symbol} className={styles.tickerItem}>
              <span className={styles.tickerSymbol}>{symbol}</span>
              <span className={styles.tickerPrice}>{price.toFixed(2)}</span>
            </span>
          ))}
        </div>

        <button
          type="button"
          className={styles.newTradeButton}
          onClick={() => setCreateOpen(true)}
        >
          + New Trade
        </button>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            className={
              view === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className={styles.main}>
        {view === View.BLOTTER && (
          <TradeTable
            tradesQuery={tradesQuery}
            onRowClick={(trade) => setAuditTarget(trade)}
            onCreateClick={() => setCreateOpen(true)}
            onAddRandomClick={() => setRandomOpen(true)}
            onAmendClick={(trade) => setAmendTarget(trade)}
            onCancelClick={(trade) => setCancelTarget(trade)}
          />
        )}
        {view === View.POSITIONS_PNL && <PositionsView />}
        {view === View.AUDIT && <AuditView />}
      </main>

      <CreateTradeModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
      />
      <AddRandomTradesModal
        isOpen={isRandomOpen}
        onClose={() => setRandomOpen(false)}
      />
      <AmendTradeModal
        isOpen={amendTarget !== null}
        onClose={() => setAmendTarget(null)}
        trade={amendTarget}
      />
      <CancelConfirmDialog
        tradeId={cancelTarget?.id ?? null}
        onKeep={() => setCancelTarget(null)}
        onConfirm={(id) => cancelMutation.submit(id)}
        isPending={cancelMutation.isPending}
      />
      {auditTarget && (
        <AuditHistoryPanel
          trade={auditTarget}
          isOpen={auditTarget !== null}
          onClose={() => setAuditTarget(null)}
        />
      )}
    </div>
  );
}
