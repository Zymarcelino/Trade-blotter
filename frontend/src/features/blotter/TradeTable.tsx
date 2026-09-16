/**
 * <TradeTable /> – the trade blotter grid.
 *
 * This is the feature container for the blotter. It composes TanStack Table for
 * sorting, filtering, and client-side pagination over the *Zustand* trade list
 * (not the React Query cache) so that WebSocket-driven updates appear instantly
 * without a refetch. Responsibilities:
 *
 *  - Kick off the initial load via `useTrades` (loading / error / retry) and
 *    wire live updates via `useTradeSocket`.
 *  - Render `BlotterToolbar` (global + per-column filters, Create button) with
 *    filter/sort state preserved across WS updates.
 *  - Render a semantic `<table>` of `TradeRow`s with sort-direction indicators,
 *    a "no results" empty state, a loading overlay, and a retryable error
 *    banner. During a retry both the overlay and the banner show at once
 *    (Requirement 9.9).
 *  - Flash-highlight rows touched by a live update, never on initial load.
 *  - Paginate 50 rows/page with a "Showing X–Y of Z" summary and
 *    keyboard-accessible Previous/Next controls.
 *
 * Hooks are injectable so tests can drive loading/error/data states without a
 * live network or socket.
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createCoreRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { UseTradesResult } from '../../hooks/useTrades';
import { useTradeStore } from '../../store/trade.store';
import { TradeSide, TradeStatus } from '../../types/trade.types';
import type { Trade } from '../../types/trade.types';
import { TradeRow } from './TradeRow';
import { computeScrollAdjustment } from './scrollPreserve';
import {
  BlotterToolbar,
  type ColumnFilterValues,
  type FilterableColumn,
} from './BlotterToolbar';
import styles from './TradeTable.module.css';

/** Default rows shown per page. */
const DEFAULT_PAGE_SIZE = 50;

/** The static feature set for the blotter table (defined once, module scope). */
const blotterFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  // Register the named filter functions the columns / global filter reference.
  filterFns: {
    equalsString: filterFn_equalsString,
    includesString: filterFn_includesString,
  },
});

/**
 * Column definitions. Defined once at module scope (stable identity) so the
 * table does not rebuild them on every render / WS update. Each column uses a
 * plain `accessorKey`; the visible cells are rendered by `TradeRow`, so the
 * table columns exist purely to power sorting, filtering, and the header row.
 */
const columns: ColumnDef<typeof blotterFeatures, Readonly<Trade>>[] = [
  // Column order: Time, Status, Symbol, Side, Price, Quantity, Book, Counterparty.
  // (Trade ID and Trader columns were removed; the id still exists on the trade
  // object for row keys and action aria-labels, it is simply not shown.)
  // The dropdown-filtered columns use exact string equality (a dropdown picks a
  // single whole value), while the rest rely on the global text filter only.
  { id: 'tradeDate', accessorKey: 'tradeDate', header: 'Time' },
  { id: 'status', accessorKey: 'status', header: 'Status', filterFn: 'equalsString' },
  { id: 'symbol', accessorKey: 'symbol', header: 'Symbol', filterFn: 'equalsString' },
  { id: 'side', accessorKey: 'side', header: 'Side', filterFn: 'equalsString' },
  { id: 'price', accessorKey: 'price', header: 'Price' },
  { id: 'quantity', accessorKey: 'quantity', header: 'Quantity' },
  { id: 'book', accessorKey: 'book', header: 'Book' },
  { id: 'counterparty', accessorKey: 'counterparty', header: 'Counterparty' },
];

