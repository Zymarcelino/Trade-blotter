# Steering: TDD

- Write the failing test first (or concurrently), then implement to green, then refactor.
- Tests are co-located with the source file they cover.
- Vitest on both sides. Backend adds fast-check; frontend adds React Testing Library + MSW.
- Test behaviour at the right boundary: service against a mocked repository, repository
  against real in-memory SQLite, routes via Fastify `inject`.
