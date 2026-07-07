# @bosanski/backend — Ljiljan API

Fastify + Drizzle API server: auth, course/progress sync, the pronunciation
grader (Groq Whisper transcription -> scoring), and LiveKit room-token minting
for the real-time voice tutor. AI provider keys stay server-side — the app
never talks to Groq/Azure/LiveKit directly.

See the root `README.md` for how this fits with `app/`, `content/`, and
`voice-agent/`, and `DEPLOY.md` for taking this to a Kubernetes cluster.

## Run

```bash
npm install                 # from the repo root — installs the backend + content workspaces
npm run dev -w @bosanski/backend    # tsx watch, http://localhost:3000
```

No Docker or Postgres required for local dev: with `DATABASE_URL` unset, the
backend runs on an in-process **PGlite** database (see `isLocalDb` in
`src/env.ts`). Set `PGLITE_PATH` to a directory to persist it across restarts
(handy for `npm run dev` + `npm run seed` sharing one on-disk DB); leave it
unset for a fresh in-memory DB every run, same as the test suite.

## Build

```bash
npm run build -w @bosanski/backend   # tsc -> dist/
npm start -w @bosanski/backend       # node dist/src/index.js
```

The compiled server entrypoint is **`dist/src/index.js`**; the compiled seed
script is **`dist/scripts/seed-course.js`**.

## Test / typecheck

```bash
npm test -w @bosanski/backend        # vitest (unit + one full-stack integration test over real seeded A1 content)
npm run typecheck -w @bosanski/backend
```

## Environment variables

See `.env.example` at the repo root for the full list with comments
(`DATABASE_URL`, `PGLITE_PATH`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`,
`PORT`, `GROQ_API_KEY`, `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`,
`LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`). All of it is optional
for local dev/test; the AI-backed routes degrade gracefully without keys.

**Boot guard:** once `DATABASE_URL` is set (i.e. any non-local deployment),
`assertProductionSecretsAreSafe()` (`src/env.ts`) refuses to start unless
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are both set to something other than
the `dev-`-prefixed defaults. Local/PGlite dev and CI never hit this, since
they never set `DATABASE_URL`.

## Seeding the curriculum

```bash
npm run seed -w @bosanski/backend
```

Reads `../content/generated/course.json` (+ `../content/audio-out/manifest.json`
for audio URLs, optional) and upserts it into the DB via `seedCourse()`
(`scripts/seed-course.ts`) — idempotent, safe to re-run after content
regeneration. The base directory for those two files is overridable via
`CONTENT_DIR` (defaults to the sibling `content/` package on disk); the
Docker image sets it explicitly since the compiled script's directory layout
differs from the source checkout — see the Docker section below and the
comment above `CONTENT_DIR` in `scripts/seed-course.ts`.

## Docker

`Dockerfile` is a multi-stage build (Node 22, `tsc` build stage +
`node:22-slim` runtime stage) that bakes in `content/generated/` and
`content/audio-out/manifest.json` so the seed script works straight out of
the image. It's monorepo-aware and **must be built with the repo root as the
build context** (it needs the root workspace lockfile and the `content`
package's generated output), not `backend/`:

```bash
# from the repo root
docker build -f backend/Dockerfile -t ljiljan-backend .
docker run --rm -p 3000:3000 \
  -e JWT_ACCESS_SECRET=dev-access-secret-change-me \
  -e JWT_REFRESH_SECRET=dev-refresh-secret-change-me \
  ljiljan-backend
# -> GET http://localhost:3000/health => {"ok":true}  (PGlite in-memory, no DATABASE_URL set)
```

Images are actually built in CI, not locally — see
`.github/workflows/release.yml`, which pushes to
`ghcr.io/<owner>/ljiljan-backend` on every push to `main` and on `v*` tags.

## Deploy

See `DEPLOY.md` at the repo root for the full path from a CI-built GHCR image
to a running Deployment against your HA Postgres, including the one-shot
seed Job and the JWT boot guard above.
