/**
 * Typed application error and error-code constants. Every error thrown from the
 * service and repository layers is an AppError so the global Fastify error
 * handler can return a consistent `{ error: { code, message, statusCode } }`.
 */

/** The set of typed error codes used across the backend. */
export const ERROR_CODES = {
  TRADE_NOT_FOUND: 'TRADE_NOT_FOUND',
  TRADE_CANCELLED: 'TRADE_CANCELLED',
  TRADE_ALREADY_CANCELLED: 'TRADE_ALREADY_CANCELLED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const TRADE_NOT_FOUND = ERROR_CODES.TRADE_NOT_FOUND;
export const TRADE_CANCELLED = ERROR_CODES.TRADE_CANCELLED;
export const TRADE_ALREADY_CANCELLED = ERROR_CODES.TRADE_ALREADY_CANCELLED;
export const VALIDATION_ERROR = ERROR_CODES.VALIDATION_ERROR;
export const INTERNAL_ERROR = ERROR_CODES.INTERNAL_ERROR;

/**
 * Typed error carrying a machine-readable `code`, a human-readable `message`,
 * an HTTP `statusCode`, and an optional underlying `cause`.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly cause?: unknown;
  public override readonly name = 'AppError';

  constructor(code: string, message: string, statusCode = 500, cause?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
