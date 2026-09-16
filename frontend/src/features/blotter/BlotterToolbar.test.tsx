/**
 * Component tests for <BlotterToolbar />.
 *
 * The toolbar is a controlled component: it owns the debounced global-filter
 * input locally but reports every change up to the parent, and it renders the
 * per-column filter dropdowns plus the "Create Trade" button. Behaviours under
 * test (per frontend + ux-best-practices steering, Requirement 9.3):
 *
 *  - The global text filter debounces (300ms) before notifying the parent.
 *  - Each per-column dropdown (symbol/side/status/trader) reports its change
 *    immediately with the column key and selected value.
 *  - Every control has an associated <label> (accessibility).
 *  - The Create Trade button invokes its callback.
 *
 * _Requirements: 9.3_
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { BlotterToolbar, type BlotterToolbarProps } from './BlotterToolbar';

/** Default options for the per-column dropdowns. */
const OPTIONS: BlotterToolbarProps['options'] = {
  symbols: ['AAPL', 'MSFT'],
  sides: ['BUY', 'SELL'],
  statuses: ['ACTIVE', 'CANCELLED'],
  traders: ['JSMITH', 'ABROWN'],
};

/** Renders the toolbar with overridable props and spy callbacks. */
function renderToolbar(overrides: Partial<BlotterToolbarProps> = {}) {
  const onGlobalFilterChange = vi.fn();
  const onColumnFilterChange = vi.fn();
  const onCreateClick = vi.fn();
  const onPageSizeChange = vi.fn();
  const onClearFilters = vi.fn();

  const props: BlotterToolbarProps = {
    globalFilter: '',
    onGlobalFilterChange,
    columnFilters: { symbol: '', side: '', status: '', trader: '' },
    onColumnFilterChange,
    onCreateClick,
    onAddRandomClick: vi.fn(),
    options: OPTIONS,
    pageSize: 50,
    onPageSizeChange,
    onClearFilters,
    timeSortDir: 'desc' as const,
    onToggleTimeSort: vi.fn(),
    streamMaxPerTick: 100,
    onStreamMaxPerTickChange: vi.fn(),
    streamIntervalMs: 1000,
    onStreamIntervalChange: vi.fn(),
    streamPaused: false,
    onStreamPausedToggle: vi.fn(),
    ...overrides,
  };

  render(<BlotterToolbar {...props} />);
  return {
    onGlobalFilterChange,
    onColumnFilterChange,
    onCreateClick,
    onPageSizeChange,
    onClearFilters,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

/** Opens the collapsible filter bar so the per-column dropdowns are rendered. */
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^filter/i }));
}

