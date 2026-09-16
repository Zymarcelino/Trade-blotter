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

import { memo, useEffect, useRef, useState } from 'react';

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
export type FilterableColumn =
  | 'symbol'
  | 'side'
  | 'status'
  | 'quantityMin'
  | 'quantityMax'
  | 'priceMin'
  | 'priceMax';

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

function BlotterToolbarComponent({
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
  // Each string filter counts once; each numeric range (quantity, price)
  // counts once if either of its bounds is set.
  const activeFilterCount =
    (columnFilters.symbol !== '' ? 1 : 0) +
    (columnFilters.side !== '' ? 1 : 0) +
    (columnFilters.status !== '' ? 1 : 0) +
    (columnFilters.quantityMin !== '' || columnFilters.quantityMax !== '' ? 1 : 0) +
    (columnFilters.priceMin !== '' || columnFilters.priceMax !== '' ? 1 : 0);

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
          <TextFilter
            id="blotter-filter-symbol"
            label="Symbol"
            column="symbol"
            placeholder="e.g. AAPL"
            value={columnFilters.symbol}
            onChange={onColumnFilterChange}
          />
          <TextFilter
            id="blotter-filter-side"
            label="Side"
            column="side"
            placeholder="BUY or SELL"
            value={columnFilters.side}
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
          <RangeFilter
            label="Quantity"
            idBase="blotter-filter-quantity"
            minColumn="quantityMin"
            maxColumn="quantityMax"
            minValue={columnFilters.quantityMin}
            maxValue={columnFilters.quantityMax}
            onChange={onColumnFilterChange}
          />
          <RangeFilter
            label="Price"
            idBase="blotter-filter-price"
            minColumn="priceMin"
            maxColumn="priceMax"
            minValue={columnFilters.priceMin}
            maxValue={columnFilters.priceMax}
            step="0.01"
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

/** Props for a free-text substring filter (Symbol, Side). */
interface TextFilterProps {
  readonly id: string;
  readonly label: string;
  readonly column: FilterableColumn;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (column: FilterableColumn, value: string) => void;
}

/**
 * A labelled free-text input that filters a column by case-insensitive
 * substring. Used for open-ended / high-cardinality columns (Symbol) and
 * small enums the user may prefer to type (Side); an empty value clears the
 * filter. Trimmed so stray whitespace does not hide all rows.
 */
function TextFilter({
  id,
  label,
  column,
  value,
  placeholder,
  onChange,
}: TextFilterProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(column, e.target.value)}
      />
    </div>
  );
}

/** Props for a numeric min/max range filter (Quantity, Price). */
interface RangeFilterProps {
  readonly label: string;
  readonly idBase: string;
  readonly minColumn: FilterableColumn;
  readonly maxColumn: FilterableColumn;
  readonly minValue: string;
  readonly maxValue: string;
  /** Input step (e.g. '0.01' for price); defaults to '1'. */
  readonly step?: string;
  readonly onChange: (column: FilterableColumn, value: string) => void;
}

/**
 * A labelled pair of number inputs (min / max) for a numeric column. An empty
 * bound means "unbounded"; the table treats the pair as an inclusive range.
 */
function RangeFilter({
  label,
  idBase,
  minColumn,
  maxColumn,
  minValue,
  maxValue,
  step = '1',
  onChange,
}: RangeFilterProps): React.JSX.Element {
  return (
    <div className={styles.rangeField} role="group" aria-label={`${label} range`}>
      <span className={styles.rangeLabel}>{label}</span>
      <div className={styles.rangeInputs}>
        <input
          id={`${idBase}-min`}
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          placeholder="Min"
          aria-label={`${label} minimum`}
          value={minValue}
          onChange={(e) => onChange(minColumn, e.target.value)}
        />
        <span className={styles.rangeSep} aria-hidden="true">-</span>
        <input
          id={`${idBase}-max`}
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          placeholder="Max"
          aria-label={`${label} maximum`}
          value={maxValue}
          onChange={(e) => onChange(maxColumn, e.target.value)}
        />
      </div>
    </div>
  );
}


/**
 * Memoised so the toolbar does not re-render on every WebSocket stream tick.
 * TradeTable passes stable `options` and useCallback-wrapped handlers, so the
 * search box, dropdowns, and range inputs stay focused and responsive while
 * trades are streaming in.
 */
export const BlotterToolbar = memo(BlotterToolbarComponent);
