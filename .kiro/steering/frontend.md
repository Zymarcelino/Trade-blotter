# Steering: Frontend

- React 18 + TypeScript + Vite. CSS Modules only (no Tailwind, no CSS framework).
- State: Zustand for live trade state (the grid renders from it); TanStack Query for
  server-state fetching; WebSocket updates patch the Zustand store directly (no refetch).
- Grid: TanStack Table (headless, semantic `<table>`) + TanStack Virtual for large sets.
- Forms: React Hook Form + Zod (`mode: onBlur`, `reValidateMode: onChange`); client rules
  mirror the backend.
- WebSocket logic lives in the client/singleton + a hook, never inline in components.
- URL resolution is centralised in `config/env.ts`; no other file reads `import.meta.env`.
- No optimistic updates: update the store only after server-confirmed broadcast.
