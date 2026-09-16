/**
 * Frontend mirror of the backend domain model
 * (backend/src/types/trade.types.ts). This module is the single source of
 * truth for the trade domain on the client: branded IDs, const-object
 * enumerations (no `enum`), Readonly-friendly domain objects, derived DTOs, the
 * API response envelopes, and the server-to-client WebSocket message union.
 *
 * Kept field-for-field in sync with the backend so the same shapes flow over
 * the wire without translation.
 */

/** A nominal (branded) trade identifier in the format `TRD-XXXXXX`. */
export type TradeId = string & { readonly __brand: 'TradeId' };

/** Brands a raw string as a {@link TradeId}. The only sanctioned factory. */
export function createTradeId(raw: string): TradeId {
  return raw as TradeId;
}

/** The two sides a trade can take. */
export const TradeSide = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;
export type TradeSide = (typeof TradeSide)[keyof typeof TradeSide];

/** The lifecycle status of a trade. */
export const TradeStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

/** The canonical trade domain model. Handled as Readonly<Trade> downstream. */
export interface Trade {
  id: TradeId;
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  tradeDate: string;
  status: TradeStatus;
  book: string;
  counterparty: string;
}

/** Request body for creating a trade (server generates id/tradeDate/status). */
export type CreateTradeRequest = Omit<Trade, 'id' | 'tradeDate' | 'status'>;

/** Request body for amending a trade (id and tradeDate are immutable). */
export type AmendTradeRequest = Partial<Omit<Trade, 'id' | 'tradeDate'>>;

/** A single field-level change recorded against a trade. */
export interface AuditEntry {
  id: number;
  tradeId: TradeId;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: string;
}

/** Net-position aggregate for a single symbol (ACTIVE trades only). */
export interface PositionSummary {
  symbol: string;
  netQuantity: number;
  buyQuantity: number;
  sellQuantity: number;
  tradeCount: number;
}

/** Notional-based P&L aggregate for a single symbol (ACTIVE trades only). */
export interface PnlSummary {
  symbol: string;
  buyNotional: number;
  sellNotional: number;
  realizedPnl: number;
  netQuantity: number;
}

/** Filters accepted by `GET /api/v1/trades`. */
export interface TradeFilters {
  symbol?: string;
  side?: TradeSide;
  status?: TradeStatus;
  trader?: string;
}

/** Pagination input sent to `GET /api/v1/trades`. */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** Pagination metadata returned alongside a collection. */
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
}

/** Envelope for a single-resource success response. */
export interface ApiResponse<T> {
  data: T;
}

/** Envelope for a collection success response. */
export interface ApiListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Structured error response body. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    fields?: Record<string, string>;
  };
}

/** All server-to-client WebSocket messages, keyed on `type`. */
export type WsMessage =
  | { type: 'TRADE_CREATED'; payload: Readonly<Trade> }
  | { type: 'TRADE_AMENDED'; payload: Readonly<Trade> }
  | { type: 'TRADE_CANCELLED'; payload: { id: TradeId } }
  | { type: 'CONNECTION_ACK'; payload: { message: string } }
  | { type: 'PRICE_TICK'; payload: Record<string, number> };

/** The set of valid WebSocket message discriminants. */
export type WsMessageType = WsMessage['type'];
