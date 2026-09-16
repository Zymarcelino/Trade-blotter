/**
 * WebSocket broadcast - fans out a {@link WsMessage} to every connected client.
 * Single responsibility: serialise and push to OPEN clients only; a per-client
 * send failure never blocks the rest.
 */
import { WebSocket, type WebSocketServer } from 'ws';
import type { WsMessage } from '../types/trade.types';

export type BroadcastFn = (message: WsMessage) => void;

/** Builds a {@link BroadcastFn} bound to the given server. */
export function createBroadcaster(wss: WebSocketServer): BroadcastFn {
  return (message: WsMessage): void => {
    const serialised = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }
      try {
        client.send(serialised);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('WebSocket broadcast: failed to send to a client', error);
      }
    }
  };
}