/** Formats a notional compactly for the footer, e.g. 76880000 -> "$76.88M". */
function formatCompactNotional(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** Estimated blotter row height (px) for the virtualizer's windowing math. */
const ESTIMATED_ROW_HEIGHT = 33;

/** Number of columns, used for full-width message rows (colSpan). */
const COLUMN_COUNT = columns.length;

/** Props for {@link TradeTable}. Hooks are injectable for testing. */
export interface TradeTableProps {
  /** Called with a trade when its row is activated (opens the audit panel). */
  readonly onRowClick: (trade: Readonly<Trade>) => void;
  /** Opens the create-trade modal (wired by the parent; defaults to a no-op). */
  readonly onCreateClick?: () => void;
  /** Opens the add-random-trades modal (wired by the parent). */
  readonly onAddRandomClick?: () => void;
  /** Opens the amend flow for a trade (inline row action). */
  readonly onAmendClick?: (trade: Readonly<Trade>) => void;
  /** Opens the cancel-confirm flow for a trade (inline row action). */
  readonly onCancelClick?: (trade: Readonly<Trade>) => void;
  /**
   * Loading/error/retry state for the trade list. Supplied by the parent
   * (AppShell owns the app-lifetime `useTrades` query). When omitted, falls
   * back to {@link useTradesHook} (used by tests).
   */
  readonly tradesQuery?: UseTradesResult;
  /**
   * Test-only injection of the trades query hook. In production AppShell owns
   * the query and passes `tradesQuery`, so this defaults to an inert idle hook.
   */
  readonly useTradesHook?: () => UseTradesResult;
  /** Test-only injection of the socket hook; defaults to a no-op (AppShell owns it). */
  readonly useTradeSocketHook?: () => void;
}

/** Inert default trades query (AppShell supplies the real one via `tradesQuery`). */
const inertTradesHook = (): UseTradesResult => ({
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: () => undefined,
});

/** Inert default socket hook (AppShell owns the real WebSocket connection). */
const inertSocketHook = (): void => undefined;

/** An empty per-column filter set. */
const EMPTY_COLUMN_FILTERS: ColumnFilterValues = {
  symbol: '',
  side: '',
  status: '',
};

/** Derives the distinct sorted option list for a string field of the trades. */
function distinctValues(
  trades: readonly Readonly<Trade>[],
  field: keyof Trade,
): string[] {
  const set = new Set<string>();
  for (const trade of trades) {
    set.add(String(trade[field]));
  }
  return [...set].sort();
}

export function TradeTable({
  onRowClick,
  onCreateClick,
  onAddRandomClick,
  onAmendClick,
  onCancelClick,
  tradesQuery,
  useTradesHook = inertTradesHook,
  useTradeSocketHook = inertSocketHook,
}: TradeTableProps): React.JSX.Element {
  // Live trade list (source of truth for what the grid renders).
  const trades = useTradeStore((s) => s.trades);

  // Stream pacing dials (surfaced in the toolbar, applied by useTradeSocket).
  const streamMaxPerTick = useTradeStore((s) => s.streamMaxPerTick);
  const streamIntervalMs = useTradeStore((s) => s.streamIntervalMs);
  const setStreamMaxPerTick = useTradeStore((s) => s.setStreamMaxPerTick);
  const setStreamIntervalMs = useTradeStore((s) => s.setStreamIntervalMs);
  const streamPaused = useTradeStore((s) => s.streamPaused);
  const setStreamPaused = useTradeStore((s) => s.setStreamPaused);

  // The trades query is owned by AppShell (app-lifetime) and passed in; the
  // injected hook path remains for tests. The socket is also owned by AppShell,
  // so the default here is a no-op - switching tabs never disconnects the feed
  // nor refetches over the streamed store.
  const injectedQuery = useTradesHook();
  useTradeSocketHook();
  const { isLoading, isFetching, isError, refetch } =
    tradesQuery ?? injectedQuery;

  // --- Filter / sort / pagination state (preserved across WS updates) -------
  const [sorting, setSorting] = useState<SortingState>([]);
  // Time-order direction for the blotter's primary sort. Defaults to 'desc'
  // (newest trade first) so a page refresh always shows the latest data at the
  // top. The user can flip it to 'asc' (oldest first) via the toolbar toggle.
  const [timeSortDir, setTimeSortDir] = useState<'desc' | 'asc'>('desc');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilterValues, setColumnFilterValues] =
    useState<ColumnFilterValues>(EMPTY_COLUMN_FILTERS);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // Baseline ordering: newest trade first (by tradeDate desc). This is the
  // default view a blotter must have - freshly created trades (which carry a
  // server tradeDate of "now", later than every seeded date) surface at the
  // top immediately via the WebSocket store update, no user action needed.
  // A user column-sort layers on top of this order via the sorted row model.
  const sortedTrades = useMemo<Readonly<Trade>[]>(() => {
    const factor = timeSortDir === 'desc' ? 1 : -1;
    return [...trades].sort((a, b) => {
      // Primary sort by tradeDate in the chosen direction; the factor flips the
      // comparison so 'desc' = newest first (default) and 'asc' = oldest first.
      if (a.tradeDate < b.tradeDate) return 1 * factor;
      if (a.tradeDate > b.tradeDate) return -1 * factor;
      // Tie-break on id in the same direction so ordering is stable.
      return (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) * factor;
    });
  }, [trades, timeSortDir]);

  // --- Stream freeze while the user is not at the top (Requirement 22.8) ----
  // Newest-first means new trades insert at the TOP. If we re-flowed the
  // rendered order on every incoming batch, rows would shift under the pointer
  // (misclicks) and the viewport would jump. So while the user is scrolled away
  // from the top we render a FROZEN snapshot of the order; new trades still land
  // in the store (footer/stats/positions stay live) but the visible rows hold
  // steady. When the user returns to the top the view re-syncs to live order.
  const [isAtTop, setIsAtTop] = useState(true);
  const frozenTradesRef = useRef<Readonly<Trade>[]>(sortedTrades);

  // Track whether the scroll container is at (or very near) the top.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return undefined;
    }
    const onScroll = (): void => {
      setIsAtTop(el.scrollTop <= 4);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // The order actually rendered: live newest-first when at the top, otherwise
  // the frozen snapshot. The snapshot is refreshed whenever we are at the top.
  const displayTrades = useMemo<Readonly<Trade>[]>(() => {
    if (isAtTop) {
      frozenTradesRef.current = sortedTrades;
      return sortedTrades;
    }
    // While scrolled away, keep any already-present trades in their frozen
    // positions; brand-new trades are held out of the view until the user
    // returns to the top (they are already in the store for totals/stats).
    return frozenTradesRef.current;
  }, [isAtTop, sortedTrades]);

  // Map the friendly per-column filter values into TanStack's column-filter
  // shape, dropping empty ("All") selections.
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    return (Object.keys(columnFilterValues) as FilterableColumn[])
      .filter((key) => columnFilterValues[key] !== '')
      .map((key) => ({ id: key, value: columnFilterValues[key] }));
  }, [columnFilterValues]);

  const table = useTable({
    features: blotterFeatures,
    columns,
    data: displayTrades,
    getRowId: (row) => row.id,
    globalFilterFn: 'includesString',
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
  });

  // Dropdown option lists, derived from the full (unfiltered) trade list.
  const filterOptions = useMemo(
    () => ({
      symbols: distinctValues(trades, 'symbol'),
      sides: distinctValues(trades, 'side'),
      statuses: distinctValues(trades, 'status'),
    }),
    [trades],
  );

  const handleColumnFilterChange = (
    column: FilterableColumn,
    value: string,
  ): void => {
    setColumnFilterValues((prev) => ({ ...prev, [column]: value }));
    // Any filter change resets to the first page so the user sees matches.
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const handleGlobalFilterChange = (value: string): void => {
    setGlobalFilter(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  // Clear all per-column filters and return to the first page.
  const handleClearFilters = (): void => {
    setColumnFilterValues(EMPTY_COLUMN_FILTERS);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  // Header stats derived from the full (unfiltered) trade set. Active trades
  // drive both the active count and the notional (price x quantity) total.
  const stats = useMemo(() => {
    let activeCount = 0;
    let totalNotional = 0;
    let buyNotional = 0;
    let sellNotional = 0;
    for (const trade of trades) {
      if (trade.status !== TradeStatus.CANCELLED) {
        activeCount += 1;
        const notional = trade.price * trade.quantity;
        totalNotional += notional;
        if (trade.side === TradeSide.BUY) {
          buyNotional += notional;
        } else {
          sellNotional += notional;
        }
      }
    }
    return {
      activeCount,
      totalCount: trades.length,
      totalNotional,
      buyNotional,
      sellNotional,
    };
  }, [trades]);
  // Pagination summary numbers.
  const filteredCount = table.getFilteredRowModel().rows.length;

  // Changing the page size re-slices the already-loaded dataset client-side (no
  // API call). The current page index is clamped to the last valid page so the
  // grid never lands on an empty page (Requirements 18.3, 18.5).
  const handlePageSizeChange = (nextPageSize: number): void => {
    const lastPageIndex = Math.max(0, Math.ceil(filteredCount / nextPageSize) - 1);
    setPagination((prev) => ({
      pageSize: nextPageSize,
      pageIndex: Math.min(prev.pageIndex, lastPageIndex),
    }));
  };
  const pageRows = table.getPaginatedRowModel().rows;

  // --- Row virtualization (Requirement 22) --------------------------------
  // Windowed rendering over the CURRENT PAGE of the FILTERED + SORTED row model
  // (`pageRows`). Because pageRows is produced after filters, global filter, and
  // sort are applied, the virtualizer always windows over matching rows in the
  // correct order — filtering/sorting drive exactly what is scrolled. Only the
  // rows near the viewport are mounted, so the DOM stays bounded even at the
  // largest page size or with tens of thousands of trades loaded.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
    // A sensible initial viewport so the first paint (and test environments
    // without a layout engine) render a usable window; the real measured
    // element size replaces this once the browser lays the container out.
    initialRect: { width: 1200, height: 720 },
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  // Spacer heights that preserve the full scroll height while only the windowed
  // rows are in the DOM (padding-row technique for a semantic <table>).
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  // --- Scroll-position preservation under live prepends (Requirement 22.8) --
  // New trades are newest-first, so they insert at the TOP: the total content
  // height grows and everything below shifts down. Without compensation the
  // viewport would appear to jump. Before each render we remember the scroll
  // container's height; in a layout effect (after the DOM reflects the new
  // size, before paint) we add the height GROWTH back onto scrollTop so the
  // rows the user is reading stay visually fixed. We never pin to top/bottom
  // and never auto-scroll - the user can scroll anywhere freely mid-stream.
  const prevScrollHeightRef = useRef(0);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    const prev = prevScrollHeightRef.current;
    const next = el.scrollHeight;
    // Pure rule: shift by the height growth only when the user has scrolled
    // away from the top; otherwise leave the view as-is (no pin, no auto-scroll).
    el.scrollTop = computeScrollAdjustment(prev, next, el.scrollTop);
    prevScrollHeightRef.current = next;
    // Re-run whenever the rendered content changes (live prepend, sort, filter,
    // page change), not merely when the virtual height changes. Under pagination
    // the page height is constant, so keying on totalSize alone would miss the
    // prepend that shifts the rows the user is viewing.
  }, [totalSize, pageRows.length, pageRows[0]?.id, trades.length]);
  const firstRowNumber =
    filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRowNumber = pagination.pageIndex * pagination.pageSize + pageRows.length;

  return (
    <section className={styles.blotter} aria-label="Trade blotter">
      <BlotterToolbar
        globalFilter={globalFilter}
        onGlobalFilterChange={handleGlobalFilterChange}
        columnFilters={columnFilterValues}
        onColumnFilterChange={handleColumnFilterChange}
        onClearFilters={handleClearFilters}
        timeSortDir={timeSortDir}
        onToggleTimeSort={() =>
          setTimeSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
        }
        onCreateClick={onCreateClick ?? (() => undefined)}
        onAddRandomClick={onAddRandomClick ?? (() => undefined)}
        options={filterOptions}
        pageSize={pagination.pageSize}
        onPageSizeChange={handlePageSizeChange}
        streamMaxPerTick={streamMaxPerTick}
        onStreamMaxPerTickChange={setStreamMaxPerTick}
        streamIntervalMs={streamIntervalMs}
        onStreamIntervalChange={setStreamIntervalMs}
        streamPaused={streamPaused}
        onStreamPausedToggle={() => setStreamPaused(!streamPaused)}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      {isError && (
        <div className={styles.errorBanner} role="alert">
          <span>Unable to load trades.</span>
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      <div
        className={styles.tableWrapper}
        ref={scrollContainerRef}
        data-virtual-scroll
      >
        {isLoading && (
          <div className={styles.loadingOverlay} role="status" aria-live="polite">
            <span>Loading trades…</span>
          </div>
        )}

        <table className={styles.table} aria-busy={isLoading}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted();
                  const indicator =
                    sortDirection === 'asc'
                      ? ' ↑'
                      : sortDirection === 'desc'
                        ? ' ↓'
                        : '';
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sortDirection === 'asc'
                          ? 'ascending'
                          : sortDirection === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {String(header.column.columnDef.header)}
                        {indicator}
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className={styles.actionsHeader}>
                  Actions
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT + 1} className={styles.emptyState}>
                  No trades match the current filters.
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={COLUMN_COUNT + 1}
                      style={{ height: paddingTop, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = pageRows[virtualRow.index];
                  return (
                    <TradeRow
                      key={row.id}
                      trade={row.original}
                      onRowClick={onRowClick}
                      onAmend={onAmendClick ?? (() => undefined)}
                      onCancel={onCancelClick ?? (() => undefined)}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={COLUMN_COUNT + 1}
                      style={{ height: paddingBottom, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.stickyBottom}>
        <div className={styles.pagination}>
          <span aria-live="polite">
            Showing {firstRowNumber}–{lastRowNumber} of {filteredCount}
          </span>
          <div className={styles.pageControls}>
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </button>
          </div>
        </div>

        <div className={styles.footer} aria-label="Trade totals">
        <span className={styles.footerShowing}>
          {stats.totalCount} trades {'\u00B7'} {stats.activeCount} active
        </span>
        <span className={styles.footerGroup}>
          <span className={styles.footerBuy}>
            {'\u25B2'} Buy {formatCompactNotional(stats.buyNotional)}
          </span>
          <span className={styles.footerSell}>
            {'\u25BC'} Sell {formatCompactNotional(stats.sellNotional)}
          </span>
          <span className={styles.footerNet}>
            Net {formatCompactNotional(stats.buyNotional - stats.sellNotional)}
          </span>
        </span>
        </div>
      </div>
    </section>
  );
}
