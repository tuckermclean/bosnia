# V05 — voice-worker

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | V01, V02, V03, V04, B09 | V06, V07 | M |

**Owns:** `voice-agent/agent.py`

## Purpose

Imported from the code. `voice-agent/agent.py` is the LiveKit Agents worker that runs the voice tutor
(`python agent.py dev` or `start`, through `cli.run_app` with `entrypoint` and `prewarm`). It reads no setting
at import time (principle 5); the provider plugins are imported inside the builders.

- `build_stt(cfg)`: Groq STT (`cfg.groq_stt_model`, `language="bs"`), or Deepgram (`language="bs"`) when
  `STT_PROVIDER=deepgram`; another value raises `ValueError`.
- `build_llm(cfg)`: Groq (`cfg.groq_llm_model`), or OpenAI when `LLM_PROVIDER=openai`; another value raises
  `ValueError`.
- `build_tts(cfg)`: Azure TTS, always, with the configured voice, language `bs-BA` and the Azure key and region
  (principle 2: only the voice is configurable).
- `prewarm(proc)` loads Silero VAD once per worker process (minimum speech 0.05 s, minimum silence 0.4 s).
- `entrypoint(ctx)` calls `load_config()` (V03), connects with audio-only subscription, and reads the job's
  metadata, else the room's, as JSON (B09 sets `{level, scenario}`); unparsable metadata reads as empty, with a
  warning, and non-object metadata reads as empty. The level defaults to `TUTOR_DEFAULT_LEVEL`, the scenario to none. It builds an
  `AgentSession` with the VAD (loaded again with defaults if prewarm did not run), STT, LLM and TTS, and turn
  handling: interruption on (minimum 0.3 s), endpointing 0.3–2.5 s, preemptive generation and TTS on. Each
  conversation item that is a user or assistant message with text is passed to a `TurnLogger` (V04) built with
  the room name as the session id and the backend turn settings; tool calls and empty items are skipped. The
  agent's instructions are `build_system_prompt(level, scenario)` (V02); shutdown closes the turn logger.

## Tests

None: the module imports `livekit.agents` at the top, and the package's tests use the standard library only.
CI's `python -m py_compile *.py` checks its syntax after installing the dependencies (V01). A real call needs
LiveKit, Groq and Azure keys and is checked by hand (OD7).

## Changes

none: imported

## Gate

- **V05-AC-1** — The STT is Groq Whisper with language `bs` by default and Deepgram with `STT_PROVIDER=deepgram`; the LLM is Groq by default and OpenAI with `LLM_PROVIDER=openai`; an unknown provider raises `ValueError`. *Verify:* unpinned.
- **V05-AC-2** — The TTS is always Azure with language `bs-BA` and the configured voice. *Verify:* unpinned.
- **V05-AC-3** — The session's level and scenario come from the job's or room's JSON metadata; missing, unparsable or non-object metadata falls back to `TUTOR_DEFAULT_LEVEL` and no scenario without failing the call. *Verify:* unpinned.
- **V05-AC-4** — The agent's instructions are `build_system_prompt(level, scenario)`. *Verify:* unpinned.
- **V05-AC-5** — Every user and assistant message with text is passed to the turn logger with the session's level and scenario; other items are not. *Verify:* unpinned.
- **V05-AC-6** — Interruption, endpointing and preemptive generation use the values above, and the VAD is loaded once per process in `prewarm`. *Verify:* unpinned.
- **V05-AC-7** — Settings are validated only when a job starts (`load_config()` in `entrypoint`), not at import. *Verify:* unpinned.

## Risks

- `py_compile` checks syntax only: it does not import the module, so principle 5 (import with zero env vars) is
  not checked by CI for this file.
- A missing key raises `ConfigError` inside each job's `entrypoint`, not at worker start: the worker registers
  and takes jobs without keys, and each call fails; principle 7 asks for a non-zero exit naming the key.
- A level in the metadata other than A1–B2 makes `build_system_prompt` raise, and the call fails; the backend
  checks the level (B09), but job metadata or `TUTOR_DEFAULT_LEVEL` are not checked.
- The app's interrupt button publishes `{"type":"interrupt"}` on the data topic `lk.interrupt` (A08); this
  module registers no handler for it, so the code does not show that it interrupts the tutor.
- `STT_PROVIDER=deepgram` fails at the import of the plugin, which `requirements.txt` does not install (V01).
- The `turn_handling` options and event names depend on the pinned `livekit-agents` 1.6.4 API; no test pins
  them, so a version bump can break them unnoticed until a real call.
