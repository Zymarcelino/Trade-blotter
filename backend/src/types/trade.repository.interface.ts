/**
 * Repository contract for the trade domain (Dependency Inversion).
 * Implementations must be fully substitutable (Liskov). No `any`.
 */
import type {
  AuditEntry,
  AuditInsert,
  NewTrade,
  Trade,
  TradeFilters,
  TradeId,
} from './trade.types';

export interface ITradeRepository {
  findAll(filters?: TradeFilters): Trade[];
  findById(id: TradeId): Trade | null;
  create(trade: NewTrade): Trade;
  update(id: TradeId, fields: Partial<Trade>, auditEntries: AuditInsert[]): Trade;
  cancel(id: TradeId): Trade;
  findAuditHistory(tradeId: TradeId): AuditEntry[];
  findAllAuditEntries(limit: number): AuditEntry[];
  getActiveTrades(): Trade[];
}
