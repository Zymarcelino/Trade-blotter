import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  AppError,
  ERROR_CODES,
  TRADE_NOT_FOUND,
  TRADE_CANCELLED,
  TRADE_ALREADY_CANCELLED,
  VALIDATION_ERROR,
  INTERNAL_ERROR,
} from './errors';

describe('AppError', () => {
  it('constructs with code, message, statusCode and cause', () => {
    const cause = new Error('boom');
    const err = new AppError('X', 'msg', 418, cause);
    expect(err.code).toBe('X');
    expect(err.message).toBe('msg');
    expect(err.statusCode).toBe(418);
    expect(err.cause).toBe(cause);
  });

  it('defaults statusCode to 500', () => {
    expect(new AppError('X', 'msg').statusCode).toBe(500);
  });

  it('has name AppError and is an Error', () => {
    const err = new AppError('X', 'msg');
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it('exposes the typed error-code constants', () => {
    expect(TRADE_NOT_FOUND).toBe('TRADE_NOT_FOUND');
    expect(TRADE_CANCELLED).toBe('TRADE_CANCELLED');
    expect(TRADE_ALREADY_CANCELLED).toBe('TRADE_ALREADY_CANCELLED');
    expect(VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ERROR_CODES.TRADE_NOT_FOUND).toBe('TRADE_NOT_FOUND');
  });

  // Feature: trade-blotter, Property 24: AppError produces a consistent error response shape
  it('preserves code/message/statusCode exactly for any inputs', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.integer({ min: 400, max: 599 }),
        (code, message, statusCode) => {
          const err = new AppError(code, message, statusCode);
          expect(err.code).toBe(code);
          expect(err.message).toBe(message);
          expect(err.statusCode).toBe(statusCode);
          expect(err.name).toBe('AppError');
        },
      ),
      { numRuns: 100 },
    );
  });
});
