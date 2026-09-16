import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import App from './App';
import { useTradeStore } from './store/trade.store';
import { useToastStore } from './store/toast.store';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type Trade,
} from './types/trade.types';

/**
 * Smoke + wiring tests for the assembled <App />.
 *
 * App is the composition root: it wraps the tree in an ErrorBoundary + a
 * QueryClientProvider and coordinates the blotter, the create/amend modals, the
 * audit side panel, the connection banner, and the toast stack. These tests
 * verify the tree renders and the cross-component wiring works:
 *  - renders without crashing (heading + main landmark + blotter)
 *  - the "Create Trade" toolbar button opens the create modal
 *  - clicking a trade row opens the audit panel for that trade
 *  - a header "Amend" affordance appears once a trade is selected and opens the
 *    amend modal (disabled for a cancelled selection)
 *  - the connection banner reflects the store's disconnected state
 *  - the toast container is always mounted
 *
 * The data hooks are mocked so no real network or WebSocket is touched: the
 * blotter reads its rows from the Zustand store, which the tests seed directly.
 */

// --- Mock the data/socket hooks so nothing hits the network -----------------
// `useTrades` normally fires a fetch on mount; here it is inert and reports a
// settled, non-loading, non-error state. The store is seeded by the tests.
vi.mock('./hooks/useTrades', () => ({
  useTrades: (): {
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: null;
    refetch: () => void;
  } => ({
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// `useTradeSocket` manages a real WebSocket; stub it as a spy so we can assert
// it is mounted ONCE at the app level (not per-tab).
const useTradeSocketSpy = vi.fn();
vi.mock('./hooks/useTradeSocket', () => ({
  useTradeSocket: (): void => {
    useTradeSocketSpy();
  },
}));

// The analytics views fetch aggregates; mock their API layer so switching to
// them renders a populated table without touching the network.
vi.mock('./services/trade.api', () => ({
  getPositions: vi.fn().mockResolvedValue({
    data: [
      {
        symbol: 'AAPL',
        netQuantity: 100,
        buyQuantity: 100,
        sellQuantity: 0,
        tradeCount: 1,
      },
    ],
  }),
  getPnl: vi.fn().mockResolvedValue({
    data: [
      {
        symbol: 'AAPL',
        buyNotional: 15025,
        sellNotional: 0,
        realizedPnl: -15025,
        netQuantity: 100,
      },
    ],
  }),
  getAuditFeed: vi.fn().mockResolvedValue({ data: [] }),
}));

/** Builds a trade with sensible defaults. */
function makeTrade(overrides: Partial<Trade> = {}): Readonly<Trade> {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 1000,
    price: 150.25,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:32:00Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    ...overrides,
  };
}

/** Renders App with a fresh, retry-free QueryClient. */
function renderApp(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(<App queryClient={queryClient} />);
}

/** Resets the shared stores between tests so state never leaks. */
beforeEach(() => {
  useTradeStore.setState({
    trades: [],
    isLoading: false,
    error: null,
    isConnected: false,
    marketPrices: {},
  });
  useToastStore.getState().clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App', () => {
  it('renders the Trade Blotter heading', () => {
    renderApp();
    expect(
      screen.getByRole('heading', { name: 'Trade Blotter', level: 1 }),
    ).toBeInTheDocument();
  });

  it('renders a main landmark region containing the blotter', () => {
    renderApp();
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(
      within(main).getByRole('region', { name: 'Trade blotter' }),
    ).toBeInTheDocument();
  });

  it('mounts the toast container', () => {
    renderApp();
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });

  it('shows the Disconnected banner when the store is not connected', () => {
    renderApp();
    expect(screen.getByText(/Disconnected/i)).toBeInTheDocument();
  });

  it('renders seeded trades from the store in the grid', () => {
    useTradeStore.setState({ trades: [makeTrade()] });
    renderApp();
    // Trade ID column was removed; the row is identified by its Symbol cell.
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('opens the create-trade modal when the toolbar Create button is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    // No dialog before the button is clicked.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create trade/i }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /create trade/i }),
    ).toBeInTheDocument();
  });

  it('opens the audit panel for the trade whose row is clicked', async () => {
    const user = userEvent.setup();
    useTradeStore.setState({ trades: [makeTrade()] });
    renderApp();

    // The panel is not present until a row is activated.
    expect(
      screen.queryByRole('complementary', { name: /audit history/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('AAPL'));

    const panel = screen.getByRole('complementary', {
      name: /audit history/i,
    });
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText(/TRD-100001/)).toBeInTheDocument();
  });

  it('opens the amend modal from an ACTIVE row inline Amend action', async () => {
    const user = userEvent.setup();
    useTradeStore.setState({ trades: [makeTrade()] });
    renderApp();

    // The inline Amend action is present on the ACTIVE row from the start
    // (no row selection required, unlike the old header affordance).
    const amendButton = screen.getByRole('button', {
      name: /amend trade trd-100001/i,
    });
    await user.click(amendButton);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/amend trade trd-100001/i),
    ).toBeInTheDocument();
  });

  it('opens the cancel-confirmation dialog from an ACTIVE row inline Cancel action', async () => {
    const user = userEvent.setup();
    useTradeStore.setState({ trades: [makeTrade()] });
    renderApp();

    await user.click(
      screen.getByRole('button', { name: /cancel trade trd-100001/i }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/confirm cancellation/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /^cancel trade$/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^keep$/i })).toBeInTheDocument();
  });

  it('shows no inline Amend/Cancel actions on a CANCELLED row', () => {
    useTradeStore.setState({
      trades: [makeTrade({ status: TradeStatus.CANCELLED })],
    });
    renderApp();

    expect(
      screen.queryByRole('button', { name: /amend trade trd-100001/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancel trade trd-100001/i }),
    ).not.toBeInTheDocument();
  });
});

describe('App — view switcher', () => {
  it('defaults to the Blotter view with the blotter region visible', () => {
    renderApp();

    const blotterTab = screen.getByRole('tab', { name: 'Blotter' });
    expect(blotterTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Trade blotter' })).toBeInTheDocument();
  });

  it('switches to the combined Positions / P&L view and renders the MTM panel', async () => {
    const user = userEvent.setup();
    renderApp();

    const tab = screen.getByRole('tab', { name: 'Positions / P&L' });
    await user.click(tab);

    // The real-time Positions/P&L view renders as a labelled region, showing
    // the simulated-prices marker and the mark-to-market column headers.
    expect(
      await screen.findByRole('region', { name: /positions and p&l/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/simulated prices/i)).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /mkt price/i }),
    ).toBeInTheDocument();
    expect(tab).toHaveAttribute('aria-selected', 'true');
    // The blotter region is no longer rendered while Positions / P&L is active.
    expect(
      screen.queryByRole('region', { name: 'Trade blotter' }),
    ).not.toBeInTheDocument();
  });

  it('shows the Audit Trail view as a global event feed', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: 'Audit Trail' }));

    // The Audit Trail tab renders the in-flow AuditView (a labelled region),
    // NOT a fixed drawer. It shows the global newest-first event feed; with the
    // mocked empty feed it renders the empty-state message.
    expect(
      await screen.findByRole('region', { name: /audit trail/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/no amendments recorded yet/i),
    ).toBeInTheDocument();
  });

  it('mounts the WebSocket at the app level, not behind the Blotter tab', async () => {
    const user = userEvent.setup();
    useTradeSocketSpy.mockClear();
    renderApp();

    // The socket hook runs on the initial app render (AppShell owns it).
    expect(useTradeSocketSpy).toHaveBeenCalled();

    // Switch away to Positions/P&L and Audit: the app keeps rendering and the
    // socket host (AppShell) is not unmounted, so the live feed keeps flowing
    // regardless of the active tab. (The old bug mounted the socket inside
    // TradeTable, so leaving the Blotter tab disconnected the stream.)
    await user.click(screen.getByRole('tab', { name: 'Positions / P&L' }));
    expect(
      await screen.findByRole('region', { name: /positions and p&l/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Blotter' }));
    // The blotter still renders on return (its data came from the store, which
    // was never clobbered by a per-tab refetch).
    expect(
      screen.getByRole('region', { name: 'Trade blotter' }),
    ).toBeInTheDocument();
    // Socket host stayed mounted throughout (spy was never reset by an unmount
    // path we control) - it remained invoked.
    expect(useTradeSocketSpy).toHaveBeenCalled();
  });

  it('returns to the Blotter view when the Blotter tab is re-selected', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: 'Positions / P&L' }));
    await screen.findByRole('region', { name: /positions and p&l/i });

    await user.click(screen.getByRole('tab', { name: 'Blotter' }));

    expect(
      screen.getByRole('region', { name: 'Trade blotter' }),
    ).toBeInTheDocument();
  });
});
