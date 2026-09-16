/**
 * Service-layer contract for the trade domain (Dependency Inversion).
 * Interface-only module - no runtime code, no `any`.
 */
import type {
  AmendTradeRequest,
  AuditEntry,
  CreateTradeRequest,
  PaginatedResult,
  PaginationParams,
  PnlSummary,
  PositionSummary,
  Trade,
  TradeFilters,
  TradeId,
} from './trade.types';

export interface ITradeService {
  getAllTrades(filters?: TradeFilters, pagination?: PaginationParams): PaginatedResult<Trade>;
  getTradeById(id: TradeId): Trade;
  createTrade(dto: CreateTradeRequest): Trade;
  createRandomTrades(count: number): number;
  amendTrade(id: TradeId, dto: AmendTradeRequest): Trade;
  cancelTrade(id: TradeId): Trade;
  getAuditHistory(id: TradeId): AuditEntry[];
  getRecentAuditEntries(limit?: number): AuditEntry[];
  getPositionSummary(): PositionSummary[];
  getPnlSummary(): PnlSummary[];
}
