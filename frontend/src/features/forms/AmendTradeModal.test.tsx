/**
 * Component tests for <AmendTradeModal />.
 *
 * The modal composes the shared TradeForm (amend mode) with the useAmendTrade
 * hook. We mock the hook so we can assert the modal's wiring: it renders the
 * dialog titled for the trade, pre-populates the form from the current trade,
 * forwards the submit to the hook, disables while pending, and surfaces a 409
 * conflict inline (never a toast). A null trade renders nothing.
 *
 * _Requirements: 11.1, 11.2, 11.3_
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UseAmendTradeResult } from '../../hooks/useAmendTrade';

// Mock the mutation hook so no network is touched and we control its return.
vi.mock('../../hooks/useAmendTrade', () => ({
  useAmendTrade: vi.fn(),
}));

import { useAmendTrade } from '../../hooks/useAmendTrade';
import { AmendTradeModal } from './AmendTradeModal';
import { VALIDATION_MESSAGES } from '../../utils/tradeSchema';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type Trade,
} from '../../types/trade.types';

const useAmendTradeMock = vi.mocked(useAmendTrade);

/** Builds a full hook result, overriding only what a test needs. */
function hookResult(
  overrides: Partial<UseAmendTradeResult> = {},
): UseAmendTradeResult {
  return {
    submit: vi.fn(),
    isPending: false,
    conflictMessage: null,
    ...overrides,
  };
}

const trade: Readonly<Trade> = {
  id: createTradeId('TRD-100001'),
  symbol: 'AAPL',
  quantity: 5000,
  price: 187.42,
  side: TradeSide.BUY,
  trader: 'JSMITH',
  tradeDate: '2026-08-18T10:32:00Z',
  status: TradeStatus.ACTIVE,
  book: 'EQUITIES_US',
  counterparty: 'Goldman Sachs',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AmendTradeModal', () => {
  it('renders nothing when no trade is selected', () => {
    useAmendTradeMock.mockReturnValue(hookResult());
    const { container } = render(
      <AmendTradeModal isOpen trade={null} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a dialog titled for the selected trade', () => {
    useAmendTradeMock.mockReturnValue(hookResult());
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/amend trade trd-100001/i),
    ).toBeInTheDocument();
  });

  it('pre-populates the form with the current trade values', () => {
    useAmendTradeMock.mockReturnValue(hookResult());
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/symbol/i)).toHaveValue('AAPL');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(5000);
    expect(screen.getByLabelText(/price/i)).toHaveValue(187.42);
    expect(screen.getByLabelText(/trader/i)).toHaveValue('JSMITH');
    expect(screen.getByLabelText(/book/i)).toHaveValue('EQUITIES_US');
    expect(screen.getByLabelText(/counterparty/i)).toHaveValue('Goldman Sachs');
    expect(screen.getByLabelText(/status/i)).toHaveValue('ACTIVE');
  });

  it('forwards the trade id and changed fields to the hook on submit', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    useAmendTradeMock.mockReturnValue(hookResult({ submit }));
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toBe(trade.id);
    expect(typeof submit.mock.calls[0][1]).toBe('object');
  });

  it('disables the submit button while the mutation is pending', () => {
    useAmendTradeMock.mockReturnValue(hookResult({ isPending: true }));
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('renders a 409 conflict message inline (not a toast)', () => {
    useAmendTradeMock.mockReturnValue(
      hookResult({ conflictMessage: 'This trade has been cancelled.' }),
    );
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('This trade has been cancelled.'),
    ).toBeInTheDocument();
  });

  it('enforces validation: an invalid symbol shows the format error and does not submit', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    useAmendTradeMock.mockReturnValue(hookResult({ submit }));
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    // Replace the pre-filled symbol with an invalid lowercase value.
    const symbol = screen.getByLabelText(/symbol/i);
    await user.clear(symbol);
    await user.type(symbol, 'aapl');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.symbolFormat)).toBeInTheDocument(),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('enforces validation: a non-positive price shows the error and does not submit', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    useAmendTradeMock.mockReturnValue(hookResult({ submit }));
    render(<AmendTradeModal isOpen trade={trade} onClose={vi.fn()} />);

    const price = screen.getByLabelText(/price/i);
    await user.clear(price);
    await user.type(price, '0');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.pricePositive)).toBeInTheDocument(),
    );
    expect(submit).not.toHaveBeenCalled();
  });
});
