# V03 — agent-config

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | V05, V06 | S |

**Owns:** `voice-agent/config.py`

## Purpose

Imported from the code. `voice-agent/config.py` reads the worker's settings from `os.environ` (it loads no
`.env` file). Nothing is read at import time (principle 5): `load_config(*, require_livekit=True)` builds a
frozen `VoiceAgentConfig` when called. An empty variable counts as unset.

- Providers: `STT_PROVIDER` and `LLM_PROVIDER`, lower-cased, default `groq`.
- Required, raising `ConfigError` (a `RuntimeError`) whose message names the missing variable: `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (with `require_livekit=False` they are read if set and left empty
  otherwise); `GROQ_API_KEY` when either provider is `groq`; `DEEPGRAM_API_KEY` when STT is `deepgram`;
  `OPENAI_API_KEY` when the LLM is `openai`; `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` always.
- Defaults: `AZURE_TTS_VOICE` `bs-BA-VesnaNeural` (language `bs-BA`), `GROQ_STT_MODEL`
  `whisper-large-v3-turbo`, `GROQ_LLM_MODEL` `llama-3.3-70b-versatile`, `OPENAI_LLM_MODEL` `gpt-4.1-mini`,
  `TUTOR_DEFAULT_LEVEL` `A1` (upper-cased). `BACKEND_TURNS_URL` and `BACKEND_TURNS_TOKEN` are optional.

## Tests

None. CI's `python -m py_compile *.py` compiles the module; no test calls `load_config`.

## Changes

none: imported

## Gate

- **V03-AC-1** — Importing the module reads no environment variable and raises nothing with none set. *Verify:* unpinned.
- **V03-AC-2** — A missing required variable raises `ConfigError` whose message names it. *Verify:* unpinned.
- **V03-AC-3** — Only the selected providers' keys are required: no `DEEPGRAM_API_KEY` or `OPENAI_API_KEY` unless selected, no `GROQ_API_KEY` when neither provider is `groq`, and no LiveKit settings with `require_livekit=False`. *Verify:* unpinned.
- **V03-AC-4** — Unset optional settings take the defaults above, and an empty variable counts as unset. *Verify:* unpinned.

## Risks

- Nothing is tested. The module uses the standard library only, so a test of it fits the package's
  standard-library-only tests.
- An unknown provider name is accepted here and fails later in `build_stt`/`build_llm` (V05) with a
  `ValueError`; an unknown `TUTOR_DEFAULT_LEVEL` is accepted here and fails in `build_system_prompt` (V02).
- The Azure settings are required even for a run that uses no TTS, such as `latency_probe.py --stage stt` (V06).
- `ConfigError`'s message says to set the variable "in your shell or a .env file", but nothing in the package
  loads a `.env` file.
