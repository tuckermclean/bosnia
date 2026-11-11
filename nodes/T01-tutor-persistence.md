# T01 — tutor-persistence

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | W04 | none | M |

**Owns:** `backend/src/routes/tutor.ts`, `backend/src/db/schema.ts`, `backend/src/db/ddl.ts` (or a new migration, if B03 merged first), `backend/src/env.ts` (`BACKEND_TURNS_TOKEN`), `app/src/api/tutor.ts`, `app/src/hooks/useTutor.ts`, `app/src/features/tutor/VoiceCallLive.web.tsx` (end-call hook), `app/src/features/tutor/VoiceCallLive.tsx` (remove the TODO; same hook), `deploy/voice-agent-deployment.yaml`, `deploy/backend-secret.example.yaml`, `.env.example`, `backend/README.md` (tutor section), `FOLLOWUPS.md` (#11 entry)

## Purpose

FOLLOWUPS #11: `tutor_turns` and `tutor_sessions.ended_at`/`duration_sec` are written by no route.
The voice agent's `TurnLogger` already posts each turn to `BACKEND_TURNS_URL` with a bearer
`BACKEND_TURNS_TOKEN`, but (`docs/AUDIT.md`, A11, A11a, D8):

- `POST /api/tutor/turns` and a session end do not exist (both 404 on the live probe);
- the agent sends the LiveKit room name as `session_id`, while `tutor_turns.session_id` references
  `tutor_sessions.id`, and `room_name` has no index;
- the agent's roles are `user`/`assistant`, the schema's `learner`/`tutor`;
- the agent sends a static token, which the user-JWT check rejects;
- no manifest sets `BACKEND_TURNS_URL` or `BACKEND_TURNS_TOKEN`.

The owner chose (Q5): look sessions up by `room_name` (unique), a shared service token checked by the
backend (OD9), map the roles, and end the session from the call screen. The agent's payload is
`{ session_id, role, text, level, scenario, created_at }` (`voice-agent/turn_logger.py`); this node
does not change the agent.

## Tests

Vitest tests for both endpoints and the index; a jest test for the web call screen's end hook. Red
target, e.g. `npm test -w @bosanski/backend -- test/tutor-turns.test.ts`.

## Changes

1. A unique index on `tutor_sessions.room_name`. *T01-AC-1.*
2. `POST /api/tutor/turns`: bearer `BACKEND_TURNS_TOKEN` (constant-time comparison; 503 if the
   backend has none), body validated, session found by room name, role mapped
   (`user`→`learner`, `assistant`→`tutor`), a `tutor_turns` row written. *T01-AC-2, T01-AC-3,
   T01-AC-4.*
3. `POST /api/tutor/session/:id/end`: user JWT, own session only, sets `ended_at` and
   `duration_sec` once. *T01-AC-5.*
4. The call screens call session end once when the learner ends the call or the room disconnects;
   the TODO in `VoiceCallLive.tsx` is resolved. *T01-AC-6.*
5. Manifests and examples: `BACKEND_TURNS_URL=http://backend/api/tutor/turns` in the voice-agent
   deployment, `BACKEND_TURNS_TOKEN` in the secret example and `.env.example`; FOLLOWUPS #11 marked
   as planned in `docs/graph.yaml`. *T01-AC-7.*

## Gate

- **T01-AC-1** — Inserting two `tutor_sessions` rows with the same `room_name` fails. *Verify:* a vitest test on a test database.
- **T01-AC-2** — With `BACKEND_TURNS_TOKEN=s3cret`, `POST /api/tutor/turns` with `Authorization: Bearer s3cret` and the agent's payload (`session_id` = an existing session's room name, `role` `user` or `assistant`, `text`, `level`, `scenario`, `created_at`) answers 204 and writes a `tutor_turns` row for that session with role `learner` or `tutor` and `text_bs` = `text`. *Verify:* vitest tests for both roles.
- **T01-AC-3** — A missing or wrong token, or a user access token, answers 401; with no `BACKEND_TURNS_TOKEN` configured the endpoint answers 503; no row is written in any case. *Verify:* vitest tests.
- **T01-AC-4** — An unknown room name answers 404 and a body missing `text` or with another `role` answers 400. *Verify:* vitest tests.
- **T01-AC-5** — `POST /api/tutor/session/:id/end` by the session's owner answers 200 with `durationSec` and sets `ended_at` and `duration_sec` (end minus start, in seconds); a second call changes nothing and answers the same values; another user's or an unknown session answers 404. *Verify:* vitest tests.
- **T01-AC-6** — On the web call screen, pressing End or the room disconnecting calls the session-end API exactly once with the session id. *Verify:* a jest test of `VoiceCallLive.web.tsx` with the LiveKit modules and the tutor API mocked.
- **T01-AC-7** — `deploy/voice-agent-deployment.yaml` sets `BACKEND_TURNS_URL`, and `BACKEND_TURNS_TOKEN` is in `deploy/backend-secret.example.yaml` and `.env.example`. *Verify:* `grep -q BACKEND_TURNS_URL deploy/voice-agent-deployment.yaml && grep -q BACKEND_TURNS_TOKEN deploy/backend-secret.example.yaml && grep -q BACKEND_TURNS_TOKEN .env.example` exits 0.

## Risks

- The agent posts turns in the background and logs failures; a misconfigured token loses turns
  silently on the backend side. The 401/503 answers show up in the agent's logs.
- Schema change ordering with B03: see B03's Risks.
- The native screen is not a goal (OD1); its end hook is changed only to keep it consistent, and is
  not separately tested.
