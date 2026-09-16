# Steering: Audit Trail

- Record one audit entry per genuinely changed field on amend (compute via `diffTrade`).
- A field whose value does not change produces no entry.
- Capture field, oldValue, newValue, changedAt (ISO 8601), changedBy (SYSTEM - no auth).
- The trade update and its audit inserts are written atomically in one transaction.
- Expose per-trade history (`/trades/:id/audit`, newest first) and a global feed (`/audit`).
- History for a trade with no changes returns an empty array, not 404.
