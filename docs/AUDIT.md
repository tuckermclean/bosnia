# AUDIT: Ljiljan (a Bosnian-learning app), this repository

- Audited 2026-11-10 at origin/main `460501b` (14 commits; last commit 2026-07-08).
- Auditor: noodlebot b8d1bdf, unattended.
- Method: read the code, ran every suite in podman (Node 22, Python 3.11) on a copy of the clone, probed the live backend, and built and booted the backend image. Two independent subagents re-checked the least certain verdicts.

## Summary

**How well the code matches the docs.** The code mostly matches. All four test suites pass, the same as CI. The backend image builds and boots. Lessons, progression and auth work against a live server.

The gaps are in the edges the docs call finished or "just add a key":
- **Broken commands:** `npm start`, `db:migrate`, `db:generate` and `npm run seed-a1` all fail.
- **No working path to real audio:** adding the Azure key does nothing (cached placeholders), and nothing hosts or serves the audio files.
- **Voice tutor in a dev build:** probably won't work. The LiveKit Expo config plugins are missing.
- **Missing keys break things:** the AI routes return a 500 error instead of "degrading gracefully".
- **Stale docs:** some still say "A1 only".

The adopt run's earlier facts file (kept outside the repository) was right on most points but missed all of these except the broken commands and stale docs.

