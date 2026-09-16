/**
 * Fastify application factory. Constructs and configures the FastifyInstance
 * (schema validation, CORS, global error handler, trade routes) but never calls
 * listen(). Receives an {@link ITradeService} abstraction (Dependency Inversion).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Server as HttpServer } from 'node:http';

import { tradeRoutes } from './routes/trades';
import { AppError, INTERNAL_ERROR, VALIDATION_ERROR } from './utils/errors';
import type { ITradeService } from './types/trade.service.interface';

const API_PREFIX = '/api/v1';
const SERVER_ERROR_THRESHOLD = 500;

/** Options for {@link buildApp}. */
export interface BuildAppOptions {
  service: ITradeService;
  getPrices?: () => Record<string, number>;
  serverFactory?: (handler: (req: unknown, res: unknown) => void) => HttpServer;
}

interface ValidationErrorItem {
  instancePath?: string;
  message?: string;
  params?: { missingProperty?: string } | Record<string, unknown>;
}

function toFieldErrors(validation: ValidationErrorItem[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const entry of validation) {
    const instancePath = entry.instancePath ?? '';
    const missingProperty =
      typeof entry.params === 'object' && entry.params !== null
        ? (entry.params as { missingProperty?: string }).missingProperty
        : undefined;
    const field =
      instancePath.length > 0
        ? instancePath.replace(/^\//, '').replace(/\//g, '.')
        : missingProperty ?? instancePath;
    fields[field] = entry.message ?? 'Invalid value';
  }
  return fields;
}

/** Builds a fully-configured Fastify instance. Does not call listen(). */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { service, getPrices, serverFactory } = options;

  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
    ...(serverFactory ? { serverFactory: serverFactory as never } : {}),
  });

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? '*' });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof AppError) {
      logByStatus(app, error, error.statusCode);
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, statusCode: error.statusCode },
      });
    }

    const err = error as {
      validation?: ValidationErrorItem[];
      statusCode?: number;
      code?: string;
      message?: string;
    };

    if (err.validation) {
      const statusCode = 400;
      app.log.warn({ code: VALIDATION_ERROR, statusCode, err }, 'Request validation failed');
      return reply.status(statusCode).send({
        error: {
          code: VALIDATION_ERROR,
          message: 'Request validation failed',
          statusCode,
          fields: toFieldErrors(err.validation),
        },
      });
    }

    const explicitStatus = err.statusCode;
    if (typeof explicitStatus === 'number' && explicitStatus < SERVER_ERROR_THRESHOLD) {
      logByStatus(app, err, explicitStatus);
      return reply.status(explicitStatus).send({
        error: {
          code: err.code ?? VALIDATION_ERROR,
          message: err.message ?? 'Request error',
          statusCode: explicitStatus,
        },
      });
    }

    app.log.error({ err }, 'Unexpected error');
    return reply.status(500).send({
      error: { code: INTERNAL_ERROR, message: 'An unexpected error occurred', statusCode: 500 },
    });
  });

  await app.register(tradeRoutes, { prefix: API_PREFIX, service, getPrices });
  return app;
}

function logByStatus(app: FastifyInstance, error: unknown, statusCode: number): void {
  if (statusCode >= SERVER_ERROR_THRESHOLD) {
    app.log.error({ err: error, statusCode }, 'Server error');
  } else {
    app.log.warn({ err: error, statusCode }, 'Client error');
  }
}

export default buildApp;
