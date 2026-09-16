import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';

import { attachWebSocketServer } from './server';

/** Starts a real HTTP server on an ephemeral port with the WS server attached. */
function startServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    attachWebSocketServer(server);
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, port });
    });
  });
}

describe('attachWebSocketServer', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  // Feature: trade-blotter, Property 15: CONNECTION_ACK sent to every new client
  it('sends CONNECTION_ACK with payload.message "Connected" as the first message', async () => {
    const started = await startServer();
    server = started.server;

    const firstMessage = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${started.port}/ws`);
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('message', (data) => {
        clearTimeout(timer);
        resolve(data.toString());
        ws.close();
      });
      ws.on('error', reject);
    });

    const parsed = JSON.parse(firstMessage) as { type: string; payload: { message: string } };
    expect(parsed.type).toBe('CONNECTION_ACK');
    expect(parsed.payload.message).toBe('Connected');
  });

  it('rejects a non-/ws upgrade with a 404 (no open connection)', async () => {
    const started = await startServer();
    server = started.server;

    const result = await new Promise<'closed' | 'open'>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${started.port}/nope`);
      const timer = setTimeout(() => resolve('open'), 3000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve('open');
        ws.close();
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve('closed');
      });
    });

    expect(result).toBe('closed');
  });
});
