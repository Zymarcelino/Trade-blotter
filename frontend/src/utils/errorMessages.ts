/**
 * Central mapping from machine-readable error codes to human-readable messages.
 * Keeps user-facing copy in one place so toasts, inline errors, and panels all
 * speak the same language. Covers the backend domain codes plus the client-only
 * NETWORK_ERROR and PARSE_ERROR cases.
 */

/** The known error codes mapped to their user-facing messages. */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  TRADE_NOT_FOUND: 'That trade could not be found.',
  TRADE_CANCELLED: 'This trade has been cancelled and can no longer be amended.',
  TRADE_ALREADY_CANCELLED: 'This trade has already been cancelled.',
  VALIDATION_ERROR: 'Some fields are invalid. Please review and try again.',
  INTERNAL_ERROR: 'Something went wrong on the server. Please try again.',
  NETWORK_ERROR: 'Could not reach the server. Check your connection and retry.',
  PARSE_ERROR: 'The server returned an unexpected response.',
};

/** The fallback message for any unrecognised code. */
export const DEFAULT_ERROR_MESSAGE =
  'Something went wrong. Please try again.';

/** Resolves a code to its human message, falling back to a generic message. */
export function resolveErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}
