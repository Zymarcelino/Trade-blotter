/**
 * WebSocket server setup - attaches a `ws` server to an existing Node HTTP
 * server. Upgrades only `/ws`, acks new connections, wires per-socket handlers.
 * Contains no trade logic; fan-out lives in {@link ./broadcast}.
 */
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { WsMessage } from '../types/trade.types';
import { createBroadcaster, type BroadcastFn } from './broadcast';

const WS_PATH = '/ws';

const CONNECTION_ACK: Extract<WsMessage, { type: 'CONNECTION_ACK' }> = {
  type: 'CONNECTION_ACK',
  payload: { message: 'Connected' },
};

function requestPathname(req: IncomingMessage): string {
  const rawUrl = req.url ?? '/';
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * Creates a WebSocket server in `noServer` mode attached to the HTTP server's
 * `upgrade` event. Only `/ws` is accepted; others get 404. Each connection gets
 * a {@link CONNECTION_ACK}.
 */
export function attachWebSocketServer(server: HttpServer): {
  wss: WebSocketServer;
  broadcast: BroadcastFn;
} {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (requestPathname(req) !== WS_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit('connection', client, req);
    });
  });

  wss.on('connection', (client: WebSocket) => {
    try {
      client.send(JSON.stringify(CONNECTION_ACK));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('WebSocket server: failed to send CONNECTION_ACK', error);
    }

    client.on('message', () => {
      /* no-op: server-to-client channel only */
    });
    client.on('close', () => {
      /* no-op: ws removes the socket from wss.clients automatically */
    });
    client.on('error', (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('WebSocket server: client socket error', error);
    });
  });

  return { wss, broadcast: createBroadcaster(wss) };
}
