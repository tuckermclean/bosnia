# SPEC: Ljiljan (bosanski)

## What this is
This monorepo holds Ljiljan, which teaches Bosnian through three features: a gamified lesson engine (skill
tree, lessons, hearts, streaks), a pronunciation grader that scores a recorded phrase, and a real-time Bosnian
voice tutor. Its packages:

- `app/`: the Expo (React Native + TypeScript) client;
- `backend/`: the Fastify + Drizzle API (auth, courses, progress, pronunciation, tutor sessions); it calls
  Groq for pronunciation grading and mints the short-lived LiveKit room tokens for tutor sessions;
- `content/`: the TypeScript curriculum pipeline (CEFR blueprint, generation, validation, `bs-BA` TTS,
  native-speaker review export and import) and the generated curriculum it commits;
- `voice-agent/`: the Python LiveKit worker that runs the voice tutor; it reads the LiveKit, Groq and Azure
  keys itself (the same Secret as the backend);
- `deploy/` and `.github/`: Kubernetes manifests, CI and the release image build.

Two request paths: auth, lessons, progress and pronunciation go app → backend; the voice tutor goes
app → LiveKit → voice agent, with a room token the app first gets from the backend.

**Scope.** The web app comes first: the Expo web build served with the backend on the same origin. Native
builds come later; there is no app-store work. **Non-goals:** writing and reviewing the Bosnian content is the
owner's work, not nodes; nodes change the pipeline and its tooling, never the curriculum data.

## Principles
Every change respects these.
1. Keys stay server-side: no key in the client. The backend and the voice agent hold the Groq, LiveKit and
   Azure keys; the app gets only short-lived LiveKit room tokens from the backend. The content pipeline uses
   the owner's Azure and Anthropic/OpenAI keys on the owner's machine.
2. Azure `bs-BA` voice authenticity comes before latency.
3. Content stays `unreviewed` until a native speaker signs off.
4. Tests and local dev need no Docker and no keys (PGlite locally and in tests).
5. Voice-agent modules import with zero env vars set.
6. Dependencies are pinned and bumped deliberately.
7. A missing key fails clearly. The backend answers a 503 that tells the client the feature is unavailable
   (e.g. "pronunciation is unavailable"), not the variable's name, and its server log names the missing key;
   a script or the voice agent exits non-zero naming the missing key.
8. Web first.

## State
**Done.** The lesson engine, auth with refresh-token rotation, progress sync, pronunciation scoring by
transcript, the tutor session endpoint, the voice agent, the curriculum pipeline and its review tooling, CI,
the release image build and the Kubernetes manifests. The A1→B2 curriculum is generated and committed
(`content/generated/`, 29 skills); all of it is `unreviewed`. The baseline gate run (see `docs/graph.yaml`), a
local run on Node 20 and Python 3.13 (see OD9), passes: backend 51 tests, content 26, app 25, voice-agent 9;
nothing is known red.

**Known gaps and stale docs** (for later nodes):
- `content/README.md` and `FOLLOWUPS.md` still say the curriculum is "A1 only".
- `content/README.md` documents `npm run seed-a1`, which no package script defines; B13 removes that line,
  and a hygiene node is still to remove `content/scripts/seed-a1.ts`.
- `DEPLOY.md` §4 documents `npm run db:migrate -w @bosanski/backend`, whose script runs `src/db/migrate.ts`, a
  file that does not exist, and `db:generate`, which runs `drizzle-kit` with no `drizzle.config.ts`. B13
  removes both scripts, has §4 say the schema comes only from `initSchema()` on boot, and adds a test that
  every script `DEPLOY.md` and `content/README.md` name exists.
- `backend/package.json`'s `start` script and `main` point at `dist/index.js`, but the build emits the server
  entrypoint at `dist/src/index.js`, so `npm start -w @bosanski/backend` fails. B14 points both at the emitted
  file and adds a test that checks them and the Dockerfile's `CMD` against `backend/tsconfig.json`.
- A missing Groq or LiveKit key gives a 500 from `/api/pronunciation` and `/api/tutor/session`, not
  principle 7's 503, and the backend's logger is off, so no server log names the missing key or any 500's
  cause. B15 answers 503 naming the feature, logs the missing settings, and turns the server's logger on.
- The deferred work in `FOLLOWUPS.md`: tutor turn persistence and session end, refresh-token reuse detection,
  the CORS allowlist, auth rate limiting, placeholder reference audio, coarse pronunciation scoring.

**Priorities**, in this order:
1. repository hygiene and broken docs;
2. dependencies;
3. the web build, a CORS allowlist and web hosting;
4. auth hardening;
5. the web voice tutor, tutor turns and reference audio;
6. migrations, graceful shutdown and tests for the review tool;
7. phoneme-level pronunciation scoring, later.

The `FOLLOWUPS.md` items are part of this list. No forge issue tracks this work yet: the owner opens an issue
for what should be built, and triage fits it into the graph as a planned node.

## Architecture
The app calls the backend's `/api` routes. The backend stores users, progress and tutor sessions in Postgres
(PGlite when `DATABASE_URL` is unset), creates its schema on boot (`initSchema()`), and seeds the course from
`content/generated/course.json` and the audio manifest (automatically in local dev, by a Job in production).
Pronunciation: the app uploads audio, the backend transcribes it with Groq Whisper and scores the transcript
against the target. The tutor: the backend mints a LiveKit room token, the app connects to LiveKit directly
with it (not through the backend), and the voice agent joins the room, runs VAD, STT, an LLM and Azure
`bs-BA` TTS, and logs each turn. The content pipeline runs on the owner's machine, outside the deployed
services, under the owner's keys. CI runs each package's typecheck (py_compile for the voice agent) and tests;
the release workflow builds the backend and voice-agent images after the same checks.

