/**
 * Trade HTTP routes - a Fastify plugin exposing the REST surface (mounted under
 * /api/v1 by the caller). Handlers parse, delegate to the injected
 * {@link ITradeService}, and shape the response. No business logic, no SQL.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  createTradeId,
  TradeSide,
  TradeStatus,
  type AmendTradeRequest,
  type ApiListResponse,
  type ApiResponse,
  type AuditEntry,
  type CreateTradeRequest,
  type PaginationParams,
  type Trade,
  type TradeFilters,
} from '../types/trade.types';
import type { ITradeService } from '../types/trade.service.interface';

export interface TradeRoutesOptions {
  service: ITradeService;
  getPrices?: () => Record<string, number>;
}

const fieldSchemas = {
  symbol: { type: 'string', minLength: 1, pattern: '^[A-Z]+$' },
  quantity: { type: 'integer', minimum: 1 },
  price: { type: 'number', exclusiveMinimum: 0 },
  side: { type: 'string', enum: [TradeSide.BUY, TradeSide.SELL] },
  trader: { type: 'string', minLength: 1 },
  book: { type: 'string', minLength: 1 },
  counterparty: { type: 'string', minLength: 1 },
  status: { type: 'string', enum: [TradeStatus.ACTIVE, TradeStatus.CANCELLED] },
} as const;

const createTradeBodySchema = {
  type: 'object',
  required: ['symbol', 'quantity', 'price', 'side', 'trader', 'book', 'counterparty'],
  additionalProperties: false,
  properties: {
    symbol: fieldSchemas.symbol,
    quantity: fieldSchemas.quantity,
    price: fieldSchemas.price,
    side: fieldSchemas.side,
    trader: fieldSchemas.trader,
    book: fieldSchemas.book,
    counterparty: fieldSchemas.counterparty,
  },
} as const;

const amendTradeBodySchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    symbol: fieldSchemas.symbol,
    quantity: fieldSchemas.quantity,
    price: fieldSchemas.price,
    side: fieldSchemas.side,
    trader: fieldSchemas.trader,
    book: fieldSchemas.book,
    counterparty: fieldSchemas.counterparty,
    status: fieldSchemas.status,
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } },
} as const;

const randomTradesBodySchema = {
  type: 'object',
  required: ['count'],
  properties: { count: { type: 'integer', minimum: 1, maximum: 10000 } },
} as const;

const auditFeedQuerySchema = {
  type: 'object',
  properties: { limit: { type: 'integer', minimum: 1, maximum: 1000 } },
} as const;

interface TradeQuery {
  symbol?: string;
  side?: string;
  status?: string;
  trader?: string;
  page?: string;
  pageSize?: string;
}

interface IdParams {
  id: string;
}

function parseFilters(query: TradeQuery): TradeFilters {
  const filters: TradeFilters = {};
  if (query.symbol !== undefined) filters.symbol = query.symbol;
  if (query.side !== undefined) filters.side = query.side as TradeFilters['side'];
  if (query.status !== undefined) filters.status = query.status as TradeFilters['status'];
  if (query.trader !== undefined) filters.trader = query.trader;
  return filters;
}

function parsePagination(query: TradeQuery): PaginationParams | undefined {
  if (query.page === undefined && query.pageSize === undefined) {
    return undefined;
  }
  return { page: toPositiveInt(query.page, 1), pageSize: toPositiveInt(query.pageSize, 50) };
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const tradeRoutes: FastifyPluginAsync<TradeRoutesOptions> = async (
  fastify: FastifyInstance,
  options: TradeRoutesOptions,
): Promise<void> => {
  const { service, getPrices } = options;

  fastify.get<{ Querystring: TradeQuery }>('/trades', async (request, reply): Promise<ApiListResponse<Trade>> => {
    const filters = parseFilters(request.query);
    const pagination = parsePagination(request.query);
    const result = service.getAllTrades(filters, pagination);
    reply.code(200);
    return { data: result.data, meta: result.meta };
  });

  fastify.post<{ Body: CreateTradeRequest }>(
    '/trades',
    { schema: { body: createTradeBodySchema } },
    async (request, reply): Promise<ApiResponse<Trade>> => {
      const created = service.createTrade(request.body);
      reply.code(201);
      return { data: created };
    },
  );

  fastify.post<{ Body: { count: number } }>(
    '/trades/random',
    { schema: { body: randomTradesBodySchema } },
    async (request, reply): Promise<ApiResponse<{ created: number }>> => {
      const created = service.createRandomTrades(request.body.count);
      reply.code(201);
      return { data: { created } };
    },
  );

  fastify.get<{ Params: IdParams }>(
    '/trades/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply): Promise<ApiResponse<Trade>> => {
      const trade = service.getTradeById(createTradeId(request.params.id));
      reply.code(200);
      return { data: trade };
    },
  );

  fastify.patch<{ Params: IdParams; Body: AmendTradeRequest }>(
    '/trades/:id',
    { schema: { params: idParamsSchema, body: amendTradeBodySchema } },
    async (request, reply): Promise<ApiResponse<Trade>> => {
      const updated = service.amendTrade(createTradeId(request.params.id), request.body);
      reply.code(200);
      return { data: updated };
    },
  );

  fastify.delete<{ Params: IdParams }>(
    '/trades/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply): Promise<ApiResponse<Trade>> => {
      const cancelled = service.cancelTrade(createTradeId(request.params.id));
      reply.code(200);
      return { data: cancelled };
    },
  );

  fastify.get<{ Params: IdParams }>(
    '/trades/:id/audit',
    { schema: { params: idParamsSchema } },
    async (request, reply): Promise<ApiListResponse<AuditEntry>> => {
      const entries = service.getAuditHistory(createTradeId(request.params.id));
      reply.code(200);
      return { data: entries, meta: { total: entries.length, page: 1, pageSize: entries.length } };
    },
  );

  fastify.get<{ Querystring: { limit?: number } }>(
    '/audit',
    { schema: { querystring: auditFeedQuerySchema } },
    async (request, reply): Promise<ApiListResponse<AuditEntry>> => {
      const entries = service.getRecentAuditEntries(request.query.limit);
      reply.code(200);
      return { data: entries, meta: { total: entries.length, page: 1, pageSize: entries.length } };
    },
  );

  fastify.get('/positions', async (_request, reply) => {
    const positions = service.getPositionSummary();
    reply.code(200);
    return { data: positions };
  });

  fastify.get('/pnl', async (_request, reply) => {
    const pnl = service.getPnlSummary();
    reply.code(200);
    return { data: pnl };
  });

  fastify.get('/prices', async (_request, reply): Promise<{ data: Record<string, number> }> => {
    reply.code(200);
    return { data: getPrices ? getPrices() : {} };
  });
};

export default tradeRoutes;
