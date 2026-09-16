# Steering: Error Handling

- Backend: throw typed `AppError(code, message, statusCode, cause?)`. A global Fastify
  error handler maps it to the standard error body; unexpected errors become a generic 500
  `INTERNAL_ERROR` with no internal leakage. Log 4xx at warn, 5xx at error.
- Codes: TRADE_NOT_FOUND (404), TRADE_CANCELLED (409), TRADE_ALREADY_CANCELLED (409),
  VALIDATION_ERROR (400), INTERNAL_ERROR (500).
- Frontend: `ApiError(code, message, statusCode)`; `statusCode: 0` for network failures.
  `fetchApi` never lets a raw fetch rejection escape. Map codes to human messages centrally.
- Commit-then-broadcast: a broadcast failure after a committed write is logged and swallowed,
  never rolled back.
- A failed mutation must not mutate the client store.
- Wrap the frontend app in an error boundary with a reload fallback.
