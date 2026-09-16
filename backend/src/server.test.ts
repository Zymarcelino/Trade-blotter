import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { readConfig } from './server';
import { runMigrations } from './db/migrations';
import { seedIfEmpty } from './db/seed';
import { TradeRepository } from './db/trade.repository';
import { TradeService } from './services/trade.service';
import { buildApp } from './app';
import type { FastifyInstance } from 'fastify';

describe('readConfig', () => {
  it('applies defaults when env is empty', () => {
    const cfg = readConfig({});
    expect(cfg.dbPath).toBe('./data/trades.db');
    expect(cfg.port).toBe(3000);
    expect(cfg.corsOrigin).toBe('*');
  });

  it('honours env overrides', () => {
    const cfg = readConfig({ DB_PATH: '/data/x.db', PORT: '8080', CORS_ORIGIN: 'http://localhost:80' });
    expect(cfg.dbPath).toBe('/data/x.db');
    expect(cfg.port).toBe(8080);
    expect(cfg.corsOrigin).toBe('http://localhost:80');
  });

  it('falls back to the default port for a non-numeric PORT', () => {
    expect(readConfig({ PORT: 'abc' }).port).toBe(3000);
  });
});

describe('full-stack smoke (in-memory, no listen)', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('runs a create -> get -> amend -> cancel -> audit round trip', async () => {
    const db = new Database(':memory:');
    runMigrations(db);
    seedIfEmpty(db);
    const repo = new TradeRepository(db);
    const service = new TradeService(repo, () => undefined, { warn: () => undefined, error: () => undefined });
    app = await buildApp({ service });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      payload: { symbol: 'AAPL', quantity: 100, price: 50, side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Citi' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const got = await app.inject({ method: 'GET', url: `/api/v1/trades/${id}` });
    expect(got.statusCode).toBe(200);

    const amended = await app.inject({ method: 'PATCH', url: `/api/v1/trades/${id}`, payload: { quantity: 200 } });
    expect(amended.statusCode).toBe(200);
    expect(amended.json().data.quantity).toBe(200);

    const cancelled = await app.inject({ method: 'DELETE', url: `/api/v1/trades/${id}` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe('CANCELLED');

    const audit = await app.inject({ method: 'GET', url: `/api/v1/trades/${id}/audit` });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().data.length).toBeGreaterThanOrEqual(1);

    db.close();
  });
});
