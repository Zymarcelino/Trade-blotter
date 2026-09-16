/**
 * <BlotterToolbar /> - stats, filtering, and actions above the trade grid.
 *
 * A controlled component: the parent (`TradeTable`) owns the canonical filter
 * and page-size state and supplies the derived header stats; the toolbar
 * surfaces values and reports changes back up. It holds no filtering or
 * aggregation logic of its own.
 *
 * Layout (reference-aligned, compact density):
 *  - A single control row: a left-aligned "{filtered} / {total}" row count, the
 *    debounced global search, a Filter toggle showing the active-filter count,
 *    the Newest/Oldest time-order toggle, and a Refresh affordance. The rest of
 *    the controls (page-size selector, stream-pacing dials, Pause, Create Trade,
 *    Add Random Trades) are tucked to the right and wrap to a second line on
 *    narrow widths. No control is removed and none change their wiring.
 *  - A collapsible inline filter bar (NOT a drawer) with the per-column
 *    dropdowns and a Clear control; hidden by default.
 *
 * Every control has an associated `<label>` for accessibility.
 *
 * _Requirements: 9.3, 18.2, 19.5, 19.6, 19.7, 19.8_
 */

import { useEffect, useRef, useState } from 'react';

import styles from './BlotterToolbar.module.css';

/** Slider bounds for the stream rate cap (rows applied per drain tick). */
const STREAM_RATE_MIN = 10;
const STREAM_RATE_MAX = 500;
const STREAM_RATE_STEP = 10;

/** Slider bounds for the drain interval (ms). */
const STREAM_INTERVAL_MIN = 250;
const STREAM_INTERVAL_MAX = 5000;
const STREAM_INTERVAL_STEP = 250;

/**
 * Debounce window for the global text filter (ms). Filtering runs client-side
 * over the whole in-memory trade set (which can be very large, up to the store
 * cap), so we only re-run the filter/sort pass once the user pauses typing -
 * the input value itself updates instantly via a local mirror, so typing never
 * feels blocked. 400ms keeps large-dataset filtering smooth without feeling laggy.
 */
const GLOBAL_FILTER_DEBOUNCE_MS = 400;

/** Page-size options offered by the blotter (rows per page). */
export const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const;

/**
 * The set of columns exposed as dropdown filters. Each value maps 1:1 to a
 * real table column id whose `filterFn` is `equalsString`. (A `trader` column
 * once existed here but the Trader column was removed from the grid, so its
 * filter did nothing; only columns that exist on the table are filterable.)
 */
export type FilterableColumn = 'symbol' | 'side' | 'status';

/** Current value of each per-column filter (`''` means "no filter"). */
export type ColumnFilterValues = Readonly<Record<FilterableColumn, string>>;

/** Distinct option lists that populate each dropdown. */
export interface BlotterFilterOptions {
  readonly symbols: readonly string[];
  readonly sides: readonly string[];
  readonly statuses: readonly string[];
}

/** Props for {@link BlotterToolbar}. */
export interface BlotterToolbarProps {
  /** The current global filter value (controlled). */
  readonly globalFilter: string;
  /** Notifies the parent of a debounced global-filter change. */
  readonly onGlobalFilterChange: (value: string) => void;
  /** The current per-column filter values (controlled). */
  readonly columnFilters: ColumnFilterValues;
  /** Notifies the parent of a per-column filter change. */
  readonly onColumnFilterChange: (column: FilterableColumn, value: string) => void;
  /** Resets every filter to empty (Clear). */
  readonly onClearFilters: () => void;
  /** Current time-order direction ('desc' = newest first, the default). */
  readonly timeSortDir: 'desc' | 'asc';
  /** Toggles the time-order direction. */
  readonly onToggleTimeSort: () => void;
  /** Opens the create-trade modal. */
  readonly onCreateClick: () => void;
  /** Opens the add-random-trades modal. */
  readonly onAddRandomClick: () => void;
  /** Option lists for the dropdowns. */
  readonly options: BlotterFilterOptions;
  /** Current page size (rows per page). */
  readonly pageSize: number;
  /** Notifies the parent of a page-size change. */
  readonly onPageSizeChange: (pageSize: number) => void;
  /** Current stream rate cap (rows applied per drain tick). */
  readonly streamMaxPerTick: number;
  /** Notifies the parent of a stream rate-cap change. */
  readonly onStreamMaxPerTickChange: (n: number) => void;
  /** Current stream drain interval (ms). */
  readonly streamIntervalMs: number;
  /** Notifies the parent of a stream interval change. */
  readonly onStreamIntervalChange: (ms: number) => void;
  /** Whether stream rendering is paused (buffered trades are not discarded). */
  readonly streamPaused: boolean;
  /** Toggles the paused state. */
  readonly onStreamPausedToggle: () => void;
  /** Re-runs the initial trade load (Refresh affordance); omit to hide it. */
  readonly onRefresh?: () => void;
  /** Whether a refresh/refetch is currently in flight (disables the control). */
  readonly isRefreshing?: boolean;
}

