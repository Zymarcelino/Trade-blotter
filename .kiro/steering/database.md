# Steering: Database

- SQLite via better-sqlite3 (synchronous). Never wrap sync calls in fake async.
- All SQL lives in `backend/src/db/`. Row types (`snake_case`) never escape this layer.
- Map rows to the camelCase domain model in the repository (`rowToTrade`, `rowToAuditEntry`).
- Prepare statements once as `private readonly` members; reuse them.
- Multi-table writes (trade update + audit inserts) run in a single `db.transaction(...)`.
- Migrations are idempotent (`CREATE ... IF NOT EXISTS`) and run synchronously on startup
  before routes are registered. Enable WAL mode.
- CHECK constraints enforce domain invariants (positive quantity/price, valid side/status).
- Parameterise every user-supplied value (`?` / named params). Never string-concat user input.
- Cancel is a soft status transition; never physically delete a trade row.
