# SPEC: Ljiljan (bosanski)

## What this is
Ljiljan is an app for learning Bosnian: a gamified lesson engine (skill tree, lessons, hearts, streaks), a
pronunciation grader that scores a recorded phrase, and a real-time Bosnian voice tutor. It is a monorepo:

- `app/`: the Expo (React Native + TypeScript) client;
- `backend/`: the Fastify + Drizzle API (auth, courses, progress, pronunciation, tutor sessions), which holds
  every AI key and proxies the AI services;
- `content/`: the TypeScript curriculum pipeline (CEFR blueprint, generation, validation, `bs-BA` TTS,
  native-speaker review export and import) and the generated curriculum it commits;
- `voice-agent/`: the Python LiveKit worker that runs the voice tutor;
- `deploy/` and `.github/`: Kubernetes manifests, CI and the release image build.

**Scope.** The web app comes first: the Expo web build served with the backend on the same origin. Native
builds come later; there is no app-store work. **Non-goals:** writing and reviewing the Bosnian content is the
owner's work, not nodes; nodes change the pipeline and its tooling, never the curriculum data.

## Principles
Every change respects these.
1. Keys stay server-side. The app talks only to the backend; the backend holds the Groq, LiveKit and Azure
   secrets.
2. Azure `bs-BA` voice authenticity comes before latency.
3. Content stays `unreviewed` until a native speaker signs off.
4. Tests and local dev need no Docker and no keys (PGlite locally and in tests).
5. Voice-agent modules import with zero env vars set.
6. Dependencies are pinned and bumped deliberately.
7. A missing key fails clearly: a 503 from the backend, or a named non-zero exit from a script.
8. Web first.

## State
**Done.** The lesson engine, auth with refresh-token rotation, progress sync, pronunciation scoring by
transcript, the tutor session endpoint, the voice agent, the curriculum pipeline and its review tooling, CI,
the release image build and the Kubernetes manifests. The A1→B2 curriculum is generated and committed
(`content/generated/`, 29 skills); all of it is `unreviewed`. The baseline gate run (see `docs/graph.yaml`)
passes: backend 51 tests, content 26, app 25, voice-agent 9; nothing is known red.

**Known gaps and stale docs** (for later nodes):
- `content/README.md` and `FOLLOWUPS.md` still say the curriculum is "A1 only".
- `content/README.md` documents `npm run seed-a1`, which no package script defines; a hygiene node removes
  `content/scripts/seed-a1.ts` and that line.
- `DEPLOY.md` documents `npm run db:migrate -w @bosanski/backend`, whose script runs `src/db/migrate.ts`, a
  file that does not exist.
- The deferred work in `FOLLOWUPS.md`: tutor turn persistence and session end, refresh-token reuse
  detection, the CORS allowlist, auth rate limiting, placeholder reference audio, coarse pronunciation
  scoring.

**Priorities**, in this order:
1. repository hygiene and broken docs;
2. dependencies;
3. the web build, a CORS allowlist and web hosting;
4. auth hardening;
5. the web voice tutor, tutor turns and reference audio;
6. migrations, graceful shutdown and tests for the review tool;
7. phoneme-level pronunciation scoring, later.

The `FOLLOWUPS.md` items are part of this list. No forge issue tracks this work yet: the owner opens issues for
what should be built, and those issues become planned nodes once the areas are mapped.

## Architecture
The app calls the backend's `/api` routes. The backend stores users, progress and tutor sessions in Postgres
(PGlite when `DATABASE_URL` is unset), creates its schema on boot (`initSchema()`), and seeds the course from
`content/generated/course.json` and the audio manifest (automatically in local dev, by a Job in production).
Pronunciation: the app uploads audio, the backend transcribes it with Groq Whisper and scores the transcript
against the target. The tutor: the backend mints a LiveKit room token; the voice agent joins the room and runs
VAD, STT, an LLM and Azure `bs-BA` TTS, and logs each turn. The content pipeline runs offline under the owner's
keys. CI runs each package's typecheck and tests; the release workflow builds the backend and voice-agent
images after the same checks.

## The regime
The graph (`docs/graph.yaml`) holds the gate (the four test suites, and the failures they already have:
none), the paths out of scope (`content/generated/`, `content/audio-out/`, `app/assets/`), and the adoption
areas, mapped in this order, foundations first, so each node's deps point at areas already mapped:
`repo-root`, `content-pipeline`, `backend`, `app`, `voice-agent`, `deploy`. It lists no node yet: the areas
are mapped into imported nodes, and open issues become planned nodes, in later pull requests.

