# B09 — tutor-session

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B03, B04, B05 | A03, B10 | S |

**Owns:** `backend/src/routes/tutor.ts`, `backend/test/tutor.test.ts`

## Purpose

Imported from the code. `backend/src/routes/tutor.ts` defines `POST /api/tutor/session` (logged in, B05), the
backend's part of the voice tutor. The body `{level?, scenario?}` takes a CEFR `level` of A1, A2, B1 or B2 (else
400) and a non-empty `scenario`; an empty body is allowed. The route names a room `tutor-<userId>-<8 hex
characters>`, asks the minter (B04) for a token for the user in that room with `{level, scenario}` as the room's
metadata, which `voice-agent/agent.py` reads, then saves a `tutor_sessions` row (id, user, room, level or null)
and returns `{sessionId, roomName, token, url}`. The app joins LiveKit with that token; the voice loop itself runs
in the voice agent, not here.

## Tests

`backend/test/tutor.test.ts`: a session with a fake minter (the response and the saved row), no token, the
metadata passed to the minter with the level saved, and an invalid level. The server's integration test (B10)
also opens a session.

## Changes

none: imported

## Gate

- **B09-AC-1** — `POST /api/tutor/session` returns the minter's token and URL, a room name starting with `tutor-` and a session id, and saves a session row with that id and room and a null level. *Verify:* `backend/test/tutor.test.ts` ("mints a room token, returns a sessionId, and records a tutor session").
- **B09-AC-2** — Without a bearer token the route is answered 401. *Verify:* `backend/test/tutor.test.ts` ("rejects tutor session requests without auth").
- **B09-AC-3** — The requested `level` and `scenario` are passed to the minter as the room's metadata, and the level is saved on the session. *Verify:* `backend/test/tutor.test.ts` ("forwards {level, scenario} to the LiveKit minter as room metadata, and persists level").
- **B09-AC-4** — A level other than A1, A2, B1 or B2 is answered 400. *Verify:* `backend/test/tutor.test.ts` ("rejects an invalid CEFR level").

## Risks

- Without the LiveKit settings the minter throws and the route answers 500, not principle 7's 503 (`SPEC.md`,
  known gaps).
- The token is minted before the session row is saved: if the save fails, a token exists without a session, and so does
  a room when `level` or `scenario` was given (the minter creates one only then).
- The room name carries the user's id, which every participant of the room sees.
- The `scenario` is free text, passed to the room's metadata unchecked and not saved.
- No endpoint ends a session or records its turns; `ended_at`, `duration_sec` and `tutor_turns` stay empty
  (`FOLLOWUPS.md`; OD6).