export function BlotterToolbar({
  globalFilter,
  onGlobalFilterChange,
  columnFilters,
  onColumnFilterChange,
  onClearFilters,
  timeSortDir,
  onToggleTimeSort,
  onCreateClick,
  onAddRandomClick,
  options,
  pageSize,
  onPageSizeChange,
  streamMaxPerTick,
  onStreamMaxPerTickChange,
  streamIntervalMs,
  onStreamIntervalChange,
  streamPaused,
  onStreamPausedToggle,
  onRefresh,
  isRefreshing = false,
}: BlotterToolbarProps): React.JSX.Element {
  // Local, immediate mirror of the text input so typing feels instant; the
  // debounced value is what we report upstream.
  const [localGlobal, setLocalGlobal] = useState(globalFilter);
  // Whether the collapsible filter bar is shown. Hidden by default (Req 19.5).
  const [showFilters, setShowFilters] = useState(false);

  // Keep the local input in sync if the controlled value changes externally
  // (e.g. a "clear filters" action in the parent).
  useEffect(() => {
    setLocalGlobal(globalFilter);
  }, [globalFilter]);

  // Debounce: report the latest typed value once the user pauses. We compare
  // against the incoming prop so an externally-driven sync does not re-notify.
  const onGlobalFilterChangeRef = useRef(onGlobalFilterChange);
  onGlobalFilterChangeRef.current = onGlobalFilterChange;

  useEffect(() => {
    if (localGlobal === globalFilter) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      onGlobalFilterChangeRef.current(localGlobal);
    }, GLOBAL_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [localGlobal, globalFilter]);

  // Number of per-column filters currently in effect (Requirement 19.6).
  const activeFilterCount = Object.values(columnFilters).filter(
    (v) => v !== '',
  ).length;

  return (
    <div className={styles.toolbar}>
      {/* Control row (desk stats live in the app top bar to avoid duplication) */}
      <div className={styles.controls}>
        <div className={`${styles.field} ${styles.searchField}`}>
          <label htmlFor="blotter-global-filter">Search trades</label>
          <input
            id="blotter-global-filter"
            type="search"
            placeholder="Search all columns..."
            value={localGlobal}
            onChange={(e) => setLocalGlobal(e.target.value)}
          />
        </div>

        <button
          type="button"
          className={
            showFilters || activeFilterCount > 0
              ? `${styles.filterToggle} ${styles.filterToggleActive}`
              : styles.filterToggle
          }
          aria-expanded={showFilters}
          aria-controls="blotter-filter-bar"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        <button
          type="button"
          className={styles.sortToggle}
          aria-pressed={timeSortDir === 'asc'}
          aria-label={
            timeSortDir === 'desc'
              ? 'Sorted newest first; click to sort oldest first'
              : 'Sorted oldest first; click to sort newest first'
          }
          title="Toggle time order"
          onClick={onToggleTimeSort}
        >
          {timeSortDir === 'desc' ? '\u25BC Newest' : '\u25B2 Oldest'}
        </button>

        {onRefresh && (
          <button
            type="button"
            className={styles.refreshButton}
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh trades"
            title="Refresh trades"
          >
            {'\u21BB'} {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        )}

        {/* Secondary controls: tucked to the right, wrap on narrow widths. */}
        <div className={`${styles.field} ${styles.secondaryStart}`}>
          <label htmlFor="blotter-page-size">Rows per page</label>
          <select
            id="blotter-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.sliderField}>
          <label htmlFor="blotter-stream-rate">
            Rows / tick <span className={styles.sliderValue}>{streamMaxPerTick}</span>
          </label>
          <input
            id="blotter-stream-rate"
            type="range"
            min={STREAM_RATE_MIN}
            max={STREAM_RATE_MAX}
            step={STREAM_RATE_STEP}
            value={streamMaxPerTick}
            onChange={(e) => onStreamMaxPerTickChange(Number(e.target.value))}
          />
        </div>

        <div className={styles.sliderField}>
          <label htmlFor="blotter-stream-interval">
            Interval{' '}
            <span className={styles.sliderValue}>
              {streamIntervalMs >= 1000
                ? `${(streamIntervalMs / 1000).toFixed(streamIntervalMs % 1000 === 0 ? 0 : 1)}s`
                : `${streamIntervalMs}ms`}
            </span>
          </label>
          <input
            id="blotter-stream-interval"
            type="range"
            min={STREAM_INTERVAL_MIN}
            max={STREAM_INTERVAL_MAX}
            step={STREAM_INTERVAL_STEP}
            value={streamIntervalMs}
            onChange={(e) => onStreamIntervalChange(Number(e.target.value))}
          />
        </div>

        <button
          type="button"
          className={
            streamPaused
              ? `${styles.pauseButton} ${styles.pauseButtonActive}`
              : styles.pauseButton
          }
          aria-pressed={streamPaused}
          onClick={onStreamPausedToggle}
        >
          {streamPaused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          className={styles.createButton}
          onClick={onCreateClick}
        >
          Create Trade
        </button>

        <button
          type="button"
          className={styles.randomButton}
          onClick={onAddRandomClick}
        >
          Add Random Trades
        </button>
      </div>

      {/* Collapsible inline filter bar (not a drawer) */}
      {showFilters && (
        <div id="blotter-filter-bar" className={styles.filterBar}>
          <ColumnFilter
            id="blotter-filter-symbol"
            label="Symbol"
            column="symbol"
            value={columnFilters.symbol}
            options={options.symbols}
            onChange={onColumnFilterChange}
          />
          <ColumnFilter
            id="blotter-filter-side"
            label="Side"
            column="side"
            value={columnFilters.side}
            options={options.sides}
            onChange={onColumnFilterChange}
          />
          <ColumnFilter
            id="blotter-filter-status"
            label="Status"
            column="status"
            value={columnFilters.status}
            options={options.statuses}
            onChange={onColumnFilterChange}
          />
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClearFilters}
            disabled={activeFilterCount === 0}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/** Props for a single per-column dropdown filter. */
interface ColumnFilterProps {
  readonly id: string;
  readonly label: string;
  readonly column: FilterableColumn;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (column: FilterableColumn, value: string) => void;
}

/** A labelled `<select>` that reports its change with the owning column key. */
function ColumnFilter({
  id,
  label,
  column,
  value,
  options,
  onChange,
}: ColumnFilterProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(column, e.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
