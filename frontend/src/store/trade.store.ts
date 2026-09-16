/**
 * Zustand trade store — the live source of truth the blotter renders from.
 *
 * Holds the trade list, simulated market prices, connection flag, and the
 * stream-pacing dials surfaced in the toolbar. WebSocket updates patch this
 * store directly (no refetch). Trades are stored as Readonly<Trade> and never
 * mutated in place; every action returns a fresh array. The list is capped at
 * MAX_LIVE_TRADES so an unbounded live stream cannot exhaust memory.
 */

import { create } from 'zustand';

import { TradeStatus } from '../types/trade.types';
import type { Trade, TradeId } from '../types/trade.types';

/** Maximum number of live trades retained in the store window. */
export const MAX_LIVE_TRADES = 10000;

/** Default stream-pacing dials. */
const DEFAULT_STREAM_MAX_PER_TICK = 100;
const DEFAULT_STREAM_INTERVAL_MS = 1000;

/** The store state and actions. */
export interface TradeStoreState {
  /** The live trade list (newest handling is done by the view). */
  readonly trades: ReadonlyArray<Readonly<Trade>>;
  /** True while the initial trade load is in flight. */
  readonly isLoading: boolean;
  /** A load error message, or null. */
  readonly error: string | null;
  /** True while the WebSocket is connected. */
  readonly isConnected: boolean;
  /** Latest simulated market prices by symbol (mark-to-market source). */
  readonly marketPrices: Readonly<Record<string, number>>;

  /** Max trades applied to the view per drain tick. */
  readonly streamMaxPerTick: number;
  /** Drain interval in ms. */
  readonly streamIntervalMs: number;
  /** Whether live rendering is paused. */
  readonly streamPaused: boolean;

  /** Replaces the entire trade list (capped to the window). */
  setTrades: (trades: ReadonlyArray<Readonly<Trade>>) => void;
  /** Appends one trade (deduped by id), capping to the window. */
  addTrade: (trade: Readonly<Trade>) => void;
  /** Appends a batch of trades (deduped by id), capping to the window. */
  addTradesBatch: (trades: ReadonlyArray<Readonly<Trade>>) => void;
  /** Replaces the trade with a matching id. */
  updateTrade: (trade: Readonly<Trade>) => void;
  /** Sets the status of the trade with `id` to CANCELLED. */
  cancelTrade: (id: TradeId) => void;

  /** Sets the loading flag. */
  setLoading: (loading: boolean) => void;
  /** Sets the error message. */
  setError: (error: string | null) => void;
  /** Sets the connection flag. */
  setConnected: (connected: boolean) => void;
  /** Replaces the simulated market prices. */
  setMarketPrices: (prices: Readonly<Record<string, number>>) => void;

  /** Sets the per-tick stream cap. */
  setStreamMaxPerTick: (n: number) => void;
  /** Sets the stream drain interval (ms). */
  setStreamIntervalMs: (ms: number) => void;
  /** Sets whether the stream is paused. */
  setStreamPaused: (paused: boolean) => void;
}

/** Caps a trade array to the most recent MAX_LIVE_TRADES entries. */
export function capToWindow(
  trades: ReadonlyArray<Readonly<Trade>>,
): ReadonlyArray<Readonly<Trade>> {
  if (trades.length <= MAX_LIVE_TRADES) {
    return trades;
  }
  return trades.slice(trades.length - MAX_LIVE_TRADES);
}

export const useTradeStore = create<TradeStoreState>((set) => ({
  trades: [],
  isLoading: false,
  error: null,
  isConnected: false,
  marketPrices: {},

  streamMaxPerTick: DEFAULT_STREAM_MAX_PER_TICK,
  streamIntervalMs: DEFAULT_STREAM_INTERVAL_MS,
  streamPaused: false,

  setTrades: (trades) => set({ trades: capToWindow(trades) }),

  addTrade: (trade) =>
    set((state) => {
      if (state.trades.some((t) => t.id === trade.id)) {
        return state;
      }
      return { trades: capToWindow([...state.trades, trade]) };
    }),

  addTradesBatch: (incoming) =>
    set((state) => {
      const known = new Set(state.trades.map((t) => t.id));
      const fresh = incoming.filter((t) => !known.has(t.id));
      if (fresh.length === 0) {
        return state;
      }
      return { trades: capToWindow([...state.trades, ...fresh]) };
    }),

  updateTrade: (trade) =>
    set((state) => ({
      trades: state.trades.map((t) => (t.id === trade.id ? trade : t)),
    })),

  cancelTrade: (id) =>
    set((state) => ({
      trades: state.trades.map((t) =>
        t.id === id ? { ...t, status: TradeStatus.CANCELLED } : t,
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setConnected: (connected) => set({ isConnected: connected }),
  setMarketPrices: (prices) => set({ marketPrices: prices }),

  setStreamMaxPerTick: (n) => set({ streamMaxPerTick: n }),
  setStreamIntervalMs: (ms) => set({ streamIntervalMs: ms }),
  setStreamPaused: (paused) => set({ streamPaused: paused }),
}));
