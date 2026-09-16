import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fc from 'fast-check';

import { tradeRoutes } from './trades';
import type { ITradeService } from '../types/trade.service.interface';
import { AppError } from '../utils/errors';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type PaginatedResult,
  type Trade,
} from '../types/trade.types';

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 500,
    price: 100,
    side: TradeSide.BUY,
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:00:00.000Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_UK',
    counterparty: 'Citi',
    ...over,
  };
}

const VALID_BODY = {
  symbol: 'AAPL', quantity: 500, price: 100.5, side: 'BUY',
  trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Citi',
};

/** Builds a Fastify app with a mocked service + the same error mapping as app.ts. */
async function buildTestApp(service: Partial<ITradeService>): Promise<FastifyInstance> {
  const full: ITradeService = {
    getAllTrades: vi.fn((): PaginatedResult<Trade> => ({ data: [], meta: { total: 0, page: 1, pageSize: 50 } })),
    getTradeById: vi.fn(() => makeTrade()),
    createTrade: vi.fn(() => makeTrade()),
    createRandomTrades: vi.fn(() => 1),
    amendTrade: vi.fn(() => makeTrade()),
    cancelTrade: vi.fn(() => makeTrade({ status: TradeStatus.CANCELLED })),
    getAuditHistory: vi.fn(() => []),
    getRecentAuditEntries: vi.fn(() => []),
    getPositionSummary: vi.fn(() => []),
    getPnlSummary: vi.fn(() => []),
    ...service,
  };
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  await app.register(cors, { origin: '*' });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, statusCode: error.statusCode },
      });
    }
    const e = error as { validation?: unknown; statusCode?: number; message?: string };
    if (e.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', statusCode: 500 },
    });
  });
  await app.register(tradeRoutes, { prefix: '/api/v1', service: full });
  await app.ready();
  return app;
}

describe('trade routes', () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = undefined as unknown as FastifyInstance;
  });

  it('GET /trades returns 200 with data + meta', async () => {
    const getAllTrades = vi.fn(() => ({ data: [makeTrade()], meta: { total: 1, page: 1, pageSize: 50 } }));
    app = await buildTestApp({ getAllTrades });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades?symbol=AAPL&page=2&pageSize=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(getAllTrades).toHaveBeenCalled();
    await app.close();
  });

  it('POST /trades returns 201 on a valid body', async () => {
    app = await buildTestApp({ createTrade: vi.fn(() => makeTrade()) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toBeDefined();
    await app.close();
  });

  it('POST /trades rejects invalid bodies with 400 VALIDATION_ERROR', async () => {
    app = await buildTestApp({});
    const bad = [
      { ...VALID_BODY, symbol: 'aapl' },
      { ...VALID_BODY, quantity: 0 },
      { ...VALID_BODY, quantity: -5 },
      { ...VALID_BODY, price: 0 },
      { ...VALID_BODY, side: 'HOLD' },
      { symbol: 'AAPL' },
      { ...VALID_BODY, bogus: 1 },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/trades', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    await app.close();
  });

  it('GET /trades/:id returns 404 when the service throws TRADE_NOT_FOUND', async () => {
    const getTradeById = vi.fn(() => {
      throw new AppError('TRADE_NOT_FOUND', 'nope', 404);
    });
    app = await buildTestApp({ getTradeById });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/TRD-999999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TRADE_NOT_FOUND');
    await app.close();
  });

  it('PATCH /trades/:id returns 409 when amending a cancelled trade', async () => {
    const amendTrade = vi.fn(() => {
      throw new AppError('TRADE_CANCELLED', 'cancelled', 409);
    });
    app = await buildTestApp({ amendTrade });
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/trades/TRD-100001', payload: { quantity: 3 } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TRADE_CANCELLED');
    await app.close();
  });

  it('DELETE /trades/:id returns 200 on cancel', async () => {
    app = await buildTestApp({ cancelTrade: vi.fn(() => makeTrade({ status: TradeStatus.CANCELLED })) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/trades/TRD-100001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('CANCELLED');
    await app.close();
  });

  it('GET /trades/:id/audit returns 200 with an array', async () => {
    app = await buildTestApp({ getAuditHistory: vi.fn(() => []) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/TRD-100001/audit' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
    await app.close();
  });

  // Feature: trade-blotter, Property 5: Pagination count invariant
  it('forwards any valid page/pageSize to the service', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 100 }),
        async (page, pageSize) => {
          const getAllTrades = vi.fn(() => ({ data: [], meta: { total: 0, page, pageSize } }));
          const a = await buildTestApp({ getAllTrades });
          const res = await a.inject({ method: 'GET', url: `/api/v1/trades?page=${page}&pageSize=${pageSize}` });
          expect(res.statusCode).toBe(200);
          const pag = (getAllTrades.mock.calls[0] as unknown[])[1];
          expect(pag).toEqual({ page, pageSize });
          await a.close();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: trade-blotter, Property 4: Filter correctness
  it('forwards any supplied filter combination to the service', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.option(fc.constantFrom('AAPL', 'MSFT'), { nil: undefined }),
          side: fc.option(fc.constantFrom('BUY', 'SELL'), { nil: undefined }),
          status: fc.option(fc.constantFrom('ACTIVE', 'CANCELLED'), { nil: undefined }),
        }),
        async (f) => {
          const getAllTrades = vi.fn(() => ({ data: [], meta: { total: 0, page: 1, pageSize: 50 } }));
          const a = await buildTestApp({ getAllTrades });
          const qs = Object.entries(f)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)
            .join('&');
          const res = await a.inject({ method: 'GET', url: `/api/v1/trades${qs ? '?' + qs : ''}` });
          expect(res.statusCode).toBe(200);
          const filters = (getAllTrades.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
          for (const [k, v] of Object.entries(f)) {
            if (v !== undefined) expect(filters[k]).toBe(v);
          }
          await a.close();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: trade-blotter, Property 7: Invalid input produces VALIDATION_ERROR
  it('any body missing a required field yields 400 VALIDATION_ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('symbol', 'quantity', 'price', 'side', 'trader', 'book', 'counterparty'),
        async (missing) => {
          const payload: Record<string, unknown> = { ...VALID_BODY };
          delete payload[missing];
          const a = await buildTestApp({});
          const res = await a.inject({ method: 'POST', url: '/api/v1/trades', payload });
          expect(res.statusCode).toBe(400);
          expect(res.json().error.code).toBe('VALIDATION_ERROR');
          await a.close();
        },
      ),
      { numRuns: 100 },
    );
  });
});
