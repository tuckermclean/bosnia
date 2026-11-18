# R03 — ignore-lists

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | none | S |

**Owns:** `.gitignore`, `.dockerignore`

## Purpose

Imported from the code. `.gitignore` keeps out of git the dependencies (`node_modules/`), build output
(`dist/`, `build/`, `*.tsbuildinfo`), env and secret files (`.env`, `.env.local`, `*.local`, the filled-in
`deploy/backend-secret.yaml`), local databases (`*.db`, `*.sqlite`, `.pglite/`, `backend/.data/`), the binary
reference audio (`content/audio-out/*` except `manifest.json`), the review export (`content/review-export/`),
Python caches and the voice agent's `.venv/`, the Expo and native build folders under `app/`, logs and
`.DS_Store`. Its comments record that the generated curriculum JSON is tracked on purpose.

`.dockerignore` is the build-context filter for the backend image, which `backend/Dockerfile` builds with the
repository root as its context. It leaves out `node_modules`, `.venv` folders and Python caches at any depth,
`.git` and `.github`, the whole `app/` tree, `backend/dist`, `content/dist` and `*.tsbuildinfo` files, the test
folders of the backend, content and voice agent, `content/src`, `content/scripts`, `content/review-export`, the
files in `content/audio-out/` other than `manifest.json`, `.vscode` and `.idea`, and the root's env, log and
`.DS_Store` files (`.env`, `.env.local`, `*.local`, `*.log`, `.DS_Store`). These env, log and `.DS_Store`
patterns match only at the context root, unlike the same patterns in `.gitignore`, which match at any depth.
`.vscode` and `.idea` also match only at the root; `.gitignore` names neither. Everything else stays in the
context: the root manifests, lockfile and `tsconfig.base.json`, the backend's sources, scripts and config,
`content/generated/`, `content/audio-out/manifest.json` and content's manifest and config, `voice-agent/`
without its tests, `deploy/`, `docs/`, `nodes/`, `.noodlebot/`, the root docs and spec files, and
`.env.example`. What reaches the image is what `backend/Dockerfile` copies, including `content/generated/` and
`content/audio-out/manifest.json`. The voice agent's image has its own `voice-agent/.dockerignore`, which this
node does not own.

## Tests

None: no test reads these files. The backend image build in the release workflow uses `.dockerignore`; it is
not a test.

## Changes

none: imported

## Gate

- **R03-AC-1** — `.gitignore` keeps `.env` files and the filled-in `deploy/backend-secret.yaml` out of git, while `.env.example` and `deploy/backend-secret.example.yaml` stay tracked. *Verify:* unpinned.
- **R03-AC-2** — `.gitignore` does not ignore `content/audio-out/manifest.json` and ignores the rest of `content/audio-out/`, and ignores `content/review-export/`. *Verify:* unpinned.
- **R03-AC-3** — `.dockerignore` keeps the root `.env`, `.env.local` and `*.local`, `.git`, `.github`, `app/`, `node_modules` and the test folders out of the backend image's build context. *Verify:* unpinned.
- **R03-AC-4** — `.dockerignore` keeps in the build context what the backend image needs: the root manifests and lockfile, `tsconfig.base.json`, the backend and content `package.json` files, `backend/` sources, `content/generated/` and `content/audio-out/manifest.json`. *Verify:* unpinned.

## Risks

- `.dockerignore` must stay in step with `backend/Dockerfile`: a path the Dockerfile copies but the ignore list
  leaves out breaks the image build, which only the release workflow runs, not the CI test jobs.
- A new secret file that `.gitignore` does not name would be committable; the patterns are by name (`.env`,
  `*.local`, the one secret manifest).
- `.dockerignore`'s env patterns match only at the context root, so a `backend/.env` (the package override that
  `backend/src/env.ts` loads) stays in the build context, and `COPY backend/ backend/` in `backend/Dockerfile`
  copies it into the build stage.
