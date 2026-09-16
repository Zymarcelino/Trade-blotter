---
inclusion: always
---

# Steering: TypeScript Best Practices

Authoritative TypeScript conventions for this repo. These apply to every `.ts`
and `.tsx` file the agent writes or edits, backend and frontend.

## Compiler discipline
- `strict: true` and `noImplicitAny: true` are non-negotiable. Never weaken the
  tsconfig to make an error go away; fix the type instead.
- Backend uses `module`/`moduleResolution` `Node16`; frontend uses the Vite
  React TS setup. Keep the toolchain mutually compatible (TypeScript, Vitest,
  and `@types/node` versions must not drift apart).
- A change is not "done" until `npx tsc --noEmit` is clean in the affected package.

## No `any`, ever, in domain code
- Domain types, service contracts, repository contracts, and store shapes MUST
  NOT contain `any`. Prefer `unknown` at boundaries and narrow with type guards.
- Do not use `as` to force-cast untrusted input (HTTP responses, WS frames, DB
  rows, `localStorage`). Parse/guard it. The one sanctioned cast is the branded
  ID factory (`createTradeId`) and mapping a controlled DB row interface.
- `// @ts-ignore` / `// @ts-expect-error` are banned outside tests. In tests,
  only `@ts-expect-error` with a comment explaining the intentional type error.

## Domain modelling
- Branded IDs for identifiers: `type TradeId = string & { readonly __brand: 'TradeId' }`,
  produced only through a factory. A raw string must never be assignable to an id.
- Model fixed value sets as `const` objects plus a derived union type - never
  `enum`:
  ```ts
  export const TradeStatus = { ACTIVE: 'ACTIVE', CANCELLED: 'CANCELLED' } as const;
  export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];
  ```
- Derive DTOs from the domain model with `Omit`/`Partial`/`Pick` rather than
  redeclaring shapes (`CreateTradeRequest = Omit<Trade,'id'|'tradeDate'|'status'>`).
- Treat domain objects as immutable: `Readonly<Trade>` / `ReadonlyArray<T>` in
  service and store layers; return fresh objects instead of mutating.

## Discriminated unions
- Multi-shape messages (e.g. `WsMessage`) are discriminated unions keyed on
  `type`. Consumers `switch` on the discriminant and handle every case; add a
  `never`-typed exhaustiveness check in the `default` branch so a new variant is
  a compile error.

## API contracts
- Request/response envelopes are typed once and shared in spirit across the
  stack (backend `types/`, mirrored on the frontend). Keep them field-for-field
  in sync; the frontend Zod schema must mirror the backend JSON Schema.
- Functions that can fail return typed errors (`AppError`/`ApiError`), never
  throw untyped strings.

## Style
- Prefer explicit return types on exported functions.
- Prefer `readonly` on interface fields and props that are not reassigned.
- Name things for intent; comments explain WHY, not WHAT.
