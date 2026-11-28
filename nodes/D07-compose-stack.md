# D07 — compose-stack

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A11, R02, D06 | D08 | M |

**Owns:** `compose/`, `backend/test/compose-stack.test.ts`
**Resolves:** #55

## Purpose

The only deployment is the Kubernetes path in `deploy/` (D03) and `DEPLOY.md` (D04), and nothing serves the web
build. To try the whole product in a browser on one machine, the owner needs a stack that runs Postgres, the
backend, the voice agent and the web build behind one HTTPS origin, without a cluster.

This node adds a Docker Compose stack in `compose/`, outside `deploy/` (which D03 owns and D05's test checks
against `deploy/kustomization.yaml`). It has four services: `postgres` (`postgres:16`, a named volume), `backend`
(built from `backend/Dockerfile`, B11), `voice-agent` (built from `voice-agent/Dockerfile`, V07) and `web`, a
multi-stage image whose first stage runs A11's web export with `EXPO_PUBLIC_API_BASE_URL` set to the public
origin (Expo inlines it at build time, so it is a build argument) and whose second stage is Caddy. Caddy serves
the export with an `index.html` fallback, so a reload or a direct link works, and reverse-proxies `/api` and
`/health` to the backend, so the app and the API share one origin and CORS (OD2) does not come into it. Caddy
gets a certificate for the configured domain automatically: browsers allow the microphone only in a secure
context. Only Caddy publishes ports. Basic auth in Caddy can be switched on by a setting, since a test stack on
a public address has open registration and no auth rate limit (OD3).

The backend creates its schema on boot (`initSchema()`, B03), `AUTO_SEED=true` (B02, B06) seeds the course when
the database is empty, and because `DATABASE_URL` is set the JWT boot guard (B12) requires real secrets. LiveKit
Cloud is assumed; a self-hosted `livekit-server` is not part of the stack.

A backend test checks the stack's files without Docker (principle 4). The `Images` workflow (D06) gets a job
that builds the stack and boots it on each pull request, with `localhost` as the domain and no keys, and checks
that it answers through Caddy. The web image does not join `release.yml`: its build inlines the public origin,
so a published image would serve one domain only. The Kubernetes path does not change.

## Tests

`backend/test/compose-stack.test.ts` (vitest; no Docker, no key, no network). It reads `compose/` relative to the
test file, parses `compose/compose.yaml` with the `yaml` package (already a backend devDependency, D05), and
reads `compose/Caddyfile`, `compose/web.Dockerfile` and `compose/.env.example` as text. Paths in the compose
file are resolved against `compose/`.

- **Services.** The services are exactly `postgres`, `backend`, `voice-agent` and `web`.
- **Ports.** Only `web` has `ports`; they publish 80 and 443 (TCP, and 443/UDP if listed) and nothing else. No
  service uses `network_mode: host`.
- **Postgres.** `postgres` runs `image: postgres:16` with its data directory (`/var/lib/postgresql/data`) on a
  named volume declared under the top-level `volumes`.
- **Backend.** `backend` builds with the repository root as its context and `backend/Dockerfile`; its
  `DATABASE_URL` names the host `postgres`; `AUTO_SEED` is `"true"`; it depends on `postgres`.
- **Voice agent.** `voice-agent` builds with `voice-agent/` as its context and `voice-agent/Dockerfile`.
- **Web.** `web` builds with `app/` as its context and `compose/web.Dockerfile`, with a build argument
  `EXPO_PUBLIC_API_BASE_URL` of `https://${DOMAIN}`; Caddy's data and config directories are on named volumes.
- **Web image.** `compose/web.Dockerfile` has at least two stages; its first stage runs the `export:web` script;
  its last stage starts `FROM` a `caddy` image, copies the export from the build stage, and runs no `npm` and no
  `node`.
- **Caddy.** The Caddyfile's site address is the `DOMAIN` setting; it reverse-proxies `/api/*` and `/health` to
  `backend:3000`; it serves the rest from the export with a `try_files` fallback to `/index.html`.
- **Settings.** Every variable `compose.yaml` interpolates (`${NAME}`, with or without a default) and every
  environment placeholder the Caddyfile reads (`{$NAME}`) is named in `compose/.env.example`; the example's JWT
  secrets are `REPLACE_WITH` placeholders (which the boot guard refuses, B12), and it holds no other secret
  value.

The test fails on `main` today, where `compose/` does not exist.

## Changes

