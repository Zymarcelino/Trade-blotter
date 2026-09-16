# Steering: Validation

- Backend is the source of truth: Fastify JSON Schema on create/amend bodies.
  symbol non-empty and `^[A-Z]+$`; quantity integer >= 1; price number exclusiveMinimum 0;
  side in {BUY, SELL}; trader/book/counterparty non-empty. Reject unknown fields.
- Frontend Zod schema mirrors these rules field-for-field. Whitespace-only text is treated
  as empty. Do not coerce empty numeric input to 0 (that would pass a positive-number rule);
  treat it as missing so the required error fires.
- Show inline field-level errors; never show errors on untouched fields.
