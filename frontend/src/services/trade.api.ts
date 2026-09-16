/**
 * Trade-specific API functions. Each delegates to {@link fetchApi}; there is no
 * business logic here. Body-carrying requests (POST/PATCH) send a JSON body and
 * `Content-Type: application/json`; body-less requests (GET/DELETE) send no
 * content type, matching the backend's edge validation expectations.
 */

import { fetchApi } from './api.client';
import type {
  AmendTradeRequest,
  ApiListResponse,
  ApiResponse,
  AuditEntry,
  CreateTradeRequest,
  PaginationParams,
  PnlSummary,
  PositionSummary,
  Trade,
  TradeFilters,
  TradeId,
} from '../types/trade.types';

/** JSON headers for body-carrying requests. */
const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

/** Builds a query string from optional filters and pagination. */
function buildTradesQuery(
  filters?: TradeFilters,
  pagination?: PaginationParams,
): string {
  const params = new URLSearchParams();
  if (filters?.symbol) params.set('symbol', filters.symbol);
  if (filters?.side) params.set('side', filters.side);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.trader) params.set('trader', filters.trader);
  if (pagination) {
    params.set('page', String(pagination.page));
    params.set('pageSize', String(pagination.pageSize));
  }
  const qs = params.toString();
  return qs === '' ? '' : `?${qs}`;
}

/** GET /trades — paginated, optionally filtered list of trades. */
export function getTrades(
  filters?: TradeFilters,
  pagination?: PaginationParams,
): Promise<ApiListResponse<Trade>> {
  return fetchApi<ApiListResponse<Trade>>(
    `/trades${buildTradesQuery(filters, pagination)}`,
  );
}

/** GET /trades/:id — a single trade. */
export function getTradeById(id: TradeId): Promise<ApiResponse<Trade>> {
  return fetchApi<ApiResponse<Trade>>(`/trades/${encodeURIComponent(id)}`);
}

/** POST /trades — create a trade. */
export function createTrade(
  dto: CreateTradeRequest,
): Promise<ApiResponse<Trade>> {
  return fetchApi<ApiResponse<Trade>>('/trades', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(dto),
  });
}

/** PATCH /trades/:id — amend a trade. */
export function amendTrade(
  id: TradeId,
  dto: AmendTradeRequest,
): Promise<ApiResponse<Trade>> {
  return fetchApi<ApiResponse<Trade>>(`/trades/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(dto),
  });
}

/** DELETE /trades/:id — cancel a trade (soft status transition). */
export function cancelTrade(id: TradeId): Promise<ApiResponse<Trade>> {
  return fetchApi<ApiResponse<Trade>>(`/trades/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** GET /trades/:id/audit — amendment history for a trade, newest first. */
export function getAuditHistory(
  id: TradeId,
): Promise<ApiListResponse<AuditEntry>> {
  return fetchApi<ApiListResponse<AuditEntry>>(
    `/trades/${encodeURIComponent(id)}/audit`,
  );
}

/** GET /audit — global audit feed, newest first. */
export function getAuditFeed(): Promise<ApiListResponse<AuditEntry>> {
  return fetchApi<ApiListResponse<AuditEntry>>('/audit');
}

/** GET /positions — net-position aggregates by symbol. */
export function getPositions(): Promise<ApiResponse<PositionSummary[]>> {
  return fetchApi<ApiResponse<PositionSummary[]>>('/positions');
}

/** GET /pnl — notional-based P&L aggregates by symbol. */
export function getPnl(): Promise<ApiResponse<PnlSummary[]>> {
  return fetchApi<ApiResponse<PnlSummary[]>>('/pnl');
}

/** GET /prices — the latest simulated market prices by symbol. */
export function getMarketPrices(): Promise<ApiResponse<Record<string, number>>> {
  return fetchApi<ApiResponse<Record<string, number>>>('/prices');
}

/** POST /trades/random — bulk-create random trades on the server. */
export function addRandomTrades(
  count: number,
): Promise<ApiResponse<{ created: number }>> {
  return fetchApi<ApiResponse<{ created: number }>>('/trades/random', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ count }),
  });
}
