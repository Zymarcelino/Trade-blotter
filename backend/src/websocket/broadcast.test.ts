import { describe, it, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import fc from 'fast-check';

import { createBroadcaster } from './broadcast';
import type { WsMessage } from '../types/trade.types';

/** A fake ws client with a controllable readyState and a spy send(). */
function fakeClient(readyState: number) {
  return { readyState, send: vi.fn() };
}

/** Wraps a set of fake clients as a minimal WebSocketServer-like object. */
function serverWith(clients: ReturnType<typeof fakeClient>[]) {
  return { clients: new Set(clients) } as unknown as import('ws').WebSocketServer;
}

const MSG: WsMessage = { type: 'TRADE_CANCELLED', payload: { id: 'TRD-1' as never } };

describe('createBroadcaster', () => {
  it('sends the serialised message to every OPEN client', () => {
    const a = fakeClient(WebSocket.OPEN);
    const b = fakeClient(WebSocket.OPEN);
    createBroadcaster(serverWith([a, b]))(MSG);
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(MSG));
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(MSG));
  });

  it('skips clients that are not OPEN', () => {
    const open = fakeClient(WebSocket.OPEN);
    const closing = fakeClient(WebSocket.CLOSING);
    createBroadcaster(serverWith([open, closing]))(MSG);
    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closing.send).not.toHaveBeenCalled();
  });

  it('a per-client send failure does not stop delivery to others', () => {
    const bad = fakeClient(WebSocket.OPEN);
    bad.send.mockImplementation(() => {
      throw new Error('send failed');
    });
    const good = fakeClient(WebSocket.OPEN);
    // eslint-disable-next-line no-console
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => createBroadcaster(serverWith([bad, good]))(MSG)).not.toThrow();
    expect(good.send).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  // Feature: trade-blotter, Property 18: Broadcast reaches all connected clients
  it('delivers to all N OPEN clients for any N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => {
        const clients = Array.from({ length: n }, () => fakeClient(WebSocket.OPEN));
        createBroadcaster(serverWith(clients))(MSG);
        for (const c of clients) {
          expect(c.send).toHaveBeenCalledTimes(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
