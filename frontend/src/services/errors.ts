/**
 * Frontend error type. Every failure surfaced by the API client is an
 * {@link ApiError} carrying a machine-readable `code`, a human message, and the
 * HTTP `statusCode` (0 for network-level failures, where no response arrived).
 */

/** A typed API/network error thrown by the fetch wrapper. */
export class ApiError extends Error {
  public override readonly name = 'ApiError';

  constructor(
    /** Machine-readable error code (e.g. VALIDATION_ERROR, NETWORK_ERROR). */
    public readonly code: string,
    /** Human-readable message from the server or a client-side default. */
    public override readonly message: string,
    /** HTTP status code; 0 indicates a network-level failure. */
    public readonly statusCode: number,
  ) {
    super(message);
    // Restore the prototype chain so `instanceof ApiError` works after transpile.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
