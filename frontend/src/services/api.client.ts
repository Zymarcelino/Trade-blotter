/**
 * Typed fetch wrapper. Every request goes through {@link fetchApi}, which:
 *  - prefixes the path with the resolved API base (config/env.ts),
 *  - parses a 2xx JSON body and returns it typed,
 *  - on a non-2xx response, parses the structured error body and throws an
 *    {@link ApiError} with its code/message/statusCode,
 *  - on a network failure, throws ApiError('NETWORK_ERROR', ..., 0),
 *  - on a non-JSON body, throws ApiError('PARSE_ERROR', ..., status).
 *
 * A raw `fetch` rejection is never allowed to escape: callers only ever catch
 * an ApiError.
 */

import { API_BASE } from '../config/env';
import { ApiError } from './errors';
import type { ApiErrorBody } from '../types/trade.types';

/** Narrows an unknown parsed body to the structured API error shape. */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const maybe = value as { error?: unknown };
  if (typeof maybe.error !== 'object' || maybe.error === null) {
    return false;
  }
  const err = maybe.error as Record<string, unknown>;
  return (
    typeof err.code === 'string' &&
    typeof err.message === 'string' &&
    typeof err.statusCode === 'number'
  );
}

/** Reads and JSON-parses a response body, or returns a PARSE_ERROR marker. */
async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      'PARSE_ERROR',
      'Unexpected response format',
      response.status,
    );
  }
}

/**
 * Performs a typed request against the API. `path` is appended to the API base
 * (e.g. `/trades`). Body-less requests must not set a JSON content type, so the
 * caller is responsible for headers; this wrapper adds none by default.
 */
export async function fetchApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    // Network-level failure: no response was received.
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
  }

  const body = await parseJson(response);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        body.error.statusCode,
      );
    }
    // A non-2xx without the expected structured body.
    throw new ApiError(
      'INTERNAL_ERROR',
      'The server returned an error.',
      response.status,
    );
  }

  return body as T;
}
