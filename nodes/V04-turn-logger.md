# V04 — turn-logger

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | V01 | V05 | S |

**Owns:** `voice-agent/turn_logger.py`

## Purpose

Imported from the code. `voice-agent/turn_logger.py` records the tutor's conversation turns, one `TurnLogger`
per room.

- `TurnRecord` is `{session_id, role ("user" or "assistant"), text, level, scenario, created_at}`, the time in
  epoch seconds.
- `log_turn(role, text, *, level, scenario=None)` is synchronous: it logs `turn <JSON>` (non-ASCII kept) at
  INFO on the `voice-agent.turns` logger. When a backend URL is set it also schedules a background task on the
  running event loop that POSTs the record as JSON, with `Authorization: Bearer <token>` when a token is set;
  without a running loop it logs a warning and skips the delivery.
- Delivery is best effort: any error (including a non-2xx answer) is logged and swallowed, never raised into
  the voice loop, and there is no retry. The `httpx.AsyncClient` (5 s timeout) is created on the first
  delivery, so importing the module or building a logger touches no network.
- `aclose()` waits for the pending deliveries and closes the client.

## Tests

None.

## Changes

none: imported

## Gate

- **V04-AC-1** — Each turn is logged locally as JSON with its session id, role, text, level, scenario and time, whether or not a backend URL is set. *Verify:* unpinned.
- **V04-AC-2** — With a backend URL, each turn is POSTed there as JSON in the background, with the bearer token when one is set. *Verify:* unpinned.
- **V04-AC-3** — A failed or refused delivery is logged and never raised to the caller; the local log line stays. *Verify:* unpinned.
- **V04-AC-4** — Without a backend URL, no HTTP client is created. *Verify:* unpinned.
- **V04-AC-5** — `aclose()` waits for in-flight deliveries before closing the client. *Verify:* unpinned.

## Risks

- The backend has no turns endpoint yet (OD6; `FOLLOWUPS.md` #11), so a set `BACKEND_TURNS_URL` only produces
  logged delivery errors.
- `session_id` is the LiveKit room name (V05), not the backend's `tutor_sessions` id; an endpoint has to map
  one to the other.
- A turn that fails to deliver is lost to the backend (no retry, no queue); only the log line keeps it.
- Whether the log line reaches stdout depends on the logging set-up of the process (LiveKit's CLI in V05), not
  on this module.
- The package's tests use the standard library only (`AGENTS.md`), so a delivery test has to stub
  `_get_client` rather than rely on `httpx` (V01).
