---
inclusion: always
---

# Steering: OOP / SOLID Compliance

The backend is organised around small classes and interfaces wired by a single
composition root. These rules keep it testable and substitutable.

## SOLID
- Single Responsibility: each unit does one thing. The service ORCHESTRATES
  (business rules), the repository PERSISTS (SQL only), the broadcaster FANS OUT
  (serialise + send). No unit reaches into another's job.
- Open/Closed: extend by adding a new implementation of an interface, not by
  editing existing consumers.
- Liskov: any implementation of an interface must be drop-in substitutable. The
  in-memory repository mock used in tests MUST behave like the SQLite one from
  the caller's point of view.
- Interface Segregation: keep interfaces narrow and role-specific
  (`ITradeRepository`, `ITradeService`, `BroadcastFn`, `Logger`). No fat
  "manager" interfaces.
- Dependency Inversion: high-level modules depend on ABSTRACTIONS. Routes depend
  on `ITradeService`; the service depends on `ITradeRepository` + `BroadcastFn`
  - never on the concrete classes.

## Composition root
- `backend/src/server.ts` is the ONLY place concrete classes are constructed and
  wired to their interfaces. Every other file imports interfaces, not concretes.
- No `new TradeRepository()` / `new TradeService()` outside `server.ts` (tests
  may construct concretes or mocks directly - that is expected).

## Dependency injection
- Inject collaborators through the constructor as `private readonly`. No service
  locator, no global singletons for domain collaborators, no reaching into
  module scope for dependencies.
- Provide sensible defaults only for cross-cutting concerns (e.g. a console
  `Logger`), never for domain collaborators.

## Composition over inheritance
- Prefer composing behaviour from injected collaborators. Do not build domain
  class hierarchies; there is no base `Trade*` class to extend.

## Encapsulation / layering
- No SQL, `snake_case` keys, or DB row types escape `backend/src/db/`.
- No business logic in route handlers - parse, delegate to the service, shape
  the response.
- Domain objects are handled as `Readonly<T>` and never mutated in place.
