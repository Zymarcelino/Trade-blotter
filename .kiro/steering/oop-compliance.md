# Steering: OOP / SOLID Compliance

- Single Responsibility: each class/module does one thing (service orchestrates, repository
  persists, broadcaster fans out).
- Open/Closed: extend via new interface implementations, not by editing consumers.
- Liskov: the in-memory repository mock must be substitutable for the SQLite one.
- Interface Segregation: narrow interfaces (`ITradeRepository`, `ITradeService`, `Logger`, `BroadcastFn`).
- Dependency Inversion: depend on abstractions; wire concretes only in `server.ts`.
- Prefer composition over inheritance. Inject dependencies via the constructor as `private readonly`.
