# B11 — backend-image

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B01, B06, B10, R03 | none | S |

**Owns:** `backend/Dockerfile`

## Purpose

Imported from the code. `backend/Dockerfile` builds the backend's production image, with the repository root as
the build context (it needs the root workspace manifests and the content package's generated data).

- The build stage (`node:22-slim`) copies the root `package.json`, `package-lock.json` and `tsconfig.base.json`
  and the backend and content `package.json` files, runs `npm ci`, then copies `backend/` and runs
  `npm run build -w @bosanski/backend`.
- The runtime stage (`node:22-slim`, `NODE_ENV=production`) installs the production dependencies (`npm ci --omit=dev`)
  from the root manifests and the backend's, copies the compiled `backend/dist`, and bakes in `content/generated` and
  `content/audio-out/manifest.json`, with `CONTENT_DIR=/app/content` so the compiled seed script and the auto-seed (B06)
  find them. It runs as the `node` user, exposes port 3000 and starts `node backend/dist/src/index.js` (B10). The seed
  Job runs `node backend/dist/scripts/seed-course.js` in the same image.

## Tests

No test builds the image: tests use no Docker (principle 4). The release workflow builds and pushes it on every
push to `main` and on `v*` tags, after the test jobs pass; no workflow builds it on a pull request.

## Changes

none: imported

## Gate

- **B11-AC-1** — Built from the repository root, the image compiles the backend against the root lockfile and starts `node backend/dist/src/index.js` on port 3000 as the non-root `node` user. *Verify:* unpinned (the release workflow's build, not a test).
- **B11-AC-2** — The image holds `content/generated` and `content/audio-out/manifest.json` under `/app/content` and sets `CONTENT_DIR` to it, so the compiled seed script finds the curriculum. *Verify:* unpinned.
- **B11-AC-3** — The runtime stage installs production dependencies only and copies the compiled output, not the TypeScript sources or the content tooling. *Verify:* unpinned.

## Risks

- A pull request that breaks the image build is not caught: only a push to `main` or a tag builds it.
- The curriculum is baked into the image: a content change needs a new image and a new seed Job run.
- Run without `DATABASE_URL`, the image uses an in-memory PGlite and auto-seeds it, so a misconfigured deployment
  starts and serves a database that is lost on restart, without an error.
- The runtime stage copies `tsconfig.base.json`, which nothing reads at run time.
- `.dockerignore` (R03) decides what the build context holds; a change there can drop a file this build copies.
