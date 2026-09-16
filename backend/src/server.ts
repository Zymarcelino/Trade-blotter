/**
 * Server entry point - the application composition root. The single place where
 * every concrete implementation is constructed and injected. Reads config from
 * env, opens SQLite, runs migrations + seed, wires repository -> WS -> service,
 * shares one HTTP server between Fastify and the WebSocket upgrade, and listens.
 */
import { createServer, type Server as HttpServer } from 'node:http';

import { createConnection, runMigrations, seedIfEmpty, TradeRepository } from '@trade-blotter/database';
import { TradeService } from './services/trade.service';
import { attachWebSocketServer } from './websocket/server';
import { computeVwap, PriceFeed, startPriceFeed } from './marketdata/priceFeed';
import { buildApp } from './app';

const DEFAULT_DB_PATH = './data/trades.db';
const DEFAULT_PORT = 3000;
const LISTEN_HOST = '0.0.0.0';

export interface ServerConfig {
  dbPath: string;
  port: number;
  corsOrigin: string;
}

/** Reads and normalises server configuration from the environment. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dbPath = env.DB_PATH ?? DEFAULT_DB_PATH;
  const parsedPort = Number(env.PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;
  const corsOrigin = env.CORS_ORIGIN ?? '*';
  return { dbPath, port, corsOrigin };
}

/** Builds and starts the fully-wired application. */
export async function start(): Promise<HttpServer> {
  const { dbPath, port } = readConfig();

  const db = createConnection(dbPath);
  runMigrations(db);
  seedIfEmpty(db);

  const httpServer = createServer();

  const repo = new TradeRepository(db);
  const { broadcast } = attachWebSocketServer(httpServer);
  const service = new TradeService(repo, broadcast);

  const vwapPrices = computeVwap(repo.findAll());
  const priceFeed = new PriceFeed(vwapPrices);
  // Reconcile the price feed's symbol set each tick against the current ACTIVE
  // trades' VWAP, so a symbol introduced by a trade created after startup is
  // seeded and starts drifting (rather than showing a static price).
  const stopPriceFeed = startPriceFeed(broadcast, priceFeed, undefined, () =>
    computeVwap(repo.getActiveTrades()),
  );

  const app = await buildApp({
    service,
    getPrices: () => priceFeed.getPrices(),
    serverFactory: (handler) => {
      httpServer.on('request', handler as never);
      return httpServer;
    },
  });

  httpServer.on('close', stopPriceFeed);

  await app.listen({ port, host: LISTEN_HOST });
  app.log.info(`Trade blotter API listening on http://${LISTEN_HOST}:${port}`);
  app.log.info(`WebSocket endpoint available at ws://${LISTEN_HOST}:${port}/ws`);
  return httpServer;
}

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal: failed to start server', err);
    process.exit(1);
  });
}