describe('BlotterToolbar', () => {
  it('renders a labelled global search input', () => {
    renderToolbar();
    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
  });

  it('renders a labelled dropdown for each filterable column when filters are shown', () => {
    renderToolbar();
    openFilters();
    expect(screen.getByLabelText(/symbol/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/side/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/trader/i)).toBeInTheDocument();
  });

  it('debounces the global filter and notifies the parent once after 300ms', () => {
    const { onGlobalFilterChange } = renderToolbar();
    const input = screen.getByLabelText(/search/i);

    // Type a few characters in quick succession.
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.change(input, { target: { value: 'AA' } });
    fireEvent.change(input, { target: { value: 'AAP' } });

    // Nothing reported yet - still within the debounce window.
    expect(onGlobalFilterChange).not.toHaveBeenCalled();

    // Advance past the debounce (400ms window).
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onGlobalFilterChange).toHaveBeenCalledTimes(1);
    expect(onGlobalFilterChange).toHaveBeenLastCalledWith('AAP');
  });

  it('reports a symbol column filter change with the column key and value', () => {
    const { onColumnFilterChange } = renderToolbar();
    openFilters();

    fireEvent.change(screen.getByLabelText(/symbol/i), {
      target: { value: 'AAPL' },
    });

    expect(onColumnFilterChange).toHaveBeenCalledWith('symbol', 'AAPL');
  });

  it('reports a status column filter change with the column key and value', () => {
    const { onColumnFilterChange } = renderToolbar();
    openFilters();

    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: 'CANCELLED' },
    });

    expect(onColumnFilterChange).toHaveBeenCalledWith('status', 'CANCELLED');
  });

  it('invokes onCreateClick when the Create Trade button is pressed', () => {
    const { onCreateClick } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: /create trade/i }));

    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });

  it('reflects the controlled globalFilter prop as the input value', () => {
    renderToolbar({ globalFilter: 'seeded' });
    expect(screen.getByLabelText(/search/i)).toHaveValue('seeded');
  });

  it('renders a labelled page-size selector defaulting to the controlled value', () => {
    renderToolbar({ pageSize: 100 });
    const select = screen.getByLabelText(/rows per page/i);
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('100');
  });

  it('offers the 50/100/250/500 page-size options', () => {
    renderToolbar();
    const select = screen.getByLabelText(/rows per page/i);
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['50', '100', '250', '500']);
  });

  it('reports the numeric page size when the selector changes', () => {
    const { onPageSizeChange } = renderToolbar();
    fireEvent.change(screen.getByLabelText(/rows per page/i), {
      target: { value: '250' },
    });
    expect(onPageSizeChange).toHaveBeenCalledWith(250);
  });

  it('hides the filter dropdowns until the Filter toggle is clicked', () => {
    renderToolbar();
    expect(screen.queryByLabelText(/symbol/i)).not.toBeInTheDocument();
    openFilters();
    expect(screen.getByLabelText(/symbol/i)).toBeInTheDocument();
  });

  it('shows the active-filter count on the toggle', () => {
    renderToolbar({
      columnFilters: { symbol: 'AAPL', side: 'BUY', status: '', trader: '' },
    });
    expect(
      screen.getByRole('button', { name: /filter \(2\)/i }),
    ).toBeInTheDocument();
  });

  it('invokes onClearFilters when Clear is pressed', () => {
    const { onClearFilters } = renderToolbar({
      columnFilters: { symbol: 'AAPL', side: '', status: '', trader: '' },
    });
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
  it('renders the stream pacing dials with current values', () => {
    renderToolbar({ streamMaxPerTick: 250, streamIntervalMs: 2000 });
    const rate = screen.getByLabelText(/rows \/ tick/i) as HTMLSelectElement;
    const interval = screen.getByLabelText(/interval/i) as HTMLSelectElement;
    expect(rate.value).toBe('250');
    expect(interval.value).toBe('2000');
  });

  it('fires onStreamMaxPerTickChange when the rows/tick dial changes', () => {
    const onStreamMaxPerTickChange = vi.fn();
    renderToolbar({ onStreamMaxPerTickChange });
    fireEvent.change(screen.getByLabelText(/rows \/ tick/i), {
      target: { value: '500' },
    });
    expect(onStreamMaxPerTickChange).toHaveBeenCalledWith(500);
  });

  it('fires onStreamIntervalChange when the interval dial changes', () => {
    const onStreamIntervalChange = vi.fn();
    renderToolbar({ onStreamIntervalChange });
    fireEvent.change(screen.getByLabelText(/interval/i), {
      target: { value: '5000' },
    });
    expect(onStreamIntervalChange).toHaveBeenCalledWith(5000);
  });

  it('renders a Pause control that toggles and reflects the paused state', () => {
    const onStreamPausedToggle = vi.fn();
    renderToolbar({ streamPaused: false, onStreamPausedToggle });

    const pause = screen.getByRole('button', { name: /^pause$/i });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pause);
    expect(onStreamPausedToggle).toHaveBeenCalledTimes(1);
  });

  it('shows Resume when already paused', () => {
    renderToolbar({ streamPaused: true });
    const resume = screen.getByRole('button', { name: /^resume$/i });
    expect(resume).toHaveAttribute('aria-pressed', 'true');
  });

  it('invokes onAddRandomClick when the Add Random Trades button is pressed', () => {
    const onAddRandomClick = vi.fn();
    renderToolbar({ onAddRandomClick });
    fireEvent.click(screen.getByRole('button', { name: /add random trades/i }));
    expect(onAddRandomClick).toHaveBeenCalledTimes(1);
  });

  it('shows Newest by default and invokes onToggleTimeSort when the time-order toggle is pressed', () => {
    const onToggleTimeSort = vi.fn();
    renderToolbar({ timeSortDir: 'desc', onToggleTimeSort });
    const toggle = screen.getByRole('button', { name: /sort/i });
    expect(toggle).toHaveTextContent(/newest/i);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(onToggleTimeSort).toHaveBeenCalledTimes(1);
  });

  it('shows Oldest and aria-pressed when the time order is ascending', () => {
    renderToolbar({ timeSortDir: 'asc' });
    const toggle = screen.getByRole('button', { name: /sort/i });
    expect(toggle).toHaveTextContent(/oldest/i);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

});