**Remaining work, in a suggested order:**
1. **S: fix broken commands and stale docs.** `npm start` path, `seed-a1` (it also overwrites the A1–B2 blueprint), "A1 only", `.venv`, "degrade gracefully".
2. **S: no-key behaviour.** Return 503 "not configured" from tutor and pronunciation instead of 500.
3. **S: dependency fixes.** `npm audit`: 5 high (fastify, find-my-way, @fastify/busboy, fast-uri, zod). `expo-doctor`: 4 failed checks, including a Hermes memory regression.
4. **M: auth hardening.**
   - Atomic refresh rotation and family revocation (#12).
   - A logout endpoint that revokes the refresh token.
   - Rate limiting on auth routes.
5. **M: voice tutor dev build.** Add the LiveKit Expo plugins and `expo-dev-client`. Proving it works needs a device and keys.
6. **M–L: tutor persistence (#11).**
   - A turns endpoint with service-token auth that maps room name to session and role names.
   - Session end, plus the app's end-call hook.
   - `BACKEND_TURNS_URL` in the k8s manifests.
   - Wire up or remove the unused `lk.interrupt` message.
7. **M: real reference audio.** Fix the placeholder caching, host the mp3s (CDN, bucket or a static route) and write absolute URLs.
8. **M: migrations.** `drizzle.config.ts`, a migrations folder and `migrate.ts`, and a lock around boot-time schema creation (2 replicas can race).
9. **S: graceful SIGTERM shutdown** for the backend.
10. **S: CORS allowlist (#15),** only needed before a web client.
11. **L, owner work: content.** 29 lessons and 174 exercises in total, 1 lesson per skill, all unreviewed. Native-speaker review. `export-review`/`apply-review` have no tests.
12. **L, later: phoneme-level scoring.**

**Disputed verdicts:** none. Both subagents agreed with every verdict they checked. The audio subagent added one fact, the placeholder-caching problem (A12).

---

## 1. Claims inventory

Verdicts: **done**, **partial**, **missing**, **contradicted** (the code does something else), **stale** (the doc is out of date), **not run** (with the reason).

### Root README.md, FOLLOWUPS.md, DEPLOY.md

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| A1 | Monorepo: app/, backend/, voice-agent/, content/ with the stacks listed | README.md:9-14 | done | package.json:6-9 workspaces; app/package.json; voice-agent/requirements.txt |
| A2 | AI keys stay server-side; app only talks to backend | README.md:34 | done | app/src/api/config.ts:1-30 (backend base URL only); no Groq/Azure/LiveKit secrets in app/; LiveKit token minted server-side (backend/src/services/livekit.ts:37-55) |
| A3 | Pronunciation scoring: Whisper transcript diff, pure, unit-tested | README.md:35 | done | backend/src/services/scoring.ts (Needleman–Wunsch + Levenshtein, no I/O); backend/test/scoring.test.ts (19 cases) |
| A4 | Pipeline is STT→LLM→Azure bs-BA TTS, not speech-to-speech | README.md:36 | done | voice-agent/agent.py:65-129 (build_stt/llm/tts), agent.py:174-193 |
| A5 | Content ships `unreviewed`; review export plus apply-back importer | README.md:37 | done (untested) | All 29 skills unreviewed (generated/course.json); content/src/export-review.ts, apply-review.ts. **No tests** for either (content/test has generate-skill, llm, synthesize-audio, validate only) |
| A6 | No Docker for local dev; PGlite when DATABASE_URL unset | README.md:40 | done | backend/src/env.ts:45 isLocalDb; backend/src/db/client.ts:21-35; live probe ran on PGlite |
| A7 | `npm install` installs backend + content; `npm test -w @bosanski/backend`; `npm run dev -w …` | README.md:43-45 | done | package.json:6-9; backend test 51/51 pass; dev server (tsx) booted and served the probe |
| A8 | Every push/PR runs the full suite for all four packages | README.md:51-52 | done | .github/workflows/ci.yml:1-80 (backend, content, app, voice-agent jobs) |
| A9 | Release builds and pushes backend and voice-agent images to GHCR, gated on CI | README.md:52-55; DEPLOY.md §1 | done | release.yml `test: uses: ./.github/workflows/ci.yml`, `needs: test`; Release runs green incl. tag v0.1.0 |
| A10 | `app/` ships via EAS Build | README.md:55; DEPLOY.md:5-6 | partial | No eas.json (EAS CLI can create one), no `expo-dev-client`. See B6 |
| A11 | #11 `tutor_turns`, `tutor_sessions.endedAt/durationSec` written by no route | FOLLOWUPS.md:9-18 | missing (confirmed) | backend/src/routes/tutor.ts only `POST /api/tutor/session`; live probe: `POST /api/tutor/turns` and `/api/tutor/session/end` both 404; app TODO at app/src/features/tutor/VoiceCallLive.tsx:107 |
| A11a | #11 says voice-agent "logs turns to stdout instead of persisting them" | FOLLOWUPS.md:13-14 | stale / partial | voice-agent/turn_logger.py:95-123 already POSTs to `BACKEND_TURNS_URL` with a bearer token. The missing part is the backend endpoint. Mismatches the future endpoint must handle: agent sends `session_id = ctx.room.name` (agent.py:196) but `tutor_turns.session_id` FKs `tutor_sessions.id` (a UUID; room_name has no index, ddl.ts:103-111); roles `user/assistant` vs `learner/tutor` (schema.ts:185); static token vs `requireAuth` user JWT (http.ts:18-24) |
| A12 | #12 rotation is correct; reuse detection (family revoke) missing | FOLLOWUPS.md:20-27 | missing; rotation is only partly correct | No family column (schema.ts:100-109). Rotation is read-check-then-unconditional `UPDATE` (routes/auth.ts:82-98), with no transaction or `WHERE revoked=false`, so two concurrent refreshes can both succeed on a pooled Postgres. Not reproduced on PGlite (single connection, live probe gave 200/401). Live probe: after replaying a revoked token, the child token still refreshes (200), so there is no family revoke |
| A13 | #15 CORS `origin: true` | FOLLOWUPS.md:29-33 | done (as described; still open) | backend/src/app.ts:21; live probe: `Origin: https://evil.example` reflected |
| A14 | Voice tutor gated off in Expo Go | FOLLOWUPS.md:37-41; app/README.md:18 | done | app/src/features/tutor/availability.ts:20-26; app/app/tutor.tsx:15 (React.lazy), :21-30 fallback |
| A15 | Pronunciation scoring coarse; phoneme alignment is future work | FOLLOWUPS.md:42-45 | done (as described) | scoring.ts header comment; no aligner code |
| A16 | All content unreviewed | FOLLOWUPS.md:46-48 | done | 29/29 skills `unreviewed` |
| A17 | Audio is `PLACEHOLDER://` until the key is set and `npm run audio` runs | FOLLOWUPS.md:49-52; content/README.md:12; app/README.md:47 | **contradicted** | (1) synthesize-audio.ts:117-119 treats every hash already in the manifest as cached, and all 386 committed entries are placeholders. Dry run: "0 new, 400 already cached", so with a key nothing is synthesized unless the manifest is deleted first. (2) Real audio gets a relative URL `audio-out/<hash>.mp3` (synthesize-audio.ts:85). Seed copies it verbatim (seed-course.ts:204-206). The app plays only `http(s)://` (app/src/utils/audio.ts:8). The image ships only manifest.json (.dockerignore, backend/Dockerfile:54) and the backend serves no static files (app.ts:21-23). A learner would hear nothing |
| A18 | "Curriculum is A1 only" | FOLLOWUPS.md:53-55 | **stale** | 7 units / 29 skills A1–B2 committed (blueprint levels A1,A2,B1,B2); live `GET /api/courses` returns all 4 levels |
| A19 | No auth rate limiting | FOLLOWUPS.md:56-57 | done (as described; still open) | No `@fastify/rate-limit` in backend/package.json; live probe: 30 bad logins all answered 401, no 429 |
| A20 | Real e2e voice needs live credentials | FOLLOWUPS.md:58-61 | not run: needs LiveKit + Groq + Azure keys and a device |  |
| A21 | dotenv removed, `process.loadEnvFile` used | FOLLOWUPS.md:65-71 | done | backend/src/env.ts:6-15; no dotenv in any package.json |
| D1 | Images are tagged sha, latest (main), semver (v* tags) | DEPLOY.md:24-27 | done | release.yml metadata-action tags |
| D2 | k8s manifests: namespace, secret example, backend deploy + service, seed Job, voice-agent deploy, commented ingress | DEPLOY.md §3 | done | deploy/*.yaml (OWNER placeholder must be hand-edited, as documented) |
| D3 | `/health` returns `{"ok":true}` | DEPLOY.md:109-110 | done | app.ts:40; live 200 `{"ok":true}`; built image also |
| D4 | Seed Job is idempotent and reads baked-in content via CONTENT_DIR | DEPLOY.md:113-128 | done | seed-course.ts:121-251 onConflictDoUpdate; Dockerfile:62 `CONTENT_DIR=/app/content`; in the built image `node backend/dist/scripts/seed-course.js` gave 7 units/29 skills/29 lessons/174 exercises. Note: it never deletes rows removed from content |
| D5 | Schema created by `initSchema()` on every boot | DEPLOY.md:149-158 | done; has a race | client.ts:28-30,41-43 runs DDL with no lock or transaction; `replicas: 2` (backend-deployment.yaml) can race on a fresh DB (CREATE TABLE IF NOT EXISTS is not concurrency-safe in Postgres). The pod would crash once and self-heal on restart. Not run: needs real Postgres |
| D6 | `npm run db:generate` / `db:migrate` exist; `drizzle-kit` already a dependency; the gap is the plumbing | DEPLOY.md:162-168 | **contradicted** (the commands are documented as working) | `db:migrate` → `tsx src/db/migrate.ts`: ERR_MODULE_NOT_FOUND (rc=1). `db:generate` → "drizzle.config.json file does not exist" (rc=1). No migrations dir. tsconfig.json includes a nonexistent drizzle.config.ts |
| D7 | JWT boot guard refuses dev secrets when DATABASE_URL is set | DEPLOY.md:170-181; backend/README.md:45-49 | done | env.ts:53-67, index.ts:9; live: with DATABASE_URL set it exits 1 with "Refusing to boot…" |
| D8 | voice-agent reads the same Secret | DEPLOY.md:132-133 | done | voice-agent-deployment.yaml envFrom backend-secrets. But no `BACKEND_TURNS_URL/TOKEN` is set anywhere, so turn delivery is off in k8s |

### backend/README.md, backend/package.json

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| B1 | `npm run build` → tsc → dist/ | README:28 | done | rc=0; emits backend/dist/src/index.js |
| B2 | `npm start` runs `node dist/src/index.js` | README:29-33 | **contradicted** | package.json:9 `"start": "node dist/index.js"` (and `"main"` :6): "Cannot find module", rc=1. Running `node dist/src/index.js` directly works (health 200). Dockerfile CMD uses the right path |
| B3 | `npm test` = unit + one integration test "over real seeded A1 content" | README:37 | done; doc stale | 51/51 pass; integration test now covers A1–B2 (test/integration.test.ts:102) |
| B4 | `PGLITE_PATH` persists the DB so `seed` and `dev` share it | README:21-24 | done (code) | client.ts:24 |
| B5 | `npm run seed` reads content and upserts | README:57-70 | done | rc=0, "7 units, 29 skills, 29 lessons, 174 exercises (audio: 58 matched)". Without PGLITE_PATH it seeds a throwaway in-memory DB (auto-seed covers dev) |
| B6 | AI-backed routes "degrade gracefully without keys" | README:47; .env.example:5 | **contradicted** | Live probe with no keys: `POST /api/tutor/session` → 500, `POST /api/pronunciation` → 500 "Internal server error" (livekit.ts:51 `new AccessToken` with empty key; groq.ts:11-15 call with empty key). The app shows a generic "Couldn't start…" message |
| B7 | Docker image: multi-stage, root context, health OK with PGlite | README:72-92 | done | `podman build -f backend/Dockerfile .` rc=0; container auto-seeded and `/health` → `{"ok":true}`. It ignores SIGTERM (podman fell back to SIGKILL after 10 s); there is no shutdown handler in index.ts |
| B8 | Local auto-seed when the DB is empty | (commit 460501b; not in README) | done (undocumented) | src/auto-seed.ts; index.ts:15-20; `AUTO_SEED` env (env.ts:28) is in no doc or .env.example. Running the compiled server outside Docker looks for `backend/content/...` (auto-seed.ts:31-33 resolves `../../content` from dist/src) and skips the seed; observed in the live run |
| B9 | `smoke:groq` script | package.json:17 | not run: needs GROQ_API_KEY | backend/scripts/smoke-groq.ts; undocumented |

### content/README.md, content/package.json

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| C1 | `blueprint`, `generate`, `validate`, `audio`, `export-review`, `apply-review` scripts | README:9-14 | done (scripts exist) | content/package.json:7-12 |
| C2 | `validate` exits non-zero on hard failures | README:11 | done | rc=0 on committed content: "0 error(s), 12 warning(s) — PASS" (validate.ts:184-190) |
| C3 | `audio` dry-run writes placeholders when no key | README:12 | done | rc=0, manifest unchanged (diff clean) |
| C4 | `blueprint`/`generate` with an LLM key | README:20-30 | not run: needs ANTHROPIC/OPENAI key | code: llm.ts:116-121 (falls back to MockProvider); generate.ts |
| C5 | `npm run seed-a1` re-emits the A1 course | README:15 | **contradicted** and dangerous | No such script (rc=1 "Missing script"). The file content/scripts/seed-a1.ts exists, and running it **overwrites blueprint.json with an A1-only blueprint and course.json with 1 unit** (seed-a1.ts:520,537), wiping A2–B2 from the assembled course |
| C6 | "Committed content is A1 only" | README:19 | **stale** | see A18 |
| C7 | `npm test` / `typecheck` offline with MockProvider | README:16 | done | typecheck rc=0; test 4 files / 26 tests pass |
| C8 | Generates "the CEFR A1→B2 curriculum" | root README:14 | partial | 7 units, 29 skills, **1 lesson per skill, 6 exercises per lesson** (174 total, 342 vocab), hand-authored |

### app/README.md, app/package.json

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| P1 | Lessons and pronunciation run in Expo Go | README:18 | partial: the lesson code is complete; not run on a device or in Expo Go | lesson engine app/src/features/lesson/*; 5 exercise components; jest tests for 4 of 5 (no Speak test) |
| P2 | Voice tutor works in a dev build (`expo run:android/ios`) or an EAS dev build with `expo-dev-client` | README:20-24 | **missing setup** (subagent-confirmed); not run: needs a device | `@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc` are neither installed nor in app.json plugins (app.json:37-47), though LiveKit's Expo docs require both; `expo-dev-client` is not a dependency; `AudioSession.startAudioSession()` is never called. `registerGlobals()` is present (VoiceCallLive.tsx:8) |
| P3 | Zustand, TanStack Query, secure-store JWTs, auto-refresh on 401 | README:28 | done | app/src/state/authStore.ts; app/src/api/client.ts:36-74 (deduped refresh), :117-128; tokenStorage.ts |
| P4 | Barge-in in the call UI | README:35; VoiceCallLive.tsx:30 | partial | Barge-in works through the agent's VAD (agent.py:183). The app's "interrupt" button publishes `lk.interrupt` data (VoiceCallLive.tsx:97-101), but **nothing in voice-agent consumes it**, so that button does nothing |
| P5 | `npx tsc --noEmit`, `npx jest` | README:41-42 | done | tsc rc=0; jest 8 suites / 25 tests pass |
| P6 | `EXPO_PUBLIC_API_BASE_URL` → app.json extra → localhost | app/.env.example; config.ts | done | config.ts:9-17 |
| P7 | `web` script | package.json:46 | doubtful, not run | expo-secure-store has no web support; FOLLOWUPS treats web as out of scope |
| P8 | Expo dependency health | n/a | **4 expo-doctor checks fail** | invalid `newArchEnabled` key in app.json; missing peers `react-dom` (@livekit/components-react), `expo-asset` (expo-audio); expo@57.0.2 affected by the Hermes V1 memory regression (fix ≥57.0.9 / RN ≥0.86.2); 16 packages behind SDK pins (@types/jest major) |

### voice-agent/README.md, Dockerfile, requirements.txt

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| V1 | Every module imports with zero env vars | README:81-86; ci.yml comment | done | `env -i python -c 'import agent, config, prompts, turn_logger, latency_probe'` rc=0 after full install |
| V2 | `py_compile` and unittest | README:155-161 | done | 9 tests OK, with and without deps installed |
| V3 | Pinned deps install cleanly together | requirements.txt:7-8 | done | pip install rc=0, `pip check` clean (Python 3.11) |
| V4 | AgentSession tuning (interruption/endpointing/preemptive) | agent.py:174-193 | done (API exists) | livekit-agents 1.6.4 has a `turn_handling` parameter; `AgentSession(turn_handling={…same dict…})` constructs OK. The call itself is not run: needs keys |
| V5 | Level/scenario read from room metadata | README:30-37 | done | agent.py:144-170; backend sets it (livekit.ts:38-49). The app never sends a `scenario` (useTutor.ts:10 takes one, VoiceCallLive.tsx:40 passes only level) |
| V6 | `latency_probe.py --mock` prints labelled simulated figures | README:138-148 | done | rc=0, "SIMULATED" labels and "not a real measurement" note |
| V7 | Live latency probe / worker `dev`/`start` | README:91-104 | not run: needs LiveKit/Groq/Azure keys |  |
| V8 | "A python3.11 venv already exists at voice-agent/.venv" | README:47-48 | **contradicted** for a fresh clone | `.venv` is gitignored (.gitignore) and absent from the clone |
| V9 | Refers to "the project plan" for details | README:108,170,173; prompts.py:9 | missing | no plan document in the repo |
| V10 | Deepgram STT swap seam | README:110-128 | done (code), not run | agent.py:77-85; plugin intentionally not installed |
| V11 | Docker image (python:3.11-slim, non-root) | Dockerfile | done in CI | Release run green; not rebuilt here (same pip set installed fine) |

### CI, scripts, TODOs

| # | Claim | Source | Verdict | Evidence |
|---|---|---|---|---|
| T1 | CI uses Node 22 and Python 3.11 | ci.yml | done | matched locally: node:22-bookworm-slim, python:3.11-slim |
| T2 | Root `npm test` | package.json:11 | done; backend only | runs only the backend workspace (51/51) |
| T3 | Root `backend` / `content` scripts | package.json:12-13 | done | thin aliases |
| T4 | Only TODO in code | VoiceCallLive.tsx:107 | open | session-end on disconnect (= #11) |

---

## 2. Run results

All runs used podman on a copy of the clone (`/tmp/bosnia-audit/repo*`). Nothing was installed on the host.

| Command (container) | Exit | Result |
|---|---|---|
| `npm ci` (root, node:22) | 0 | |
| `npm run typecheck -w @bosanski/backend` | 0 | |
| `npm test -w @bosanski/backend` | 0 | 7 files, **51/51 pass** (146 s) |
| `npm run typecheck -w @bosanski/content` | 0 | |
| `npm run test -w @bosanski/content` | 0 | 4 files, **26/26 pass** |
| `npm test` (root) | 0 | backend only, 51/51 |
| `npm run build -w @bosanski/backend` | 0 | emits `dist/src/index.js` |
| `npm start -w @bosanski/backend` (via `cd backend && npm start`) | **1** | `node dist/index.js`: module not found |
| `node dist/src/index.js` + GET /health | 0 | `{"ok":true}`; auto-seed skipped (wrong content path, B8) |
| `npm run seed -w @bosanski/backend` | 0 | 7 units / 29 skills / 29 lessons / 174 exercises |
| `npm run validate -w @bosanski/content` | 0 | 0 errors, 12 warnings |
| `npm run audio -w @bosanski/content` (no key) | 0 | 0 new, 400 cached, manifest unchanged |
| `npm run seed-a1 -w @bosanski/content` | **1** | missing script |
| `npm run db:migrate -w @bosanski/backend` | **1** | src/db/migrate.ts not found |
| `npm run db:generate -w @bosanski/backend` | **1** | drizzle config not found |
| `npm audit --omit=dev` (root) | 1 | **5 high**: fastify ≤5.12.4, find-my-way ≤9.6.0, @fastify/busboy ≤3.2.1, fast-uri, zod <4.6.6 |
| `cd app && npm ci` | 0 | |
| `npx tsc --noEmit` (app) | 0 | |
| `npx jest` (app) | 0 | 8 suites, **25/25 pass** |
| `npx expo-doctor` (app) | 1 | 4 checks failed (P8) |
| `npx expo config --type public` | 0 | |
| `python -m py_compile *.py` (3.11, no deps / with deps) | 0 / 0 | |
| `python -m unittest discover -s tests -t .` (no deps / with deps) | 0 / 0 | **9/9 OK** |
| `pip install -r requirements.txt` + `pip check` | 0 / 0 | clean |
| zero-env import of all 5 modules | 0 | |
| `python latency_probe.py --mock` | 0 | simulated, labelled |
| AgentSession `turn_handling` construct check | 0 | API present in livekit-agents 1.6.4 |
| `podman build -f backend/Dockerfile .` + run | 0 | auto-seeds, /health OK, seed script OK; ignores SIGTERM |
| Live black-box probe (dev server, no keys) | — | register 200; courses 4 levels; first lesson 200 (answers in payload, PLACEHOLDER audio); locked lesson 403; tutor/session 500; pronunciation 500; turns/session-end/logout 404; refresh replay 401 but child still valid; 30 bad logins no 429; CORS reflects any origin |
| Boot with DATABASE_URL + dev secrets | 1 | boot guard refuses (intended) |

**Not run:**
- Real Postgres: no database here. Covers D5, the concurrent-refresh race and the migration path.
- LLM content generation: needs ANTHROPIC_API_KEY or OPENAI_API_KEY.
- Azure TTS synthesis: needs AZURE_SPEECH_KEY.
- Groq smoke test and live pronunciation: needs GROQ_API_KEY.
- Voice-agent worker, live latency probe and an end-to-end call: needs LiveKit, Groq and Azure keys.
- App on a device, Expo Go or a dev build: needs a device or simulator.
- voice-agent image build: CI builds it; the same pip set installed cleanly here.

**CI comparison:** `gh run list` shows 7 runs, all **success**: CI ×3 and Release ×4 (including tag v0.1.0), the latest on 2026-07-08 for `460501b`. There have been no runs since. The local results match CI exactly. CI does not run `build`, `npm start`, `validate`, `db:*` or expo-doctor, which is why those breakages never showed up.

---

## 3. Undocumented, dead or half-wired code

- **Dead UI control:** the app's "interrupt" button publishes on `lk.interrupt`, and nothing receives it (P4).
- **Turn logging needs pieces that don't exist:**
  - voice-agent `TurnLogger` backend delivery is fully written but has no endpoint to call.
  - Nothing deploys `BACKEND_TURNS_URL`.
  - Its payload shape doesn't match `tutor_turns`; see A11a for the mismatches.
- **`content/scripts/seed-a1.ts` is a trap:** there is no npm script for it, and running it shrinks the course back to A1 (C5).
- **Unused `scenario`:** the backend and agent support a role-play `scenario` end to end, but the app never sends one (V5).
- **Pronunciation "tip generator":** a hook comment only (routes/pronunciation.ts:38-42); no code.
- **Grading happens on the client:**
  - `GET /api/lessons/:id` sends the answers to the app.
  - `lesson-complete` trusts the client's `correctCount`, clamped to the lesson's exercise count (progress.ts:106-112).
  - So XP and unlocks can be faked up to that cap. This looks intended but is not documented.
- **Seeding never deletes:** `seedCourse` only upserts, so content removed from the JSON stays in the DB.
- **Undocumented settings:** `AUTO_SEED` and `CONTENT_DIR` for the compiled server, and the `smoke:groq` script (B8, B9).
- **Logout is client-only:** the app deletes its tokens, but the server-side refresh token stays valid for 30 days.
- **Vocab audio is never used:** all 342 vocab items get audio hashes, but the backend never exposes vocab audio; only exercises carry `audioUrl`.
- **No graceful shutdown:** the backend has no SIGTERM handler (B7).
- **No CODEOWNERS, issue templates or lint config:** there is no ESLint, Prettier or ruff, so no lint step exists to run.
