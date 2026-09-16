# Steering: API Design

- Base path `/api/v1`. Versioned from day one.
- Success: single resource `{ data }`; collection `{ data, meta }` where `meta` is
  `{ total, page, pageSize }`.
- Error: `{ error: { code, message, statusCode, fields? } }`. `code` is machine-readable.
- Status codes: 200 read/update, 201 create, 400 validation, 404 not found, 409 conflict,
  500 unexpected.
- Validate request bodies at the edge with Fastify JSON Schema. Reject unknown fields
  (do NOT silently strip them).
- Body-less requests (GET, DELETE cancel) must not send `Content-Type: application/json`.
- Filters on `GET /trades` are conjunctive and optional.
