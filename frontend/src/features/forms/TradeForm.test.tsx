/**
 * Component tests for <TradeForm />.
 *
 * Exercises the validation and accessibility behaviour directly, independent of
 * the modal wrappers and mutation hooks. The `onSubmit` prop is a spy so we can
 * assert exactly when (and with what) the form calls out.
 *
 * Covered (test-coverage + ux-best-practices Forms/Validation UX):
 *  - valid submit calls onSubmit once with the validated values
 *  - empty submit shows a required error per field and does NOT call onSubmit
 *  - whitespace-only text is treated as empty
 *  - blur validation surfaces an error before any submit
 *  - untouched fields are not pre-validated on mount
 *  - submit button disabled while submitting (prevents double-submit)
 *  - required fields marked aria-required; errors linked via aria-describedby
 *  - inline conflict message rendered when provided
 *  - amend mode: fields optional, status control present
 *
 * _Requirements: 10.2, 10.3, 10.5, 10.6, 11.2_
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';

import { TradeForm } from './TradeForm';
import { VALIDATION_MESSAGES } from '../../utils/tradeSchema';

afterEach(cleanup);

/** Fills every create-mode field with valid values. */
async function fillValid(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/symbol/i), 'AAPL');
  await user.type(screen.getByLabelText(/quantity/i), '100');
  await user.type(screen.getByLabelText(/price/i), '150.25');
  // Side is a segmented toggle - click the BUY button.
  await user.click(screen.getByRole('button', { name: 'BUY' }));
  // Trader / Book / Counterparty are free-text inputs (open-ended desk data).
  await user.type(screen.getByLabelText(/trader/i), 'JSMITH');
  await user.type(screen.getByLabelText(/book/i), 'EQUITIES_US');
  await user.type(screen.getByLabelText(/counterparty/i), 'Goldman Sachs');
}

describe('TradeForm — create mode validation', () => {
  it('calls onSubmit once with the validated values on a valid submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TradeForm mode="create" onSubmit={onSubmit} />);

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /submit trade/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      symbol: 'AAPL',
      quantity: 100,
      price: 150.25,
      side: 'BUY',
      trader: 'JSMITH',
      book: 'EQUITIES_US',
      counterparty: 'Goldman Sachs',
    });
  });

  it('shows required errors and does NOT call onSubmit when empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TradeForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /submit trade/i }));

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.symbolRequired)).toBeInTheDocument(),
    );
    expect(screen.getByText(VALIDATION_MESSAGES.traderRequired)).toBeInTheDocument();
    expect(screen.getByText(VALIDATION_MESSAGES.bookRequired)).toBeInTheDocument();
    expect(
      screen.getByText(VALIDATION_MESSAGES.counterpartyRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only symbol as empty (required error)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TradeForm mode="create" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/symbol/i), '   ');
    await user.click(screen.getByRole('button', { name: /submit trade/i }));

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.symbolRequired)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates a field on blur before any submit', async () => {
    const user = userEvent.setup();
    render(<TradeForm mode="create" onSubmit={vi.fn()} />);

    const symbol = screen.getByLabelText(/symbol/i);
    await user.type(symbol, 'aapl');
    await user.tab(); // blur

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_MESSAGES.symbolFormat)).toBeInTheDocument(),
    );
  });

  it('does not pre-validate untouched fields on mount', () => {
    render(<TradeForm mode="create" onSubmit={vi.fn()} />);

    expect(
      screen.queryByText(VALIDATION_MESSAGES.symbolRequired),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(VALIDATION_MESSAGES.traderRequired),
    ).not.toBeInTheDocument();
  });
});

describe('TradeForm — double-submit prevention', () => {
  it('disables the submit button while submitting', () => {
    render(<TradeForm mode="create" onSubmit={vi.fn()} isSubmitting />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

describe('TradeForm — accessibility', () => {
  it('marks required inputs with aria-required in create mode', () => {
    render(<TradeForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/symbol/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/quantity/i)).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('links an error to its input via aria-describedby', async () => {
    const user = userEvent.setup();
    render(<TradeForm mode="create" onSubmit={vi.fn()} />);

    const symbol = screen.getByLabelText(/symbol/i);
    await user.click(screen.getByRole('button', { name: /submit trade/i }));

    await waitFor(() =>
      expect(symbol).toHaveAttribute('aria-describedby', 'symbol-error'),
    );
    expect(screen.getByText(VALIDATION_MESSAGES.symbolRequired)).toHaveAttribute(
      'id',
      'symbol-error',
    );
  });
});

describe('TradeForm — conflict message', () => {
  it('renders an inline conflict message when provided', () => {
    render(
      <TradeForm
        mode="amend"
        onSubmit={vi.fn()}
        conflictMessage="This trade has been cancelled."
      />,
    );
    expect(
      screen.getByText('This trade has been cancelled.'),
    ).toBeInTheDocument();
  });
});

describe('TradeForm — amend mode', () => {
  it('renders a status control and does not mark fields required', () => {
    render(<TradeForm mode="amend" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/symbol/i)).toHaveAttribute(
      'aria-required',
      'false',
    );
  });

  it('submits an empty amend (no changes) without validation errors', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TradeForm mode="amend" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe('TradeForm — property based', () => {
  it('never calls onSubmit when a required text field is empty or whitespace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', ' ', '   ', '\t', '\n  '),
        async (blank) => {
          cleanup();
          const user = userEvent.setup();
          const onSubmit = vi.fn();
          render(<TradeForm mode="create" onSubmit={onSubmit} />);

          // Fill everything valid EXCEPT symbol, which gets the blank value.
          await user.type(screen.getByLabelText(/quantity/i), '100');
          await user.type(screen.getByLabelText(/price/i), '150.25');
          await user.click(screen.getByRole('button', { name: 'BUY' }));
          await user.type(screen.getByLabelText(/trader/i), 'JSMITH');
          await user.type(screen.getByLabelText(/book/i), 'EQUITIES_US');
          await user.type(screen.getByLabelText(/counterparty/i), 'Goldman Sachs');
          if (blank.trim() !== '') {
            await user.type(screen.getByLabelText(/symbol/i), blank);
          }

          await user.click(screen.getByRole('button', { name: /submit trade/i }));
          await waitFor(() =>
            expect(
              screen.getByText(VALIDATION_MESSAGES.symbolRequired),
            ).toBeInTheDocument(),
          );
          return onSubmit.mock.calls.length === 0;
        },
      ),
      { numRuns: 5 },
    );
  });
});
