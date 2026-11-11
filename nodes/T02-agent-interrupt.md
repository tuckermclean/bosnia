# T02 — agent-interrupt

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `voice-agent/interrupts.py` (new), `voice-agent/agent.py`, `voice-agent/README.md` (one line)

## Purpose

The call screen's Interrupt button publishes `{"type":"interrupt"}` as reliable data on topic
`lk.interrupt`, but nothing in the voice agent receives it, so the button does nothing
(`docs/AUDIT.md`, P4). Barge-in by voice already works through the agent's VAD. The owner chose to
have the agent handle the message (Q5).

## Tests

A unittest in `voice-agent/tests/` against a pure handler with a fake session; no LiveKit runtime,
no environment variables (principles 4 and 5). Red target:
`cd voice-agent && python3 -m unittest tests.test_interrupts`.

## Changes

1. `interrupts.py`: a function that takes a data packet's topic and payload and a session, and calls
   `session.interrupt()` for topic `lk.interrupt` with a JSON payload whose `type` is `interrupt`;
   anything else is ignored, and malformed payloads never raise. *T02-AC-1, T02-AC-2, T02-AC-3.*
2. `agent.py` registers it on the room's `data_received` event after the session starts.
   *T02-AC-4.*

## Gate

- **T02-AC-1** — For topic `lk.interrupt` and payload `{"type":"interrupt"}` (bytes), the handler calls the session's `interrupt()` once. *Verify:* a unittest with a fake session.
- **T02-AC-2** — Another topic, another `type`, invalid JSON or non-UTF-8 bytes leave the session untouched and raise nothing. *Verify:* unittest cases.
- **T02-AC-3** — `interrupts.py` imports with no environment variables and without LiveKit installed. *Verify:* `cd voice-agent && env -i python3 -c "import interrupts"` exits 0 in a venv without the requirements, and CI's voice-agent job passes.
- **T02-AC-4** — `agent.py` registers the handler for the room's `data_received` event. *Verify:* `grep -n "data_received" voice-agent/agent.py` finds the registration, `python3 -m py_compile voice-agent/agent.py` exits 0, and the reviewer checks the call against the installed livekit-agents API.

## Risks

- `session.interrupt()` may return an awaitable in the installed livekit-agents version; the handler
  must not leave it unawaited in a way that raises warnings in the voice loop.
- Only the owner's real call (W04's OD10) proves the effect end to end.
