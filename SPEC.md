# Ljiljan — specification

The plan this repository is built from. Authority order: this file, then `docs/graph.yaml`, then the
node spec (`nodes/<ID>-<name>.md`), then `AGENTS.md`. Evidence for the facts below is in
`docs/AUDIT.md` (an audit of `main` at `460501b`, 2026-11-10).

## What this is

Ljiljan is an app for learning Bosnian: short lessons (multiple choice, word bank, match pairs,
listen-and-choose, speak), a pronunciation grader and a real-time voice tutor. **The target is the
web**: a browser build of the Expo app, hosted on the same origin as the backend. Native mobile builds
are not a goal for now (OD1).

Not in scope: native app-store releases, writing or reviewing Bosnian content (owner work, below),
leaderboards or anything that needs trusted scores (see "Settled decisions").

## Principles

Every change respects these. A criterion that would break one is an open decision, not a change.

1. **Keys stay server-side.** The client talks only to the backend, and to LiveKit with a token the
   backend minted. No AI or service key is ever bundled into the web build.
2. **Bosnian voice authenticity over raw latency.** The tutor stays STT → LLM → Azure bs-BA TTS, not
   speech-to-speech.
3. **Content stays `unreviewed` until a native speaker signs off** (the `apply-review` step).
4. **Tests and local development need no Docker and no keys**: PGlite instead of Postgres, fakes for
   Groq and LiveKit. CI may build images; no test suite depends on one.
5. **The voice agent's modules import with zero environment variables.**
6. **Dependencies are pinned and bumped deliberately.** A security patch is a deliberate bump.
7. **A missing key or service setting fails clearly** (HTTP 503 naming the feature as not
   configured, or a non-zero exit naming the setting), never as a 500 or a silent no-op.
8. **Web first.** New client work targets the browser. Native-only code stays compiling and its tests
   stay green, but nodes add no native features (OD1).

## Architecture

- `app/`: Expo (React Native + TypeScript, expo-router) client. Not an npm workspace; own lockfile.
  Web builds use `npx expo export --platform web`. Platform-specific files (`*.web.ts(x)`) keep
  native-only modules (`expo-secure-store`, `@livekit/react-native`) out of the web bundle.
  Tests: jest (`jest-expo`) in `__tests__/` directories.
- `backend/`: Fastify + Drizzle on Postgres; PGlite when `DATABASE_URL` is unset (local, tests).
  JWT auth with rotating refresh tokens. Routes: auth, courses/lessons, progress, pronunciation
  (Groq Whisper transcript diff), tutor session (LiveKit token). Tests: vitest in `backend/test/`.
- `content/`: the curriculum pipeline (blueprint → generate → validate → audio → review export and
  apply). `content/generated/` is the product: the A1–B2 course JSON. Tests: vitest in `content/test/`.
- `voice-agent/`: Python 3.11 LiveKit Agents worker (VAD, Groq STT, LLM, Azure bs-BA TTS); posts
  turns to the backend when `BACKEND_TURNS_URL` is set. Tests: unittest in `voice-agent/tests/`.
- `deploy/` + `DEPLOY.md`: Kubernetes manifests. `.github/workflows/release.yml` pushes the backend
  and voice-agent images to GHCR after CI passes.

### What already exists (not nodes)

From the audit: lessons, progression, auth and the course API work against a live server; all four
suites pass (backend 51, content 26, app 25, voice-agent 9 tests). The A1–B2 curriculum is
committed: 7 units, 29 skills, 29 lessons, 174 exercises, all `unreviewed`. Pronunciation scoring
(transcript alignment) is implemented and tested. The voice agent's backend turn delivery
(`turn_logger.py`) is written; only the backend endpoint is missing (T01). The backend image builds,
boots and seeds.

### Known limitations kept on purpose

- Seeding only upserts; content removed from the JSON stays in the database.
- Vocab items get audio hashes, but only exercises expose `audioUrl`.
- The role-play `scenario` is supported by the backend and agent, but the client never sends one.

## Settled decisions (owner's answers, 2026-11-11)

- The product is a web app (answer to Q2). CORS is `now`, with an allowlist (W02).
- The work list and order of the audit's Q1, reordered for the web (below).
- Real reference audio: object storage or a CDN, `AUDIO_BASE_URL`, absolute URLs (A01). Running the
  synthesis with a real Azure key is the owner's task.
- Migrations: build real drizzle-kit migrations with an advisory lock and a pre-deploy Job (B03).
- Tutor turns: sessions found by `room_name`, a shared service token, role mapping, session end from
  the call screen (T01); the agent handles the interrupt message (T02).
- `content/scripts/seed-a1.ts` is deleted (H01).
- **Client-side grading is accepted for now**: lesson payloads include the answers and the server
  trusts the reported score, capped at the lesson's exercise count. Documented in H01; revisit if
  scores ever become competitive (leaderboards).