- `compose/compose.yaml`: new, the four services.
  - `postgres`: `postgres:16`; `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` from the env file; the
    named volume; a `pg_isready` health check; no ports.
  - `backend`: `build` with context `..` and `backend/Dockerfile`; `env_file: .env`; `DATABASE_URL` built from
    the Postgres settings with the host `postgres`; `AUTO_SEED: "true"`; `depends_on` `postgres` healthy;
    `restart: unless-stopped`; no ports.
  - `voice-agent`: `build` with context `../voice-agent`; `env_file: .env`; `restart: unless-stopped`; no ports.
  - `web`: `build` with context `../app`, `dockerfile: ../compose/web.Dockerfile` and the
    `EXPO_PUBLIC_API_BASE_URL` argument; `DOMAIN` and the basic-auth settings in its environment;
    `compose/Caddyfile` mounted read-only at `/etc/caddy/Caddyfile`; `caddy_data` and `caddy_config` volumes;
    ports 80 and 443; depends on `backend`; `restart: unless-stopped`.
- `compose/web.Dockerfile`: new. Stage 1 on `node:22-slim` installs `app/`'s dependencies with `npm ci` from its
  lockfile and runs `npm run export:web` with `EXPO_PUBLIC_API_BASE_URL` from the build argument. Stage 2 on the
  official `caddy:2` image copies only `dist/` from stage 1 to the folder the Caddyfile serves. A header comment
  says how compose builds it, that the origin is baked in, and that the build stage never reaches the runtime
  image.
- `compose/web.Dockerfile.dockerignore`: new, BuildKit's ignore file for that Dockerfile, so the context skips
  `node_modules`, `dist`, `.expo`, `web-build` and env files.
- `compose/Caddyfile`: new. The site `{$DOMAIN}`; `/api/*` and `/health` to `backend:3000`; every other path from
  the export with `try_files {path} /index.html` and `file_server`; compression on. Basic auth over every path
  except `/health` when the `BASIC_AUTH` setting is `on`, with the user and the bcrypt hash from
  `BASIC_AUTH_USER` and `BASIC_AUTH_HASH`; off by default. (Caddy reads `{$NAME}` when it parses the file, so
  one way is two small snippet files, one with `basic_auth` and one empty, chosen by `import` on the setting.)
- `compose/.env.example`: new, every setting the stack reads, each with a comment: the Postgres credentials,
  `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (`REPLACE_WITH` placeholders, with how to make a 32-character
  secret), `GROQ_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `AZURE_SPEECH_KEY`,
  `AZURE_SPEECH_REGION`, the voice agent's optional settings as `voice-agent/README.md` lists them, `DOMAIN`, and
  `BASIC_AUTH`, `BASIC_AUTH_USER` and `BASIC_AUTH_HASH`, with how to make the hash
  (`docker run --rm caddy:2 caddy hash-password`) and that each `$` in it is written `$$`. The filled-in
  `compose/.env` is ignored by the root `.gitignore`'s `.env` pattern (R03), unchanged.
- `README.md`: a section on the single-host stack: what it runs and that the Kubernetes path in `DEPLOY.md`
  stays the production path; the prerequisites (Docker with Compose v2, a DNS name pointing at the host, ports
  80 and 443 open, or `localhost` with Caddy's local certificate); copying `compose/.env.example` to
  `compose/.env` and filling it in; `docker compose up -d --build` in `compose/`; checking
  `https://<domain>/health`; reseeding with `docker compose run --rm backend node backend/dist/scripts/seed-course.js`;
  rebuilding after a pull (`git pull`, then `docker compose up -d --build`, and that a new `DOMAIN` needs a
  rebuild of `web`); the basic-auth setting; and the stack's known limits (open registration and no auth rate
  limit, OD3; placeholder reference audio, OD4; no schema migrations, OD5; the voice agent exits without its
  LiveKit settings). The rest of the README does not change.
