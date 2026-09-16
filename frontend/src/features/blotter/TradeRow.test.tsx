/**
 * Unit tests for <TradeRow />.
 *
 * TradeRow renders a single trade as a semantic table row. The behaviours under
 * test (per ux-best-practices "Data Grid" and Requirements 9.5/9.6):
 *
 *  - Renders every trade field.
 *  - CANCELLED rows are de-emphasised with BOTH reduced opacity AND
 *    strikethrough — never colour alone (Property 20).
 *  - Clicking (or keyboard-activating) the row calls `onRowClick` with the
 *    trade so the audit panel can open.
 *
 * The component renders a `<tr>`, so each test mounts it inside a
 * `<table><tbody>` to keep the DOM valid.
 *
 * _Requirements: 9.5, 9.6_
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { TradeRow } from './TradeRow';
import styles from './TradeRow.module.css';
import { TradeSide, TradeStatus, createTradeId, type Trade } from '../../types/trade.types';
import { formatTimestamp } from '../../utils/formatters';

/** Builds a trade with sensible defaults, overridable per test. */
function makeTrade(overrides: Partial<Trade> = {}): Readonly<Trade> {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 5000,
    price: 123.45,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:32:00Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    ...overrides,
  };
}

/** Renders a TradeRow inside a valid table wrapper, defaulting the action
 * callbacks so existing tests need not supply them. */
function renderRow(
  props: Omit<Parameters<typeof TradeRow>[0], 'onAmend' | 'onCancel'> &
    Partial<Pick<Parameters<typeof TradeRow>[0], 'onAmend' | 'onCancel'>>,
) {
  const full = { onAmend: vi.fn(), onCancel: vi.fn(), ...props };
  const result = render(
    <table>
      <tbody>
        <TradeRow {...full} />
      </tbody>
    </table>,
  );
  return { ...result, ...full };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('TradeRow', () => {
  it('renders all trade fields', () => {
    const trade = makeTrade();
    renderRow({ trade, onRowClick: vi.fn() });

    // Trade ID and Trader columns were removed; the row shows Time, Status,
    // Symbol, Side, Price, Quantity, Book, Counterparty.
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.getByText('123.45')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('EQUITIES_US')).toBeInTheDocument();
    expect(screen.getByText('Goldman Sachs')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    // The Time column renders the formatted tradeDate (never the raw ISO string).
    expect(screen.getByText(formatTimestamp('2026-08-18T10:32:00Z'))).toBeInTheDocument();
    expect(screen.queryByText('TRD-100001')).not.toBeInTheDocument();
    expect(screen.queryByText('JSMITH')).not.toBeInTheDocument();
  });

  it('does not apply the cancelled styling to an ACTIVE trade', () => {
    const trade = makeTrade({ status: TradeStatus.ACTIVE });
    renderRow({ trade, onRowClick: vi.fn() });

    const row = screen.getByRole('row');
    expect(row.className).not.toContain(styles.cancelled);
  });

  // Property 20: CANCELLED trade row renders with both visual indicators.
  // Feature: trade-blotter, Property 20: CANCELLED trade row renders with both visual indicators
  it('Property 20: a CANCELLED trade applies the cancelled class (opacity + strikethrough)', () => {
    const trade = makeTrade({ status: TradeStatus.CANCELLED });
    renderRow({ trade, onRowClick: vi.fn() });

    const row = screen.getByRole('row');
    // Both indicators are delivered by the single `cancelled` class, which the
    // CSS module defines with BOTH reduced opacity AND line-through. Colour is
    // never the sole signal.
    expect(row.className).toContain(styles.cancelled);
  });

  it('calls onRowClick with the trade when the row is clicked', () => {
    const trade = makeTrade();
    const onRowClick = vi.fn();
    renderRow({ trade, onRowClick });

    fireEvent.click(screen.getByRole('row'));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(trade);
  });

  it('calls onRowClick when the row is activated via the keyboard (Enter)', () => {
    const trade = makeTrade();
    const onRowClick = vi.fn();
    renderRow({ trade, onRowClick });

    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });

    expect(onRowClick).toHaveBeenCalledWith(trade);
  });

  it('renders inline Amend and Cancel actions for an ACTIVE row', () => {
    const trade = makeTrade({ status: TradeStatus.ACTIVE });
    renderRow({ trade, onRowClick: vi.fn() });

    expect(
      screen.getByRole('button', { name: /amend trade TRD-100001/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel trade TRD-100001/i }),
    ).toBeInTheDocument();
  });

  it('does not render Amend or Cancel actions for a CANCELLED row', () => {
    const trade = makeTrade({ status: TradeStatus.CANCELLED });
    renderRow({ trade, onRowClick: vi.fn() });

    expect(
      screen.queryByRole('button', { name: /amend trade/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancel trade/i }),
    ).not.toBeInTheDocument();
  });

  it('invokes onAmend and not onRowClick when Amend is clicked (stopPropagation)', () => {
    const trade = makeTrade();
    const onRowClick = vi.fn();
    const { onAmend } = renderRow({ trade, onRowClick });

    fireEvent.click(screen.getByRole('button', { name: /amend trade/i }));

    expect(onAmend).toHaveBeenCalledWith(trade);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('invokes onCancel and not onRowClick when Cancel is clicked (stopPropagation)', () => {
    const trade = makeTrade();
    const onRowClick = vi.fn();
    const { onCancel } = renderRow({ trade, onRowClick });

    fireEvent.click(screen.getByRole('button', { name: /cancel trade/i }));

    expect(onCancel).toHaveBeenCalledWith(trade);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
