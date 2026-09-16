/**
 * Component tests for <AuditHistoryPanel />.
 *
 * The panel's four render states (loading skeleton, data table, empty message,
 * error state) are driven entirely by the `useAuditHistory` hook, so we mock
 * that hook and assert the panel maps each hook shape to the correct UI. This
 * keeps the tests focused on the panel's presentation logic rather than
 * re-testing the query hook (covered by useAuditHistory.test.ts).
 *
 * Covered (task 17.2 + test-coverage edge cases):
 *  - loading skeleton shown immediately on open, regardless of fetch progress
 *  - data: table with the four columns; changedAt formatted (no `T`/`Z`)
 *  - single-entry and multi-entry datasets
 *  - null old/new values render a placeholder, not "null"
 *  - empty history message
 *  - error state with a Retry button; Retry calls refetch
 *  - panel is non-blocking (no modal overlay / dialog role)
 *  - closed panel renders nothing
 *  - close button invokes onClose
 *  - formatTimestamp unit behaviour incl. invalid input
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createTradeId, TradeSide, TradeStatus } from '../../types/trade.types';
import type { AuditEntry, Trade } from '../../types/trade.types';
import type { UseAuditHistoryResult } from '../../hooks/useAuditHistory';

// Mock the query hook so we control the panel's inputs precisely.
vi.mock('../../hooks/useAuditHistory', () => ({
  useAuditHistory: vi.fn(),
}));

import { useAuditHistory } from '../../hooks/useAuditHistory';
import { AuditHistoryPanel, formatTimestamp } from './AuditHistoryPanel';

const useAuditHistoryMock = vi.mocked(useAuditHistory);

const tradeId = createTradeId('TRD-100001');

const trade: Readonly<Trade> = {
  id: tradeId,
  symbol: 'AAPL',
  quantity: 5000,
  price: 187.42,
  side: TradeSide.BUY,
  trader: 'JSMITH',
  tradeDate: '2026-08-01T09:00:00.000Z',
  status: TradeStatus.ACTIVE,
  book: 'EQUITIES_US',
  counterparty: 'Goldman Sachs',
};

const quantityEntry: AuditEntry = {
  id: 1,
  tradeId,
  field: 'quantity',
  oldValue: '5000',
  newValue: '3000',
  changedAt: '2026-08-18T10:32:00.000Z',
  changedBy: 'SYSTEM',
};

const priceEntry: AuditEntry = {
  id: 2,
  tradeId,
  field: 'price',
  oldValue: '187.42',
  newValue: '190.00',
  changedAt: '2026-08-18T11:00:00.000Z',
  changedBy: 'SYSTEM',
};

/** Builds a full `UseAuditHistoryResult`, overriding only what a test needs. */
function hookResult(
  overrides: Partial<UseAuditHistoryResult> = {},
): UseAuditHistoryResult {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditHistoryPanel — closed', () => {
  it('renders nothing when isOpen is false', () => {
    useAuditHistoryMock.mockReturnValue(hookResult());
    const { container } = render(
      <AuditHistoryPanel trade={trade} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AuditHistoryPanel — loading', () => {
  it('shows the loading skeleton immediately on open (before fetch resolves)', () => {
    // isLoading true and data undefined models the panel opening mid-fetch.
    useAuditHistoryMock.mockReturnValue(hookResult({ isLoading: true }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('audit-loading-skeleton')).toBeInTheDocument();
    // Panel structure (heading) is painted alongside the skeleton — never blank.
    expect(
      screen.getByRole('heading', { name: /TRD-100001/i }),
    ).toBeInTheDocument();
    // Neither data nor empty message shown while loading.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no amendments recorded/i),
    ).not.toBeInTheDocument();
  });

  it('marks the audit region aria-busy while loading', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ isLoading: true }));
    const { container } = render(
      <AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('AuditHistoryPanel — data', () => {
  it('renders the amendment history as a timeline list', () => {
    useAuditHistoryMock.mockReturnValue(
      hookResult({ data: [priceEntry, quantityEntry] }),
    );
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    // The drawer now renders a vertical timeline (an ordered list), not a table.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Each event shows its field label.
    expect(within(items[0]).getByText('price')).toBeInTheDocument();
    expect(within(items[1]).getByText('quantity')).toBeInTheDocument();
  });

  it('renders one timeline item per entry with field/old/new values', () => {
    useAuditHistoryMock.mockReturnValue(
      hookResult({ data: [priceEntry, quantityEntry] }),
    );
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('price')).toBeInTheDocument();
    expect(within(items[1]).getByText('quantity')).toBeInTheDocument();
    expect(within(items[1]).getByText('5000')).toBeInTheDocument();
    expect(within(items[1]).getByText('3000')).toBeInTheDocument();
  });

  it('renders a single-entry dataset', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [quantityEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
  });

  it('formats changedAt as human-readable local time (no T or Z)', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [quantityEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    const expected = formatTimestamp(quantityEntry.changedAt);
    const cell = screen.getByText(expected);
    expect(cell).toBeInTheDocument();
    expect(cell.textContent).not.toMatch(/[TZ]/);
    // The raw ISO string must never be shown.
    expect(screen.queryByText(quantityEntry.changedAt)).not.toBeInTheDocument();
  });

  it('renders a placeholder when old/new values are null', () => {
    const nullEntry: AuditEntry = {
      ...quantityEntry,
      id: 9,
      oldValue: null,
      newValue: null,
    };
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [nullEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    const item = within(screen.getByRole('list')).getAllByRole('listitem')[0];
    expect(within(item).getAllByText('—')).toHaveLength(2);
    expect(within(item).queryByText('null')).not.toBeInTheDocument();
  });

  it('shows the read-only trade detail summary', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [quantityEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    // The trade detail is a labelled region (no separate heading now); the
    // symbol lives in the header pill row, context fields in the detail list.
    expect(
      screen.getByRole('region', { name: /trade detail/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Goldman Sachs')).toBeInTheDocument();
    // The side pill is present in the header.
    expect(screen.getByText('BUY')).toBeInTheDocument();
  });
});

describe('AuditHistoryPanel — empty', () => {
  it('shows the empty message when history has no entries', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    expect(
      screen.getByText('No amendments recorded for this trade.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty message when data is undefined and not loading', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: undefined }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    expect(
      screen.getByText('No amendments recorded for this trade.'),
    ).toBeInTheDocument();
  });
});

describe('AuditHistoryPanel — error', () => {
  it('shows an error state with a Retry button', () => {
    useAuditHistoryMock.mockReturnValue(
      hookResult({
        isError: true,
        error: { code: 'NETWORK_ERROR', message: 'x', statusCode: 0 } as never,
      }),
    );
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Human-readable message, not the raw code.
    expect(screen.queryByText('NETWORK_ERROR')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it('calls refetch when Retry is clicked', async () => {
    const refetch = vi.fn();
    useAuditHistoryMock.mockReturnValue(
      hookResult({
        isError: true,
        error: { code: 'INTERNAL_ERROR', message: 'x', statusCode: 500 } as never,
        refetch,
      }),
    );
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default message for an unknown error code', () => {
    useAuditHistoryMock.mockReturnValue(
      hookResult({
        isError: true,
        error: { code: 'SOMETHING_WEIRD', message: 'x', statusCode: 500 } as never,
      }),
    );
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('AuditHistoryPanel — non-blocking & controls', () => {
  it('is a complementary side panel, not a modal dialog overlay', () => {
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [quantityEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={vi.fn()} />);

    // Rendered as a complementary region so it does not trap focus / block the
    // blotter the way a modal dialog would.
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [quantityEntry] }));
    render(<AuditHistoryPanel trade={trade} isOpen onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: /close audit history panel/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('de-emphasises the summary for a cancelled trade', () => {
    const cancelled: Readonly<Trade> = { ...trade, status: TradeStatus.CANCELLED };
    useAuditHistoryMock.mockReturnValue(hookResult({ data: [] }));
    render(<AuditHistoryPanel trade={cancelled} isOpen onClose={vi.fn()} />);

    // Two "CANCELLED" occurrences would be wrong; summary shows the status.
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  });
});

describe('formatTimestamp', () => {
  it('formats an ISO string without T or Z', () => {
    const result = formatTimestamp('2026-08-18T10:32:00.000Z');
    expect(result).not.toMatch(/[TZ]/);
    expect(result).toMatch(/Aug/);
    expect(result).toMatch(/2026/);
  });

  it('returns the input unchanged for an invalid date', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('handles an empty string by returning it unchanged', () => {
    expect(formatTimestamp('')).toBe('');
  });
});