- `.github/workflows/images.yml`: a third job, `compose-stack`, beside the two image builds. It writes
  `compose/.env` from `compose/.env.example` with `DOMAIN=localhost`, generated JWT secrets and Postgres
  password and no provider keys; runs `docker compose up -d --build --wait` for `postgres`, `backend` and `web`
  (the voice agent needs LiveKit settings, and its image is built by its own job); and checks through Caddy with
  its local certificate (`curl` with `-k` or Caddy's root certificate): `https://localhost/health` answers
  `{"ok":true}`; `/` and `/sign-in` answer 200 with the export's `index.html`; `GET /api/courses` without a token
  answers the backend's 401. It then restarts `web` with `BASIC_AUTH=on` and a generated user and hash and checks
  that `/` answers 401 without credentials and 200 with them, and `/health` 200 without them. It prints
  `docker compose logs` when a check fails and runs `docker compose down -v` at the end, failed or not. It uses
  no secret, logs in nowhere and pushes nothing, as the workflow's other jobs. The workflow's header comment says
  why this job has no `release.yml` counterpart. The two existing jobs do not change.
- `backend/test/compose-stack.test.ts`: new, the cases above.
- `deploy/`, `DEPLOY.md`, `ci.yml`, `release.yml` and the Dockerfiles of the backend and the voice agent do not
  change.

## Gate

- **D07-AC-1** — `compose/compose.yaml` defines exactly the services `postgres`, `backend`, `voice-agent` and `web`, and only `web` publishes ports, 80 and 443. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts` (the services and ports cases).
- **D07-AC-2** — `postgres` runs `postgres:16` on a named volume; `backend` builds from `backend/Dockerfile` with the repository root as its context, with a `DATABASE_URL` on the host `postgres` and `AUTO_SEED` `"true"`; `voice-agent` builds from `voice-agent/Dockerfile` in `voice-agent/`. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts` (the postgres, backend and voice-agent cases).
- **D07-AC-3** — `web` builds from `compose/web.Dockerfile` with `app/` as its context and `EXPO_PUBLIC_API_BASE_URL` set to `https://${DOMAIN}`; the Dockerfile's first stage runs the web export and its last stage is a `caddy` image that holds only the export, with no `npm` or `node` step. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts` (the web and web image cases).
- **D07-AC-4** — The Caddyfile serves the `DOMAIN` site, proxies `/api/*` and `/health` to `backend:3000`, and falls back to `/index.html` for any other path; basic auth over every path but `/health` is on only when `BASIC_AUTH` is `on`. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts` (the Caddy case), and the `compose-stack` job's basic-auth checks (D07-AC-7).
- **D07-AC-5** — `compose/.env.example` names every variable the compose file and the Caddyfile read, its JWT secrets are `REPLACE_WITH` placeholders, and it holds no other secret value; a filled-in `compose/.env` is ignored by git. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts` (the settings case), and `git check-ignore -q compose/.env` exits 0.
- **D07-AC-6** — The README has a section that brings the stack up, checks `/health`, reseeds with `docker compose run --rm backend node backend/dist/scripts/seed-course.js`, rebuilds after a pull, switches basic auth on, and lists the stack's known limits, and says the Kubernetes path in `DEPLOY.md` is unchanged. *Verify:* the reviewer reads the section against `compose/`.
- **D07-AC-7** — On the node's pull request, the `Images` workflow's `compose-stack` job builds the stack and boots `postgres`, `backend` and `web` with `DOMAIN=localhost` and no keys; through Caddy, `/health` answers `{"ok":true}`, `/` and `/sign-in` answer the export's `index.html`, and `/api/courses` answers the backend's 401; with basic auth on, `/` answers 401 without credentials and 200 with them, and `/health` 200 without them. The PR records the job's outcome with the outcome of the workflow's other two jobs and the run's URL. *Verify:* the `Images` run on the PR's head commit, recorded in the PR; unpinned (the workflow's own run, not a test).
- **D07-AC-8** — The `compose-stack` job uses no secret, logs in to no registry and pushes nothing; the two existing `Images` jobs, `ci.yml`, `release.yml`, `deploy/` and `DEPLOY.md` are unchanged; the four `CI` jobs and the backend's typecheck pass. *Verify:* the reviewer reads the workflow and diffs the other files with `main` (`grep -n 'secrets\.\|login-action\|push: true' .github/workflows/images.yml` prints nothing), and CI's evidence in the PR.

## Risks

- A boot on a host with a real DNS name, where Caddy gets a public certificate, and a browser session there
  (sign up, a reload, a lesson, a graded recording with `GROQ_API_KEY`, a tutor call with the LiveKit, Groq and
  Azure keys) are post-merge checks the owner records (OD7); the CI job boots with `localhost` and no keys.
- The web image builds the whole Expo app: `npm ci` of `app/` and the export take a few minutes and a large
  share of a small host's memory (4 CPUs, about 8 GB) and disk. The build stage stays out of the runtime image,
  but its layers stay in the build cache until `docker builder prune`.
- The origin is baked into the web image, so a change of `DOMAIN` needs `docker compose build web`, and the
  image is not published by `release.yml`.
- The `compose-stack` job builds three images without a registry cache, adding several minutes to each pull
  request beside the other two builds.
- `/health` stays open with basic auth on, so the health check and the owner's `curl` need no credentials; it
  reveals only that the backend is up.
- A bcrypt hash holds `$` signs, which Compose reads as interpolation in an env file unless each is written `$$`;
  the example says so.
- The voice agent exits without its LiveKit settings and `restart: unless-stopped` restarts it in a loop; the
  rest of the stack is unaffected, and the README says so.
- Postgres and Caddy's certificates live in named volumes; `docker compose down -v` deletes the database and the
  certificates, and Let's Encrypt limits how often a domain may get a new one.
- The `caddy:2` and `postgres:16` tags are major tags, not digests, like the `docker/*` actions (principle 6).
- No schema migrations (OD5): a pull that changes the schema needs the tables changed by hand or a fresh volume.
