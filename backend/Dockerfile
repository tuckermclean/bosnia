# syntax=docker/dockerfile:1
#
# Ljiljan backend (Fastify + Drizzle) — production image.
#
# Monorepo-aware: this Dockerfile MUST be built with the repo root as the
# build context (not `backend/`), because it needs the root workspace
# manifests (package.json/lockfile/tsconfig.base.json) and the `content`
# package's generated curriculum data. From the repo root:
#
#   docker build -f backend/Dockerfile -t ljiljan-backend .
#
# (See .github/workflows/release.yml for how CI does this against GHCR, and
# the root .dockerignore for what's excluded from the build context.)

# ---------------------------------------------------------------------------
# Stage 1: build — compile the @bosanski/backend workspace (tsc) against the
# full monorepo lockfile, so versions match local dev/CI exactly.
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Workspace manifests only, first — this layer only invalidates when a
# dependency changes, not on every source edit.
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY content/package.json content/package.json
RUN npm ci

# Now the backend source and compile it (tsc -p backend/tsconfig.json ->
# backend/dist, see backend/tsconfig.json's outDir).
COPY backend/ backend/
RUN npm run build -w @bosanski/backend

# ---------------------------------------------------------------------------
# Stage 2: runtime — slim image with only production deps, the compiled
# dist/, and the baked-in curriculum content the seed script needs.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist

# Baked-in curriculum data for the seed job (backend/dist/scripts/seed-course.js):
# only the `content` package's *generated output*, never its TypeScript source
# or generation tooling (those are build-time-only, not part of the runtime
# image). course.json/blueprint.json/skills/*.json + the audio manifest are
# the only two paths the seed script reads.
COPY content/generated ./content/generated
COPY content/audio-out/manifest.json ./content/audio-out/manifest.json

# Tell the compiled seed script where that baked-in content lives. Its default
# (two levels up from the script's own directory) assumes the monorepo
# checkout layout (backend/ and content/ as sibling directories on disk), which
# no longer holds once the script is compiled into this image — see the
# CONTENT_DIR handling in backend/scripts/seed-course.ts for the full
# rationale. This image lays `content/` directly under the workdir, hence:
ENV CONTENT_DIR=/app/content

# Runs as the image's built-in non-root `node` user (present on all official
# node images) rather than root.
USER node

EXPOSE 3000

# Fastify binds 0.0.0.0:$PORT (default 3000; see backend/src/env.ts) and
# always exposes GET /health — used by the k8s liveness/readiness probes
# (see deploy/backend-deployment.yaml).
CMD ["node", "backend/dist/src/index.js"]
