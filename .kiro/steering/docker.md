# Steering: Docker

- Multi-stage builds. Backend: build TS in a `builder` stage, run compiled `dist/` on
  node:20-alpine in a `runner` stage. Frontend: build with Vite, serve static output via nginx.
- better-sqlite3 is a native addon: install build tools in the builder and rebuild from
  source so the .node binary matches the alpine musl/Node ABI.
- One command from the repo root: `docker compose up --build`.
- nginx reverse-proxies `/api` and `/ws` to the backend so the SPA is same-origin.
- Persist the SQLite file via a mounted volume so trades survive restarts.
