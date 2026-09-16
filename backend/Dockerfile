# syntax=docker/dockerfile:1

# Trade Blotter backend image.
#
# The backend is one package in a small multi-package repo. It depends on two
# sibling packages that live at the repo root:
#   shared/    - domain types, repository interface, id generator (source of truth)
#   database/  - SQLite connection, migrations, seed, ITradeRepository impl
# Because of that, this image MUST be built from the REPOSITORY ROOT context
# (not ./backend), so all three packages are visible. See docker-compose.yml /
# render.yaml, which set the build context to the repo root and point
# dockerfilePath here.

# --- Stage 1: builder ---------------------------------------------------------
# Installs deps for all three packages and compiles TypeScript via project
# references (tsc -b builds shared -> database -> backend in order).
FROM node:20-alpine AS builder
WORKDIR /repo

# better-sqlite3 is a native addon (used by the database package). node:20-alpine
# ships without a C/C++ toolchain, so add build tools before installing.
RUN apk add --no-cache python3 make g++

# Install each package's dependencies. The `file:../shared` / `file:../database`
# links require the sibling package.json files to be present, so copy the
# manifests first for better layer caching, then install.
COPY shared/package*.json ./shared/
COPY database/package*.json ./database/
COPY backend/package*.json ./backend/

# shared has no runtime deps beyond its own toolchain; database pulls in
# better-sqlite3; backend links to both siblings. Install in dependency order.
RUN npm --prefix ./shared install
RUN npm --prefix ./database install
RUN npm --prefix ./backend install

# Rebuild better-sqlite3 from source against THIS image's Node + musl libc so
# the prebuilt glibc binary does not segfault at runtime on alpine.
RUN npm --prefix ./database rebuild better-sqlite3 --build-from-source

# Copy the sources and compile in dependency order so each package's declaration
# output (dist/*.d.ts) exists before the next package resolves it. Building the
# backend alone via project references can race module resolution of the linked
# @trade-blotter/* packages inside the image, so we build each explicitly.
COPY shared/ ./shared/
COPY database/ ./database/
COPY backend/ ./backend/
RUN npm --prefix ./shared run build
RUN npm --prefix ./database run build
RUN npm --prefix ./backend run build

# --- Stage 2: runner ----------------------------------------------------------
# Minimal runtime image. Copies the compiled dist output and node_modules for
# each package, preserving the repo layout so the `@trade-blotter/*` symlinks
# resolve at runtime.
FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production

# shared + database compiled output and their node_modules (database carries the
# native better-sqlite3 binary built above).
COPY --from=builder /repo/shared/dist ./shared/dist
COPY --from=builder /repo/shared/package.json ./shared/package.json
COPY --from=builder /repo/shared/node_modules ./shared/node_modules
COPY --from=builder /repo/database/dist ./database/dist
COPY --from=builder /repo/database/package.json ./database/package.json
COPY --from=builder /repo/database/node_modules ./database/node_modules
COPY --from=builder /repo/backend/dist ./backend/dist
COPY --from=builder /repo/backend/package.json ./backend/package.json
COPY --from=builder /repo/backend/node_modules ./backend/node_modules

WORKDIR /repo/backend

# The SQLite database lives here (DB_PATH=/repo/backend/data/trades.db by
# default, overridden in compose/render). Mount a volume/disk for persistence.
RUN mkdir -p /repo/backend/data

EXPOSE 3000
CMD ["node", "dist/server.js"]