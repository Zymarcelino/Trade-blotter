import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app';
import type { ITradeService } from './types/trade.service.interface';
import { AppError } from './utils/errors';
import { TradeStatus, createTradeId, type Trade } from './types/trade.types';

function makeTrade(): Trade {
  return {
    id: createTradeId('TRD-100001'),
    symbol: 'AAPL',
    quantity: 500,
    price: 100,
    side: 'BUY',
    trader: 'JSMITH',
    tradeDate: '2026-08-18T10:00:00.000Z',
    status: TradeStatus.ACTIVE,
    book: 'EQUITIES_UK',
    counterparty: 'Citi',
  } as Trade;
}

function makeService(over: Partial<ITradeService> = {}): ITradeService {
  return {
    getAllTrades: vi.fn(() => ({ data: [], meta: { total: 0, page: 1, pageSize: 50 } })),
    getTradeById: vi.fn(() => makeTrade()),
    createTrade: vi.fn(() => makeTrade()),
    createRandomTrades: vi.fn(() => 1),
    amendTrade: vi.fn(() => makeTrade()),
    cancelTrade: vi.fn(() => makeTrade()),
    getAuditHistory: vi.fn(() => []),
    getRecentAuditEntries: vi.fn(() => []),
    getPositionSummary: vi.fn(() => []),
    getPnlSummary: vi.fn(() => []),
    ...over,
  };
}

describe('buildApp error handling', () => {
  it('maps an AppError to its status code and structured body', async () => {
    const service = makeService({
      getTradeById: vi.fn(() => {
        throw new AppError('TRADE_NOT_FOUND', 'nope', 404);
      }),
    });
    const app: FastifyInstance = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/TRD-999999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'TRADE_NOT_FOUND', statusCode: 404 });
    await app.close();
  });

  it('maps an unexpected error to a generic 500 INTERNAL_ERROR without leaking details', async () => {
    const service = makeService({
      getAllTrades: vi.fn(() => {
        throw new Error('secret internal detail');
      }),
    });
    const app: FastifyInstance = await buildApp({ service });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
    await app.close();
  });

  it('maps a schema validation failure to 400 VALIDATION_ERROR', async () => {
    const app: FastifyInstance = await buildApp({ service: makeService() });
    const res = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: { symbol: 'aapl' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});
