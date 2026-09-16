# Steering: TypeScript Best Practices

- `strict: true`, `noImplicitAny: true`. No `any` in domain, service, or repository contracts.
- Treat external data (HTTP responses, WS frames, DB rows) as `unknown`; narrow with type
  guards. Avoid `as` on untrusted input.
- Prefer `Readonly<T>`, `Omit`/`Partial`/`Pick` derivations, and discriminated unions.
- Exhaustively switch on discriminated-union `type` fields.
- Pin dependency versions; keep the toolchain (TS, Vitest, @types/node) mutually compatible.