- Content review and further LLM generation are owner work, not nodes. H03 adds tests for the review
  tools.
- Phoneme-level scoring is `later`, starting with a research spike (P01).
- Test paths: `.noodlebot/roles.yaml` covers this repository's test directories.

## Build order

`track: now`, in this order where a choice exists: H01, B01, H02, W01, W02, W03, B02, W04, T01, T02,
A01, B03, B04, H03. `track: later`: P01. Edges in `docs/graph.yaml` are only what a gate needs:
W01 needs H02 (expo-doctor clean), W03 and W04 need W01 (the web export), T01 needs W04 (the web call
screen it wires session end into).

## Open decisions

Each has a default. A node that lists a decision in the graph may proceed on the default unless the
owner says otherwise.

| ID | Decision | Default | Nodes |
|---|---|---|---|
| OD1 | Native mobile builds | Web first; native later. Native code stays compiling and tested, no new native features, no EAS work. | W01 |
| OD2 | How the web build is hosted | A separate static image (`app/Dockerfile`, unprivileged nginx, SPA fallback to `index.html`) behind the same ingress host as the backend: `/api` and `/health` go to the backend, everything else to the web image. The web build uses `EXPO_PUBLIC_API_BASE_URL` if set at build time, else the page's own origin when not served from `localhost`/`127.0.0.1`, else `app.json`'s `extra.apiBaseUrl`. | W03 |
| OD3 | Where the web build keeps tokens | `localStorage`, same key names as native. Alternative: an httpOnly refresh-token cookie (a backend change; revisit with B02's family revocation in place). | W01 |
| OD4 | `apply-review` signs off a whole unit even when some corrections could not be applied (it only warns) | Keep the current behaviour; H03 pins it with a test. | H03 |
| OD5 | CORS allowlist settings | `CORS_ORIGINS`, comma-separated exact origins. Unset in local mode (no `DATABASE_URL`): allow `http://localhost:8081` (Expo web dev server). Unset otherwise: no cross-origin access (same-origin hosting needs none). | W02 |
| OD6 | Auth rate limits | `@fastify/rate-limit` on `/api/auth/login` and `/api/auth/register`: 10 requests per minute per client IP; `/api/auth/refresh`: 30 per minute. Other routes unlimited. `TRUST_PROXY=true` (set in the k8s manifest) makes the client IP come from `X-Forwarded-For`. | B02 |
| OD7 | Reference audio hosting | Any S3-compatible bucket or CDN. The owner synthesizes with a key and `AUDIO_BASE_URL`, uploads `content/audio-out/*.mp3` to that URL, commits the manifest and re-seeds. No upload tool is built. Synthesizing with a key but without `AUDIO_BASE_URL` exits non-zero. | A01 |
| OD8 | Migrations on existing databases and at boot | The initial migration is written so it applies to a database the current boot DDL already created (`IF NOT EXISTS`). Every boot (and the migrate Job) runs the migrations under one Postgres advisory lock; PGlite runs them without a lock. The lock is verified by a unit test with a recording client; CI gets no Postgres service (principle 4). | B03 |
| OD9 | Turns endpoint authentication | A shared `BACKEND_TURNS_TOKEN`, compared in constant time. If the backend has none set, `POST /api/tutor/turns` answers 503 (principle 7). | T01 |
| OD10 | Proving a real browser call | Not a merge gate. Criteria stay headless (no microphone, no LiveKit server). After merge, the owner makes one real call in a browser with live keys and reports problems as issues. | W04 |

## Node spec template

Each node spec is `nodes/<ID>-<name>.md`:

- Title `# <ID> — <name>`, then a header table `| Track | Deps | Unlocks | Size |` matching the graph
  (`none` when empty; Unlocks are the nodes that depend on this one).
- `**Owns:**` the paths the node creates or changes; `**Resolves:** #<n>` if it was drafted from a
  GitHub issue.
- `## Purpose`: why, and what exists already.
- `## Tests`: the existing tests to keep, the tests to add, and the red target.
- `## Changes`: numbered; each names the criteria it produces (`*<ID>-AC-n.*`).
- `## Gate`: the acceptance criteria, one line each:
  `- **<ID>-AC-<n>** — <testable statement>. *Verify:* <command or test>`.
- `## Risks`.

## Conventions

- One node per branch `node/<ID>-<name>`, built with `/noodlebot:node <ID>`; spec changes on
  `spec/<topic>`. The owner merges.
- IDs: one letter per family (H hygiene, W web client, B backend, T tutor, A audio, P pronunciation)
  and two digits.
- Sizes: S under a day, M two or three days, L more.
- A node is done when its PR is merged with every criterion backed by evidence: a test, a command
  with its exit code, or a CI run URL for anything that needs a build, a boot or GitHub.
- Every criterion's *Verify* works on `main` plus the node's own change, or on its deps.
- `FOLLOWUPS.md`'s items are now nodes; this file and the graph are the plan.
