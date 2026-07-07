# Follow-ups

A running list of known deferred work, so it doesn't get lost. This is not a
roadmap — it's a backlog of things that were deliberately punted during MVP
development.

## Deferred code-review findings

- **#11 — Tutor turn-persistence route + session-end recording.**
  `tutor_turns` and `tutor_sessions.endedAt` / `durationSec`
  (`backend/src/db/schema.ts`) are currently written by no backend route —
  `backend/src/routes/tutor.ts` only exposes `POST /api/tutor/session` to
  start a session. The Python voice agent (`voice-agent/turn_logger.py`)
  currently best-effort-logs turns to stdout instead of persisting them.
  Need to add `POST /api/tutor/turns` (and a session-end call) to the
  backend, then wire `voice-agent/turn_logger.py` and the app's end-call
  flow to call them — otherwise conversation history and session duration
  are never durably recorded.

- **#12 — Refresh-token reuse-detection family.**
  `backend/src/routes/auth.ts` (`POST /api/auth/refresh`) and
  `backend/src/services/auth.ts` implement rotation correctly (each refresh
  revokes the old token and issues a new one), but there's no
  theft-detection: if a already-revoked/reused refresh token is presented,
  the whole token family should be revoked (all descendants of that
  session), not just rejected. Add family tracking so token replay is
  treated as a signal of compromise.

- **#15 — CORS allowlist.**
  `backend/src/app.ts` currently registers `@fastify/cors` with
  `origin: true` (reflects any request origin). This is fine for
  mobile-app-only / local dev use but must be restricted to an explicit
  allowlist before any web deployment.

## Known MVP limitations

- **Pronunciation scoring is coarse.** Scoring relies on Whisper
  transcription, which auto-corrects mispronunciations, so it under-detects
  errors. Path forward: phoneme-level forced alignment instead of
  transcript-diffing.
- **All generated Bosnian content is unreviewed.** Every generated content
  record has `reviewStatus: "unreviewed"` pending native-speaker review
  before it's trusted as pedagogically/linguistically correct.
- **Reference audio is a placeholder.** Audio URLs are `PLACEHOLDER://`
  until an `AZURE_SPEECH_KEY` is configured and
  `npm run audio -w @bosanski/content` is run to synthesize real reference
  audio.
- **Curriculum is A1 only.** Full A1→B2 curriculum generation requires
  running the content generator with a configured LLM key; only A1 has been
  generated so far.
- **No auth rate-limiting yet.** Login/refresh/register endpoints have no
  rate limiting; add `@fastify/rate-limit` before any public deployment.
- **Real end-to-end voice needs live credentials.** Full voice-agent
  round-tripping (LiveKit Cloud + Groq + Azure Speech) is only exercised
  with real keys configured; without them the voice path can't be
  end-to-end tested.

## Done

- **dotenv removed (supply-chain hygiene).** `backend/src/env.ts` now uses
  Node 22's built-in `process.loadEnvFile()` instead of the `dotenv`
  package, which had started bundling unwanted "Claude Code skill"
  markdown and printing self-promotional / third-party-URL noise on
  import. Load order (root `.env` first, then package `.env`) is
  unchanged; each call is wrapped in try/catch since `loadEnvFile` throws
  on a missing file (expected in tests/CI).
