# Steering: Architecture

Layered, dependency-inverted architecture. Dependencies point inward only.

- Direction: `routes -> service -> repository -> db`. No layer reaches around another.
- Higher layers depend on interfaces (`ITradeService`, `ITradeRepository`), never concrete classes.
- The composition root (`backend/src/server.ts`) is the ONLY place concrete classes are
  constructed and wired to interfaces.
- No SQL outside `backend/src/db/`. No HTTP parsing outside `routes/`. No business logic in routes.
- `app.ts` builds the Fastify instance (routes + error handler) and never calls `listen()`;
  only `server.ts` listens.
- Keep modules single-responsibility and small; prefer composition over inheritance.