## Node spec template
A node spec `nodes/<ID>-<name>.md` has the headings Purpose, Tests, Changes, Gate and Risks, a header row
`| Track | Deps | Unlocks | Size |`, an **Owns:** line, and criteria `- **<ID>-AC-<n>** — … *Verify:* …`.

## Open decisions
Each has a default that holds until the owner decides otherwise.

- **OD1. Token storage on web.** `app/src/api/tokenStorage.ts` uses `expo-secure-store`, which has no web
  implementation. *Default:* on web, keep the tokens in `localStorage` behind the same `tokenStorage`
  functions; native keeps SecureStore. *Reason:* the web build is same-origin and the access token is
  short-lived; httpOnly cookies would need a rework of the backend's auth.
- **OD2. CORS.** `backend/src/app.ts` registers `@fastify/cors` with `origin: true` (any origin). *Default:* a
  `CORS_ORIGINS` env var with a comma-separated list of exact origins; unset, production allows no
  cross-origin request (the same-origin web build needs none) and local dev (no `DATABASE_URL`) allows the
  localhost Expo dev origins. *Reason:* web first, same origin; dev keeps working without setup.
- **OD3. Auth rate limits.** Register, login and refresh have none. *Default:* `@fastify/rate-limit` on those
  three routes, 10 requests per minute per IP, in-memory per pod, switchable off in tests. *Reason:* the
  deployment runs two backend replicas and no shared store; a per-pod limit is coarse but needs no new
  infrastructure.
- **OD4. Reference audio URLs.** `content/src/synthesize-audio.ts` emits `PLACEHOLDER://<hash>.mp3` without an
  Azure key, the seed copies the manifest's URL into the course, and the app plays only `http(s)` URLs. The
  audio files are not in git. *Default:* the manifest records file names; the seed builds each URL from an
  `AUDIO_BASE_URL` env var and keeps the placeholder when it is unset. *Reason:* the same manifest works
  locally and in production, wherever the files are hosted.
- **OD5. Schema migrations.** `initSchema()` only creates missing tables, and the `db:migrate` script points
  at a missing file. *Default:* drizzle-kit migrations in a tracked folder, applied by their own step (a Job
  before a rollout) under a Postgres advisory lock so two runners never apply at once; `initSchema()` stays
  for PGlite. *Reason:* two replicas boot at the same time; tests stay keyless and Docker-free.
- **OD6. Tutor turns endpoint auth.** `voice-agent/turn_logger.py` posts turns to `BACKEND_TURNS_URL` with an
  optional `BACKEND_TURNS_TOKEN`; the backend has no turns endpoint yet. *Default:* the endpoint requires a
  bearer service token equal to the backend's `BACKEND_TURNS_TOKEN` and answers 503 when the backend has none
  set. *Reason:* the agent writes for a user without the user's token; principle 7.
- **OD7. Checking the live voice path.** A real voice round trip needs LiveKit, Groq and Azure keys, which
  tests may not use (principle 4). *Default:* voice-path nodes pin their behaviour with keyless tests; a real
  browser call is a post-merge check the owner records, not a merge criterion. *Reason:* principle 4 keeps
  keys out of CI.
- **OD8. Lesson results come from the client.** `backend/src/routes/progress.ts` accepts the app's
  `correctCount`. *Default:* accepted as is, no server-side regrading. *Reason:* a learning app with no
  stakes; regrading would need each attempt's answers on the server.
- **OD9. Runtime versions.** CI runs Node 22 and Python 3.11; the adoption's machine has Node 20 and
  Python 3.13; the root `package.json` allows `node >=20`. *Default:* CI's versions are authoritative; a local
  run on other versions is advisory, and a difference between them is recorded in the node's CI evidence.
  *Reason:* CI is where the gate is judged.

## Conventions
- Branches `node/<ID>-<name>` for a node and `spec/<topic>` for a spec change.
- Sizes: S (under a day), M (two or three days), L (more; split it if you can).
- A node is done when its gate passes in CI on its PR and the PR is merged.
- Commit messages and PR descriptions use "issue #N" or "Refs #N" for issues; the loop closes issues once the
  nodes that build them are merged.
