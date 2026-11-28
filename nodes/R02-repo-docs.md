# R02 — repo-docs

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | B12, D07, D08, R04 | S |

**Owns:** `README.md`, `FOLLOWUPS.md`, `.env.example`

## Purpose

Imported from the code. `README.md` introduces the app (Ljiljan, for learning Bosnian), the four packages and
what each does, a diagram of how they talk (app → backend → Groq Whisper for pronunciation; the backend mints a
LiveKit token for the app at `POST /api/tutor/session`, and the app joins the LiveKit room with the voice agent;
content → backend seed → Postgres), the key decisions and caveats (keys server-side, coarse pronunciation scoring,
`bs-BA` voice authenticity over latency, generated content shipped `unreviewed`), local development without
Docker (PGlite, `npm install`, `npm test -w @bosanski/backend`, `npm run dev -w @bosanski/backend`), and CI/CD
with a pointer to `DEPLOY.md`.

`FOLLOWUPS.md` is the backlog of deferred work: tutor turn persistence and session end, refresh-token reuse
detection, the CORS allowlist; the known MVP limitations (no voice tutor in Expo Go, coarse scoring, unreviewed
content, placeholder reference audio, "A1 only" curriculum, no auth rate limiting, a live voice path that needs
real keys); and a done item (dotenv replaced by `process.loadEnvFile()`).

`.env.example` is the template for the root `.env` that `backend/src/env.ts` loads first: the server-side
settings for the backend, the content pipeline and the voice agent (`DATABASE_URL`, `PGLITE_PATH`, the two JWT
secrets with `dev-` defaults, `PORT`, `GROQ_API_KEY`, the Azure speech key, region and voice, the three
LiveKit settings, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), with a note that local dev and tests need none of
them and that the app's public settings live in `app/.env.example`.

## Tests

None: no test reads these files.

## Changes

none: imported

## Gate

- **R02-AC-1** — `README.md` describes the four packages, how they fit together, the key decisions, local development without Docker, and CI/CD with a pointer to `DEPLOY.md`. *Verify:* `backend/test/compose-stack.test.ts` ("pin R02-AC-1: README.md describes the packages, design, local development and CI/CD"), pinned by D07.
- **R02-AC-2** — `FOLLOWUPS.md` lists the deferred work and the known MVP limitations, and records done items under "Done". *Verify:* unpinned.
- **R02-AC-3** — `.env.example` holds no secret value: every value is blank except `PORT=3000` and the JWT secrets' `dev-` defaults, which the backend refuses outside local PGlite mode. *Verify:* `backend/test/env.test.ts` ("pin R02-AC-3: .env.example holds no secret value"), pinned by B12.
- **R02-AC-4** — `.env.example` names the backend's settings that `backend/src/env.ts` reads, other than `AUTO_SEED`. *Verify:* `backend/test/env.test.ts` ("pin R02-AC-4: .env.example names every setting env.ts reads"), pinned by B12.

## Risks

- `FOLLOWUPS.md` says the curriculum is "A1 only"; the A1→B2 curriculum is committed (`SPEC.md`, State).
- `FOLLOWUPS.md` refers to its items as `#11`, `#12`, `#15`: these are code-review finding numbers, not this
  repository's issue numbers.
- `.env.example` omits settings the code reads: the backend's `AUTO_SEED`, and the voice agent's
  `BACKEND_TURNS_URL`, `BACKEND_TURNS_TOKEN`, `DEEPGRAM_API_KEY`, `LLM_PROVIDER`, `STT_PROVIDER`,
  `GROQ_LLM_MODEL`, `GROQ_STT_MODEL`, `OPENAI_LLM_MODEL` and `TUTOR_DEFAULT_LEVEL`. The backend's `CONTENT_DIR`
  (`backend/src/auto-seed.ts`, `backend/scripts/seed-course.ts`, set by `backend/Dockerfile`) and the content
  pipeline's `CONTENT_DATA_ROOT` (`content/src/paths.ts`) are not listed either.
- `.env.example` says the AI features "degrade gracefully" without their keys, but a missing Groq or LiveKit
  key gives a 500 (`SPEC.md`, Known gaps).
- `.env.example` presents itself as the template for the backend, the content pipeline and the voice agent, but
  only the backend loads the root `.env`: the content scripts run plain `tsx`, and the voice agent's `config.py`
  reads only `os.environ` (`voice-agent/README.md`).
- `README.md` says "The app only ever talks to `backend/`", but the app joins the LiveKit room directly.
- The README's local-development section runs only the backend's tests and never mentions the app's own
  `npm ci` in `app/`.
- These files describe the code but no test ties them to it, so they go stale silently when a node changes a
  behaviour they document.
