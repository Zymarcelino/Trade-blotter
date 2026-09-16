/**
 * Singleton WebSocket client. One socket for the whole app lifetime, with
 * bounded exponential-backoff reconnect. WebSocket logic lives here (and in the
 * useTradeSocket hook), never inline in components.
 *
 * Behaviour (design 8.x):
 *  - Connects to `resolveWsUrl()` (config/env.ts is the single URL source).
 *  - On CONNECTION_ACK the store `isConnected` becomes true; on close/error it
 *    becomes false and a reconnect is scheduled.
 *  - Backoff: delay = min(1000 * 2^(n-1), 30000).
 *  - `subscribe(type, handler)` registers a per-message-type listener and
 *    returns an unsubscribe function for hooks.
 *  - Unknown message types are logged (console.warn) and never dispatched.
 */

import { resolveWsUrl } from '../config/env';
import type { WsMessage, WsMessageType } from '../types/trade.types';

/** Maximum backoff delay between reconnect attempts (ms). */
export const MAX_BACKOFF_MS = 30000;

/** Computes the reconnect delay for attempt `n` (1-based): min(1000*2^(n-1),30000). */
export function computeBackoffDelay(attempt: number): number {
  const n = Math.max(1, attempt);
  return Math.min(1000 * 2 ** (n - 1), MAX_BACKOFF_MS);
}

/** A handler invoked with a message of the subscribed type. */
export type WsMessageHandler = (message: WsMessage) => void;

/** A handler invoked when the connection state flips. */
export type ConnectionChangeHandler = (connected: boolean) => void;

/** The set of valid message discriminants for runtime validation. */
const VALID_TYPES: ReadonlySet<string> = new Set<WsMessageType>([
  'TRADE_CREATED',
  'TRADE_AMENDED',
  'TRADE_CANCELLED',
  'CONNECTION_ACK',
  'PRICE_TICK',
]);

/** Runtime guard: is this parsed value a well-formed WsMessage? */
function isWsMessage(value: unknown): value is WsMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const maybe = value as { type?: unknown };
  return typeof maybe.type === 'string' && VALID_TYPES.has(maybe.type);
}

/** The singleton WebSocket client. */
class WebSocketClient {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  private readonly handlers = new Map<WsMessageType, Set<WsMessageHandler>>();
  private readonly connectionHandlers = new Set<ConnectionChangeHandler>();

  /** Opens the socket if not already open/connecting. Idempotent. */
  public connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    this.manuallyClosed = false;
    this.open();
  }

  /** Closes the socket and cancels any pending reconnect. */
  public disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.notifyConnection(false);
  }

  /** Subscribes to a message type; returns an unsubscribe function. */
  public subscribe(type: WsMessageType, handler: WsMessageHandler): () => void {
    const set = this.handlers.get(type) ?? new Set<WsMessageHandler>();
    set.add(handler);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler);
    };
  }

  /** Subscribes to connection-state changes; returns an unsubscribe function. */
  public onConnectionChange(handler: ConnectionChangeHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  private open(): void {
    const socket = new WebSocket(resolveWsUrl());
    this.socket = socket;

    socket.onmessage = (event: MessageEvent): void => {
      this.handleRawMessage(event.data);
    };

    socket.onclose = (): void => {
      this.notifyConnection(false);
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = (): void => {
      this.notifyConnection(false);
      // The browser fires `close` after `error`; reconnect is scheduled there.
    };
  }

  private handleRawMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      console.warn('Ignoring non-JSON WebSocket frame');
      return;
    }
    if (!isWsMessage(parsed)) {
      console.warn('Ignoring unknown WebSocket message', parsed);
      return;
    }

    if (parsed.type === 'CONNECTION_ACK') {
      // A successful ack resets the backoff and marks us connected.
      this.attempt = 0;
      this.notifyConnection(true);
    }

    this.dispatch(parsed);
  }

  private dispatch(message: WsMessage): void {
    const set = this.handlers.get(message.type);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(message);
    }
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    const delay = computeBackoffDelay(this.attempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyClosed) {
        this.open();
      }
    }, delay);
  }

  private notifyConnection(connected: boolean): void {
    for (const handler of this.connectionHandlers) {
      handler(connected);
    }
  }
}

/** The shared singleton instance. */
export const webSocketClient = new WebSocketClient();
