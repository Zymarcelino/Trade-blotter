/**
 * useTradeSocket - bridges the singleton WebSocket client to the Zustand store.
 *
 * Connects on mount and disconnects on unmount. Amend/cancel/price messages are
 * applied immediately, but TRADE_CREATED messages are BUFFERED and drained on a
 * fixed cadence so the grid re-renders at a controlled, user-tunable rate:
 *   - at most `streamMaxPerTick` new trades are applied per `streamIntervalMs`,
 *     in ONE batched store update per tick (Rows / tick + Interval dials);
 *   - while `streamPaused` is true the buffer is retained (nothing discarded)
 *     and simply not drained until the user resumes (Pause button).
 *
 * This is what makes the toolbar streaming dials actually take effect. No full
 * API refetch is triggered on any WS event. Mounted once at the app level so
 * switching tabs never disconnects the live feed.
 */

import { useEffect, useRef } from 'react';

import { webSocketClient } from '../services/websocket.client';
import { useTradeStore } from '../store/trade.store';
import type { Trade, WsMessage } from '../types/trade.types';

export function useTradeSocket(): void {
  // Buffer of created trades awaiting a paced flush.
  const createBufferRef = useRef<Array<Readonly<Trade>>>([]);

  // Pacing dials read as selectors so the drain effect re-arms when they change
  // and the new cadence/rate takes effect immediately.
  const streamMaxPerTick = useTradeStore((s) => s.streamMaxPerTick);
  const streamIntervalMs = useTradeStore((s) => s.streamIntervalMs);
  const streamPaused = useTradeStore((s) => s.streamPaused);

  // Connect + subscribe once per mount. Reads store actions imperatively so the
  // effect has no selector dependencies and runs exactly once.
  useEffect(() => {
    const unsubscribers: Array<() => void> = [
      webSocketClient.onConnectionChange((connected) => {
        useTradeStore.getState().setConnected(connected);
      }),
      webSocketClient.subscribe('TRADE_CREATED', (msg: WsMessage) => {
        if (msg.type === 'TRADE_CREATED') {
          // Buffer; the paced drain tick below applies these at a controlled rate.
          createBufferRef.current.push(msg.payload);
        }
      }),
      webSocketClient.subscribe('TRADE_AMENDED', (msg: WsMessage) => {
        if (msg.type === 'TRADE_AMENDED') {
          useTradeStore.getState().updateTrade(msg.payload);
        }
      }),
      webSocketClient.subscribe('TRADE_CANCELLED', (msg: WsMessage) => {
        if (msg.type === 'TRADE_CANCELLED') {
          useTradeStore.getState().cancelTrade(msg.payload.id);
        }
      }),
      webSocketClient.subscribe('PRICE_TICK', (msg: WsMessage) => {
        if (msg.type === 'PRICE_TICK') {
          useTradeStore.getState().setMarketPrices(msg.payload);
        }
      }),
    ];

    webSocketClient.connect();

    return () => {
      createBufferRef.current = [];
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      webSocketClient.disconnect();
    };
  }, []);

  // Paced drain: apply at most `streamMaxPerTick` buffered creates every
  // `streamIntervalMs`, in ONE batched store update per tick. Re-arms whenever a
  // dial changes. While paused, do NOT drain - the buffer keeps accumulating and
  // is rendered once the user resumes (no trades are discarded).
  useEffect(() => {
    if (streamPaused) {
      return undefined;
    }
    const drainTick = (): void => {
      const buffered = createBufferRef.current;
      if (buffered.length === 0) {
        return;
      }
      const slice = buffered.slice(0, streamMaxPerTick);
      createBufferRef.current = buffered.slice(streamMaxPerTick);
      useTradeStore.getState().addTradesBatch(slice);
    };
    const handle = window.setInterval(drainTick, streamIntervalMs);
    return () => window.clearInterval(handle);
  }, [streamMaxPerTick, streamIntervalMs, streamPaused]);
}
