import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/trade.api', () => ({
  addRandomTrades: vi.fn(),
}));

import { addRandomTrades } from '../../services/trade.api';
import { ApiError } from '../../services/errors';
import { useToastStore } from '../../store/toast.store';
import { AddRandomTradesModal } from './AddRandomTradesModal';

const addRandomTradesMock = vi.mocked(addRandomTrades);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useToastStore.getState().clear();
});

describe('AddRandomTradesModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <AddRandomTradesModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a labelled count input defaulting to 100', () => {
    render(<AddRandomTradesModal isOpen onClose={vi.fn()} />);
    const input = screen.getByLabelText(/how many trades/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('100');
  });

  it('submits the count, shows a success toast, and closes on success', async () => {
    const user = userEvent.setup();
    addRandomTradesMock.mockResolvedValue({ data: { created: 250 } });
    const onClose = vi.fn();
    render(<AddRandomTradesModal isOpen onClose={onClose} />);

    const input = screen.getByLabelText(/how many trades/i);
    await user.clear(input);
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: /add trades/i }));

    await waitFor(() => expect(addRandomTradesMock).toHaveBeenCalledWith(250));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useToastStore.getState().toasts.some((t) => /250/.test(t.message))).toBe(true);
  });

  it('disables submit and shows an inline error for an invalid count', async () => {
    const user = userEvent.setup();
    render(<AddRandomTradesModal isOpen onClose={vi.fn()} />);

    const input = screen.getByLabelText(/how many trades/i);
    await user.clear(input);
    await user.type(input, '0');

    expect(screen.getByRole('button', { name: /add trades/i })).toBeDisabled();
    expect(screen.getByText(/between 1 and/i)).toBeInTheDocument();
    expect(addRandomTradesMock).not.toHaveBeenCalled();
  });

  it('rejects a count above the maximum', async () => {
    const user = userEvent.setup();
    render(<AddRandomTradesModal isOpen onClose={vi.fn()} />);

    const input = screen.getByLabelText(/how many trades/i);
    await user.clear(input);
    await user.type(input, '10001');

    expect(screen.getByRole('button', { name: /add trades/i })).toBeDisabled();
  });

  it('keeps the modal open and shows an error toast on API failure', async () => {
    const user = userEvent.setup();
    addRandomTradesMock.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'boom', 500),
    );
    const onClose = vi.fn();
    render(<AddRandomTradesModal isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /add trades/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.type === 'ERROR')).toBe(true),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
