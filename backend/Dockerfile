# syntax=docker/dockerfile:1

# --- Stage 1: builder ---------------------------------------------------------
# Compiles TypeScript to JavaScript and installs all dependencies (including the
# native better-sqlite3 module, which must be built from source on Alpine).
FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 is a native addon. node:20-alpine ships without a C/C++
# toolchain, so it cannot be compiled unless we add build tools first.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci
# Force better-sqlite3 to compile from source against THIS image's Node + musl
# libc. The bundled prebuilt binaries are glibc/musl-mismatched on alpine and
# segfault at runtime when a Database is opened, so we rebuild it explicitly to
# produce build/Release/better_sqlite3.node (which node-gyp-build prefers over
# the prebuilds/ binaries).
RUN npm rebuild better-sqlite3 --build-from-source

COPY . .
RUN npm run build

# --- Stage 2: runner ----------------------------------------------------------
# Minimal runtime image. The freshly-compiled node_modules (including the
# better-sqlite3 .node binary built above) is copied from the builder. Both
# stages use the same node:20-alpine base, so the native binary is ABI- and
# libc-compatible -- no rebuild and no build toolchain needed here.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# The SQLite database lives here (DB_PATH=/app/data/trades.db). Mount a volume
# at /app/data in docker-compose so the DB persists across container restarts.
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/server.js"]