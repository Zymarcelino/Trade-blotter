/**
 * Trade domain business logic. Orchestrates the repository and the WebSocket
 * broadcast. Single home for business rules; contains no SQL and no HTTP
 * parsing. Broadcasts follow commit-then-log-and-continue (no rollback on
 * broadcast failure).
 */
import type { ITradeRepository } from '../types/trade.repository.interface';
import type { ITradeService } from '../types/trade.service.interface';
import type { BroadcastFn } from '../websocket/broadcast';
import { diffTrade } from '../utils/diffTrade';
import { SEED_SYMBOLS, SEED_TRADERS, SEED_BOOKS, SEED_COUNTERPARTIES } from '@trade-blotter/database';
import {
  AppError,
  TRADE_ALREADY_CANCELLED,
  TRADE_CANCELLED,
  TRADE_NOT_FOUND,
} from '../utils/errors';
import {
  TradeSide,
  TradeStatus,
  type AmendTradeRequest,
  type AuditEntry,
  type CreateTradeRequest,
  type PaginatedResult,
  type PaginationParams,
  type PnlSummary,
  type PositionSummary,
  type Trade,
  type TradeFilters,
  type TradeId,
} from '../types/trade.types';

/** Minimal logging abstraction (Interface Segregation). */
export interface Logger {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

const consoleLogger: Logger = {
  // eslint-disable-next-line no-console
  warn: (...args: unknown[]): void => console.warn(...args),
  // eslint-disable-next-line no-console
  error: (...args: unknown[]): void => console.error(...args),
};

const DEFAULT_AUDIT_FEED_LIMIT = 200;
const MAX_RANDOM_TRADES = 10000;

export class TradeService implements ITradeService {
  constructor(
    private readonly repo: ITradeRepository,
    private readonly broadcast: BroadcastFn,
    private readonly logger: Logger = consoleLogger,
  ) {}

  getAllTrades(filters?: TradeFilters, pagination?: PaginationParams): PaginatedResult<Trade> {
    const page = pagination?.page ?? DEFAULT_PAGE;
    const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;

    const all = this.repo.findAll(filters);
    const start = (page - 1) * pageSize;
    const data = all.slice(start, start + pageSize);

    return { data, meta: { total: all.length, page, pageSize } };
  }

  getTradeById(id: TradeId): Trade {
    return this.requireTrade(id);
  }

  getAuditHistory(id: TradeId): AuditEntry[] {
    this.requireTrade(id);
    return this.repo.findAuditHistory(id);
  }

  getRecentAuditEntries(limit?: number): AuditEntry[] {
    const cap =
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0
        ? limit
        : DEFAULT_AUDIT_FEED_LIMIT;
    return this.repo.findAllAuditEntries(cap);
  }

  getPositionSummary(): PositionSummary[] {
    const active = this.repo.getActiveTrades();
    const bySymbol = new Map<string, PositionSummary>();

    for (const trade of active) {
      const summary = bySymbol.get(trade.symbol) ?? {
        symbol: trade.symbol,
        netQuantity: 0,
        buyQuantity: 0,
        sellQuantity: 0,
        tradeCount: 0,
      };
      if (trade.side === TradeSide.BUY) {
        summary.buyQuantity += trade.quantity;
        summary.netQuantity += trade.quantity;
      } else {
        summary.sellQuantity += trade.quantity;
        summary.netQuantity -= trade.quantity;
      }
      summary.tradeCount += 1;
      bySymbol.set(trade.symbol, summary);
    }

    return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  getPnlSummary(): PnlSummary[] {
    const active = this.repo.getActiveTrades();

    interface PnlAccumulator {
      symbol: string;
      buyNotional: number;
      sellNotional: number;
      netQuantity: number;
    }

    const bySymbol = new Map<string, PnlAccumulator>();

    for (const trade of active) {
      const acc = bySymbol.get(trade.symbol) ?? {
        symbol: trade.symbol,
        buyNotional: 0,
        sellNotional: 0,
        netQuantity: 0,
      };
      const notional = trade.price * trade.quantity;
      if (trade.side === TradeSide.BUY) {
        acc.buyNotional += notional;
        acc.netQuantity += trade.quantity;
      } else {
        acc.sellNotional += notional;
        acc.netQuantity -= trade.quantity;
      }
      bySymbol.set(trade.symbol, acc);
    }

    return [...bySymbol.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((acc) => ({
        symbol: acc.symbol,
        buyNotional: this.round2(acc.buyNotional),
        sellNotional: this.round2(acc.sellNotional),
        realizedPnl: this.round2(acc.sellNotional - acc.buyNotional),
        netQuantity: acc.netQuantity,
      }));
  }

  createTrade(dto: CreateTradeRequest): Trade {
    const created = this.repo.create(dto);
    this.safeBroadcast({ type: 'TRADE_CREATED', payload: created }, created.id);
    return created;
  }

  createRandomTrades(count: number): number {
    const n = Math.max(1, Math.min(Math.floor(count), MAX_RANDOM_TRADES));
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;
    for (let i = 0; i < n; i += 1) {
      this.createTrade({
        symbol: pick(SEED_SYMBOLS),
        side: Math.random() < 0.5 ? TradeSide.BUY : TradeSide.SELL,
        quantity: Math.floor(Math.random() * 9901) + 100,
        price: Math.round((Math.random() * 990 + 10) * 100) / 100,
        trader: pick(SEED_TRADERS),
        book: pick(SEED_BOOKS),
        counterparty: pick(SEED_COUNTERPARTIES),
      });
    }
    return n;
  }

  amendTrade(id: TradeId, dto: AmendTradeRequest): Trade {
    const current = this.requireTrade(id);
    if (current.status === TradeStatus.CANCELLED) {
      throw this.warnAndBuild(
        TRADE_CANCELLED,
        `Trade ${id} is cancelled and cannot be amended`,
        409,
      );
    }
    const auditEntries = diffTrade(current, dto);
    const updated = this.repo.update(id, dto, auditEntries);
    this.safeBroadcast({ type: 'TRADE_AMENDED', payload: updated }, updated.id);
    return updated;
  }

  cancelTrade(id: TradeId): Trade {
    const current = this.requireTrade(id);
    if (current.status === TradeStatus.CANCELLED) {
      throw this.warnAndBuild(TRADE_ALREADY_CANCELLED, `Trade ${id} is already cancelled`, 409);
    }
    const cancelled = this.repo.cancel(id);
    this.safeBroadcast({ type: 'TRADE_CANCELLED', payload: { id } }, id);
    return cancelled;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private requireTrade(id: TradeId): Trade {
    const trade = this.repo.findById(id);
    if (trade === null) {
      throw this.warnAndBuild(TRADE_NOT_FOUND, `Trade ${id} does not exist`, 404);
    }
    return trade;
  }

  private warnAndBuild(code: string, message: string, statusCode: number): AppError {
    this.logger.warn({ code, statusCode }, message);
    return new AppError(code, message, statusCode);
  }

  private safeBroadcast(message: Parameters<BroadcastFn>[0], tradeId: TradeId): void {
    try {
      this.broadcast(message);
    } catch (err) {
      this.logger.error({ err, tradeId, type: message.type }, `${message.type} broadcast failed`);
    }
  }
}
