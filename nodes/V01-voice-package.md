# V01 — voice-package

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | V04, V05, V06, V07 | S |

**Owns:** `voice-agent/README.md`, `voice-agent/requirements.txt`

## Purpose

Imported from the code. `voice-agent/` is a standalone Python package (not an npm workspace, not an installed
package): the LiveKit Agents worker that runs the voice tutor. These two files describe and pin it.

- `voice-agent/README.md` describes the pipeline (Silero VAD, Groq Whisper STT with `language=bs`, a pluggable
  LLM, Azure `bs-BA` TTS), how a call is connected (the backend's `POST /api/tutor/session` mints the token and
  sets `{"level", "scenario"}` as room metadata, the app joins, the worker is dispatched into the room), the
  environment variables and which are required, running the worker (`python agent.py dev` / `start`),
  swapping the STT provider, the latency probe, the tests (`python -m unittest discover -s tests -t .`), and
  known limitations (chunked Bosnian STT, unreviewed prompt wording, no noise cancellation).
- `voice-agent/requirements.txt` pins `livekit-agents` and the `silero`, `groq`, `openai` and `azure` plugins
  at `1.6.4`, and `httpx>=0.27,<1` for the turn logger (V04). `livekit-plugins-deepgram` is listed commented
  out, for `STT_PROVIDER=deepgram`. CI installs this file before the voice-agent checks; the image (V07)
  installs it too.

## Tests

None: documentation and a dependency list. CI's voice-agent job runs `pip install -r requirements.txt` under
Python 3.11, then `python -m py_compile *.py` and the unit tests (V02), so an uninstallable pin fails that job.

## Changes

none: imported

## Gate

- **V01-AC-1** — `requirements.txt` pins `livekit-agents`, `livekit-plugins-silero`, `livekit-plugins-groq`, `livekit-plugins-openai` and `livekit-plugins-azure` to the same version, `1.6.4`, and lists `httpx`. *Verify:* unpinned (CI's install step, not a test).
- **V01-AC-2** — The Deepgram plugin is not installed by default. *Verify:* unpinned.
- **V01-AC-3** — The README's test command is the one the gate runs for this package (`python -m unittest discover -s tests -t .` from `voice-agent/`). *Verify:* unpinned.

## Risks

- `httpx` is a range (`>=0.27,<1`), not a pin, unlike the rest (principle 6).
- The README says a `.venv` "already exists" in `voice-agent/`; it is not tracked, so a fresh clone has none.
- The README says required settings are validated in `entrypoint`/`prewarm`; only `entrypoint` calls
  `load_config()` (V05).
- The README describes `BACKEND_TURNS_URL` as the backend's `tutor_turns` endpoint, which does not exist yet
  (OD6; `FOLLOWUPS.md`).
- The README's noise-cancellation note names `RoomInputOptions`, which `agent.py` does not use.
- `livekit-plugins-silero` is deprecated upstream (the file says so); a LiveKit bump has to move all five pins
  together.
