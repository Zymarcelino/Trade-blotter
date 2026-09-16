# syntax=docker/dockerfile:1

# ---------- Stage 1: builder ----------
# Build the Vite production bundle. VITE_API_BASE_URL / VITE_WS_URL are
# intentionally NOT set here so the same-origin defaults in src/config/env.ts
# (`/api/v1` and a host-derived ws(s)://<host>/ws) apply. Vite only loads
# .env.development in dev mode, so `vite build` (production mode) never bakes
# the localhost dev overrides into the bundle.
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies from the lockfile for reproducible builds.
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and produce the static bundle in /app/dist.
COPY . .
RUN npm run build

# ---------- Stage 2: runner ----------
# Serve the static SPA via nginx. nginx.conf handles SPA routing and proxies
# /api and /ws to the backend so the SPA is served same-origin.
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
