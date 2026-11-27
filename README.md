# Ljiljan — learn Bosnian 🌼

A mobile app for learning **Bosnian**: a Duolingo-style gamified lesson engine, an **AI pronunciation grader** that listens and scores you, and a **real-time Bosnian voice tutor** you can actually talk to.

Named for the *zlatni ljiljan* (golden lily), a Bosnian national symbol. Original branding — not affiliated with Duolingo.

## Monorepo layout

| Package        | Stack                        | Responsibility |
|----------------|------------------------------|----------------|
| `app/`         | Expo (React Native + TS)     | The mobile client: skill tree, lessons, pronunciation UI, voice-tutor call screen. |
| `backend/`     | Fastify + Drizzle + Postgres | API, auth, progress sync, and the server-side proxy for the AI APIs (keys never ship to the client). |
| `voice-agent/` | Python + LiveKit Agents      | The real-time full-duplex Bosnian voice tutor (VAD → STT → LLM → Azure `bs-BA` TTS). |
| `content/`     | TypeScript pipeline          | Generates the CEFR A1→B2 Bosnian curriculum + reference audio + native-speaker review tooling. |

## How the pieces fit

```
                 ┌─────────────┐   POST /api/pronunciation        ┌────────────┐
  ┌──────────┐   │             │──(audio)────────────────────────▶│  Groq      │
  │  app     │──▶│  backend    │◀─(transcript)────────────────────│  Whisper   │
  │ (Expo)   │   │  (Fastify)  │   scorePronunciation() → 0–100    └────────────┘
  │          │   │             │
  │          │   │             │   POST /api/tutor/session → LiveKit token
  │          │   └─────────────┘
  │          │        │ join room (LiveKit)         ┌──────────────┐
  │          │········│·····························▶│ voice-agent  │  Azure bs-BA TTS
  └──────────┘   real-time voice (WebRTC)           │ (LiveKit)    │  fast LLM brain
                                                     └──────────────┘
  content/ ──(course.json + audio manifest)──▶ backend seed ──▶ Postgres ──▶ /api/courses
```

## Key decisions & honest caveats
- **AI keys stay server-side.** The app only ever talks to `backend/`; the backend holds Groq/LiveKit/Azure secrets.
- **Pronunciation scoring is coarse.** Whisper emits clean text and can silently "correct" a mispronunciation, so transcript-vs-target scoring is a useful-but-approximate signal. A phoneme forced-alignment upgrade is a future phase. The scoring core is pure and unit-tested (`backend/src/services/scoring.ts`).
- **Bosnian voice authenticity > raw latency.** We chose a streaming STT→LLM→Azure `bs-BA` TTS pipeline over a native speech-to-speech model, because the tutor is the voice learners imitate.
- **Generated content ships `unreviewed`.** The curriculum is AI/hand-generated and flagged until a native Bosnian speaker signs off; `content/` emits a review export and an apply-back importer for exactly that.

## Local development
No Docker required — the backend uses **PGlite** (in-process Postgres) locally and for tests; set `DATABASE_URL` to use a real Postgres in production. Copy `.env.example` → `.env` and fill in keys for the features you want to exercise.

```bash
npm install                 # installs backend + content workspaces
npm test -w @bosanski/backend
npm run dev -w @bosanski/backend
```

See each package's own README for its run instructions.

## CI/CD & Deployment
Every push/PR runs the full test suite for all four packages
(`.github/workflows/ci.yml`). Every push to `main` and every `v*` tag builds
`backend/` and `voice-agent/` into container images and pushes them to GHCR
(`.github/workflows/release.yml`) — gated on those same tests passing. `app/`
ships separately via EAS Build, not a container.

See **[`DEPLOY.md`](./DEPLOY.md)** for taking a released image to a
Kubernetes cluster against your own HA Postgres — secrets, manifests, the
curriculum seed Job, schema bootstrapping, and the JWT-secret boot guard.

## Single-host stack (Docker Compose)
`compose/` runs the whole product on one machine without a cluster: Postgres,
the backend, the voice agent and a `web` service (Caddy serving the Expo web
export and reverse-proxying `/api` and `/health` to the backend, so the app and
the API share one HTTPS origin). Only Caddy publishes ports (80 and 443). The
Kubernetes path in [`DEPLOY.md`](./DEPLOY.md) is unchanged and stays the
production path.

- **Prerequisites.** Docker with Compose v2; a DNS name pointing at the host
  with ports 80 and 443 open (Caddy gets a certificate for it; browsers allow
  the microphone only on a secure origin), or `localhost` with Caddy's local
  certificate.
- **Configure.** `cp compose/.env.example compose/.env`, then fill it in: the
  Postgres password, the two JWT secrets (`openssl rand -hex 32`; the backend
  refuses the placeholders), `DOMAIN`, and the provider and LiveKit keys you
  want. `compose/.env` is ignored by git.
- **Start.** In `compose/`: `docker compose up -d --build`. The first build of
  the web image takes a few minutes. The backend creates its schema on boot and
  seeds the course when the database is empty (`AUTO_SEED=true`).
- **Check.** `curl https://<domain>/health` answers `{"ok":true}` (add `-k`
  for `localhost`).
- **Reseed.** `docker compose run --rm backend node backend/dist/scripts/seed-course.js`.
- **Update.** `git pull`, then `docker compose up -d --build`. The public
  origin is baked into the web image, so a new `DOMAIN` needs the `web` image
  rebuilt (`docker compose build web`).
- **Basic auth.** Set `BASIC_AUTH=on`, `BASIC_AUTH_USER` and `BASIC_AUTH_HASH`
  (from `docker run --rm caddy:2 caddy hash-password`, each `$` written `$$`)
  in `compose/.env`, then `docker compose up -d web`. Every path except
  `/health` then asks for the credentials.
- **Known limits.** Registration is open and register, login and refresh have no
  rate limit (OD3), so use basic auth on a public address; reference audio is
  placeholder (OD4); there are no schema migrations (OD5), so a pull that
  changes the schema needs the tables changed by hand or a fresh volume
  (`docker compose down -v` also deletes the database and the certificates);
  the voice agent exits without its LiveKit settings and is restarted in a
  loop, which does not affect the rest of the stack.

The `Images` workflow boots `postgres`, `backend` and `web` from this folder
on each pull request (`localhost`, no keys).
