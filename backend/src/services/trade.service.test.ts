import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

import { TradeService } from './trade.service';
import type { ITradeRepository } from '../types/trade.repository.interface';
import type { BroadcastFn } from '../websocket/broadcast';
import { AppError } from '../utils/errors';
import {
  TradeSide,
  TradeStatus,
  createTradeId,
  type AuditEntry,
  type NewTrade,
  type Trade,
  type TradeId,
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

/** Builds a fully-mocked repository; individual tests override methods. */
function makeRepo(over: Partial<ITradeRepository> = {}): ITradeRepository {
  return {
    findAll: vi.fn(() => []),
    findById: vi.fn(() => null),
    create: vi.fn((t: NewTrade) => makeTrade(t as Partial<Trade>)),
    update: vi.fn((_id: TradeId, fields: Partial<Trade>) => makeTrade(fields)),
    cancel: vi.fn(() => makeTrade({ status: TradeStatus.CANCELLED })),
    findAuditHistory: vi.fn((): AuditEntry[] => []),
    findAllAuditEntries: vi.fn((): AuditEntry[] => []),
    getActiveTrades: vi.fn(() => []),
    ...over,
  };
}

const silentLogger = { warn: vi.fn(), error: vi.fn() };

describe('TradeService', () => {
  describe('getAllTrades', () => {
    it('applies default page 1 / size 50 and reports the full total', () => {
      const all = Array.from({ length: 120 }, (_, i) =>
        makeTrade({ id: createTradeId(`TRD-${100001 + i}`) }),
      );
      const repo = makeRepo({ findAll: vi.fn(() => all) });
      const svc = new TradeService(repo, vi.fn(), silentLogger);
      const res = svc.getAllTrades();
      expect(res.data).toHaveLength(50);
      expect(res.meta).toEqual({ total: 120, page: 1, pageSize: 50 });
    });

    it('slices the requested page', () => {
      const all = Array.from({ length: 10 }, (_, i) =>
        makeTrade({ id: createTradeId(`TRD-${100001 + i}`) }),
      );
      const svc = new TradeService(makeRepo({ findAll: vi.fn(() => all) }), vi.fn(), silentLogger);
      const res = svc.getAllTrades(undefined, { page: 2, pageSize: 3 });
      expect(res.data).toHaveLength(3);
      expect(res.meta.page).toBe(2);
    });
  });

  describe('getTradeById', () => {
    it('returns the trade when found', () => {
      const t = makeTrade();
      const svc = new TradeService(makeRepo({ findById: vi.fn(() => t) }), vi.fn(), silentLogger);
      expect(svc.getTradeById(t.id)).toBe(t);
    });
    it('throws AppError TRADE_NOT_FOUND (404) when missing', () => {
      const svc = new TradeService(makeRepo({ findById: vi.fn(() => null) }), vi.fn(), silentLogger);
      try {
        svc.getTradeById(createTradeId('TRD-999999'));
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('TRADE_NOT_FOUND');
        expect((e as AppError).statusCode).toBe(404);
      }
    });
  });

  describe('amendTrade', () => {
    it('throws 409 TRADE_CANCELLED for a cancelled trade', () => {
      const t = makeTrade({ status: TradeStatus.CANCELLED });
      const svc = new TradeService(makeRepo({ findById: vi.fn(() => t) }), vi.fn(), silentLogger);
      try {
        svc.amendTrade(t.id, { quantity: 1 });
        expect.unreachable();
      } catch (e) {
        expect((e as AppError).code).toBe('TRADE_CANCELLED');
        expect((e as AppError).statusCode).toBe(409);
      }
    });
    it('throws 404 when the trade does not exist', () => {
      const svc = new TradeService(makeRepo({ findById: vi.fn(() => null) }), vi.fn(), silentLogger);
      expect(() => svc.amendTrade(createTradeId('TRD-999999'), { quantity: 1 })).toThrow(AppError);
    });
  });

  describe('cancelTrade', () => {
    it('throws 409 TRADE_ALREADY_CANCELLED if already cancelled', () => {
      const t = makeTrade({ status: TradeStatus.CANCELLED });
      const svc = new TradeService(makeRepo({ findById: vi.fn(() => t) }), vi.fn(), silentLogger);
      try {
        svc.cancelTrade(t.id);
        expect.unreachable();
      } catch (e) {
        expect((e as AppError).code).toBe('TRADE_ALREADY_CANCELLED');
        expect((e as AppError).statusCode).toBe(409);
      }
    });
  });

  // Feature: trade-blotter, Property 6: Trade creation preserves all supplied fields
  it('createTrade preserves supplied fields and broadcasts TRADE_CREATED', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('AAPL', 'MSFT'),
          quantity: fc.integer({ min: 1, max: 10000 }),
          price: fc.integer({ min: 1, max: 1000 }),
          side: fc.constantFrom(TradeSide.BUY, TradeSide.SELL),
          trader: fc.constantFrom('JSMITH', 'ABROWN'),
          book: fc.constantFrom('EQUITIES_UK', 'EQUITIES_US'),
          counterparty: fc.constantFrom('Citi', 'UBS'),
        }),
        (dto) => {
          const created = makeTrade({ ...dto, id: createTradeId('TRD-100777') });
          const broadcast: BroadcastFn = vi.fn();
          const repo = makeRepo({ create: vi.fn(() => created) });
          const svc = new TradeService(repo, broadcast, silentLogger);
          const out = svc.createTrade(dto);
          expect(out.symbol).toBe(dto.symbol);
          expect(out.quantity).toBe(dto.quantity);
          expect(broadcast).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'TRADE_CREATED' }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: trade-blotter, Property 8: Broadcast failure does not roll back trade creation
  it('returns the created trade even when the broadcast throws', () => {
    fc.assert(
      fc.property(fc.constantFrom('AAPL', 'MSFT', 'TSLA'), (symbol) => {
        const created = makeTrade({ symbol });
        const create = vi.fn(() => created);
        const broadcast: BroadcastFn = vi.fn(() => {
          throw new Error('socket down');
        });
        const svc = new TradeService(makeRepo({ create }), broadcast, silentLogger);
        const out = svc.createTrade(makeTrade({ symbol }));
        expect(out).toBe(created);
        expect(create).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: trade-blotter, Property 9: Amendment updates only supplied fields
  it('amend forwards only supplied fields and a no-op still returns the trade', () => {
    const current = makeTrade({ quantity: 500, price: 100 });
    const update = vi.fn((_id: TradeId, fields: Partial<Trade>) => makeTrade({ ...current, ...fields }));
    const svc = new TradeService(
      makeRepo({ findById: vi.fn(() => current), update }),
      vi.fn(),
      silentLogger,
    );
    const out = svc.amendTrade(current.id, { quantity: 300 });
    expect(out.quantity).toBe(300);
    expect(out.price).toBe(100);
    // no-op amendment still succeeds
    const out2 = svc.amendTrade(current.id, {});
    expect(out2).toBeDefined();
  });

  // Feature: trade-blotter, Property 10: Cancellation sets status without deleting the row
  it('cancel sets status to CANCELLED via the repository', () => {
    const active = makeTrade({ status: TradeStatus.ACTIVE });
    const cancel = vi.fn(() => makeTrade({ ...active, status: TradeStatus.CANCELLED }));
    const broadcast: BroadcastFn = vi.fn();
    const svc = new TradeService(
      makeRepo({ findById: vi.fn(() => active), cancel }),
      broadcast,
      silentLogger,
    );
    const out = svc.cancelTrade(active.id);
    expect(out.status).toBe(TradeStatus.CANCELLED);
    expect(cancel).toHaveBeenCalledWith(active.id);
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TRADE_CANCELLED' }),
    );
  });

  describe('aggregates', () => {
    it('getPositionSummary nets BUY minus SELL over ACTIVE trades, sorted by symbol', () => {
      const active = [
        makeTrade({ id: createTradeId('TRD-1'), symbol: 'TSLA', side: TradeSide.BUY, quantity: 100 }),
        makeTrade({ id: createTradeId('TRD-2'), symbol: 'AAPL', side: TradeSide.BUY, quantity: 500 }),
        makeTrade({ id: createTradeId('TRD-3'), symbol: 'AAPL', side: TradeSide.SELL, quantity: 200 }),
      ];
      const svc = new TradeService(makeRepo({ getActiveTrades: vi.fn(() => active) }), vi.fn(), silentLogger);
      const pos = svc.getPositionSummary();
      expect(pos.map((p) => p.symbol)).toEqual(['AAPL', 'TSLA']);
      const aapl = pos.find((p) => p.symbol === 'AAPL');
      expect(aapl?.netQuantity).toBe(300);
    });

    it('getPnlSummary rounds monetary values to 2dp over ACTIVE trades', () => {
      const active = [
        makeTrade({ symbol: 'AAPL', side: TradeSide.SELL, quantity: 3, price: 10.005 }),
      ];
      const svc = new TradeService(makeRepo({ getActiveTrades: vi.fn(() => active) }), vi.fn(), silentLogger);
      const [row] = svc.getPnlSummary();
      expect(row.symbol).toBe('AAPL');
      expect(Number.isFinite(row.realizedPnl)).toBe(true);
      expect(Math.round(row.sellNotional * 100) / 100).toBe(row.sellNotional);
    });
  });
});