## The regime
The graph (`docs/graph.yaml`) holds the gate (the four test suites, and the failures they already have:
none), the paths out of scope (`content/generated/`, `content/audio-out/`, `app/assets/`) and the nodes. The
adoption is over: its six areas (`repo-root`, `content-pipeline`, `backend`, `app`, `voice-agent`, `deploy`)
were mapped, foundations first, into the imported nodes R01–R03, C01–C08, B01–B11, A01–A08, V01–V07 and
D01–D04, which own every tracked file outside the out-of-scope paths and the spec files. New work enters as a
forge issue that triage turns into a planned node.

## Node spec template
A node spec `nodes/<ID>-<name>.md` has the title `# <ID> — <name>`, the headings Purpose, Tests, Changes,
Gate and Risks, a header row `| Track | Deps | Unlocks | Size |`, an **Owns:** line, and criteria
`- **<ID>-AC-<n>** — … *Verify:* …`, numbered from 1 without gaps.

## Open decisions
Each has a default that holds until the owner decides otherwise.

- **OD1. Token storage on web.** `app/src/api/tokenStorage.ts` uses `expo-secure-store`, which has no web
  implementation. *Default:* on web, keep the tokens in `localStorage` behind the same `tokenStorage`
  functions; native keeps SecureStore. *Reason:* the web build will be same-origin and the access token is
  short-lived; httpOnly cookies would need a rework of the backend's auth. The real exposure is the 30-day
  refresh token (`backend/src/services/auth.ts`), which `localStorage` would also hold; rotation limits it.
- **OD2. CORS.** `backend/src/app.ts` registers `@fastify/cors` with `origin: true` (any origin). *Default:*
  the allowed origins come from a `CORS_ORIGINS` env var that lists them. Without it, a production backend
  answers no cross-origin request, since the web build will be served from the backend's own origin, and a
  local backend on PGlite accepts the Expo web dev server, `http://localhost:8081`. *Reason:* web first, same
  origin; dev keeps working without setup.
- **OD3. Auth rate limits.** Register, login and refresh have none. *Default:* `@fastify/rate-limit` on those
  three routes, 10 requests per minute per client IP, with Fastify's `trustProxy` on so the client IP comes from
  the ingress's `X-Forwarded-For` (without it, behind an ingress, `request.ip` is the ingress's address, which
  would limit everyone together); in-memory per pod, switchable off in tests. *Reason:* the deployment runs two
  backend replicas and no shared store; a per-pod limit is coarse but needs no new infrastructure.
- **OD4. Reference audio URLs.** `content/src/synthesize-audio.ts` emits `PLACEHOLDER://<hash>.mp3` without an
  Azure key, and with one writes a relative `audio-out/<hash>.mp3`; the seed copies the manifest's URL into
  the course, and the app plays only `http(s)` URLs, so neither form plays. The audio files are not in git.
  *Default:* the manifest records file names; the seed builds each URL from an `AUDIO_BASE_URL` env var and
  keeps the placeholder when it is unset. *Reason:* the same manifest works locally and in production,
  wherever the files are hosted.
- **OD5. Schema migrations.** `initSchema()` only creates missing tables, and the `db:migrate` script points
  at a missing file. *Default:* drizzle-kit migrations in a tracked folder, applied by their own step (a Job
  before a rollout) under a Postgres advisory lock so two runners never apply at once; `initSchema()` stays
  for PGlite. *Reason:* two replicas boot at the same time; tests stay keyless and Docker-free.
- **OD6. Tutor turns endpoint auth.** `voice-agent/turn_logger.py` posts turns to `BACKEND_TURNS_URL` with an
  optional `BACKEND_TURNS_TOKEN`; the backend has no turns endpoint yet. *Default:* the endpoint requires a
  bearer service token equal to the backend's `BACKEND_TURNS_TOKEN`; a backend started without that token
  refuses every turn with a 503, so the missing setting shows. *Reason:* the agent writes for a user without
  the user's token.
- **OD7. Checking the live voice path.** A real voice round trip needs LiveKit, Groq and Azure keys, which
  tests may not use (principle 4). *Default:* voice-path nodes pin their behaviour with keyless tests; a real
  browser call is a post-merge check the owner records, not a merge criterion. *Reason:* principle 4 keeps
  keys out of CI.
- **OD8. Lesson results come from the client.** `backend/src/routes/progress.ts` accepts the app's
  `correctCount` and `total`. *Default:* accepted, clamped to the lesson's size (its exercise count), not
  regraded. *Reason:* a learning app with no stakes; regrading would need each attempt's answers on the server.
- **OD9. Runtime versions.** CI runs Node 22 and Python 3.11; the machine the loop's sessions run on has
  Node 20 and Python 3.13; the root `package.json` allows `node >=20`. *Default:* CI's versions are
  authoritative; a local run on other versions is advisory, and a difference between them is recorded in the
  node's CI evidence. *Reason:* CI is where the gate is judged.

## Conventions
- Branches `node/<ID>-<name>` for a node and `spec/<topic>` for a spec change.
- Sizes: S (under a day), M (two or three days), L (more; split it if you can).
- A node is done when its gate passes in CI on its PR and the PR is merged.
- Commit messages and PR descriptions use "issue #N" or "Refs #N" for issues; the loop closes issues once the
  nodes that build them are merged.
