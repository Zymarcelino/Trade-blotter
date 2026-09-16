/**
 * useTradeSocket — bridges the singleton WebSocket client to the Zustand store.
 *
 * Connects on mount and disconnects on unmount, and wires each server message
 * type to the matching store action:
 *  - TRADE_CREATED   -> addTrade(payload)
 *  - TRADE_AMENDED   -> updateTrade(payload)
 *  - TRADE_CANCELLED -> cancelTrade(payload.id)
 *  - PRICE_TICK      -> setMarketPrices(payload)
 *  - connection state -> setConnected(...)
 *
 * No full API refetch is triggered on any WS event. This hook is mounted once
 * at the app level so switching tabs never disconnects the live feed.
 */

import { useEffect } from 'react';

import { webSocketClient } from '../services/websocket.client';
import { useTradeStore } from '../store/trade.store';
import type { WsMessage } from '../types/trade.types';

export function useTradeSocket(): void {
  useEffect(() => {
    const unsubscribers: Array<() => void> = [
      webSocketClient.onConnectionChange((connected) => {
        useTradeStore.getState().setConnected(connected);
      }),
      webSocketClient.subscribe('TRADE_CREATED', (msg: WsMessage) => {
        if (msg.type === 'TRADE_CREATED') {
          useTradeStore.getState().addTrade(msg.payload);
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
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      webSocketClient.disconnect();
    };
  }, []);
}
