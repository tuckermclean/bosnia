# voice-agent

The real-time, full-duplex **Bosnian voice tutor** for Ljiljan. A [LiveKit
Agents](https://docs.livekit.io/agents/) worker (Python) that joins a
learner's LiveKit room and runs a low-latency, interruptible pipeline:

```
Silero VAD (endpointing + barge-in)
  -> streaming/chunked STT   (Groq whisper-large-v3-turbo, language=bs)
  -> fast multilingual LLM   (pluggable; default Groq llama-3.3-70b-versatile)
  -> Azure Neural TTS bs-BA  (Vesna / Goran, streamed sentence-by-sentence)
  -> audio back to the room
```

Tuned for a **~0.6-1s** reply feel, with the learner able to interrupt the
tutor mid-sentence (barge-in). The tutor speaks **Bosnian only** at every
CEFR level (A1-B2) -- see `prompts.py`.

This package is scoped to the voice-agent worker only. It does not include
the LiveKit server, the backend, or the Expo app -- see the monorepo root
for those.

## How a call actually gets connected

1. The Expo app calls the backend's `POST /api/tutor/session`.
2. The backend mints a short-lived **LiveKit access token**, creates/looks up
   the room, and returns the room name + token + LiveKit URL to the app. It
   should also set the learner's CEFR level (and optional role-play
   scenario) as **room metadata**, JSON-encoded, e.g.:
   ```json
   {"level": "A2", "scenario": "cafe"}
   ```
   `agent.py`'s `_session_metadata()` reads this (falling back to
   `TUTOR_DEFAULT_LEVEL` / no scenario if it's missing or unparsable).
3. The app joins the room with the LiveKit React Native SDK, using that token.
4. **This worker** (a separate, always-on process registered with the same
   LiveKit server/project) gets dispatched into the same room automatically
   and runs the VAD -> STT -> LLM -> TTS loop against the learner's audio.

The worker never talks to the backend or the app directly over HTTP for the
call itself -- everything happens over the LiveKit room. The one optional
HTTP integration is outbound: turn logging to the backend's `tutor_turns`
endpoint (see `turn_logger.py` and `BACKEND_TURNS_URL` below).

## Setup

A python3.11 venv already exists at `voice-agent/.venv` (pip only, no
`uv`/poetry). Reuse it:

```bash
cd voice-agent
.venv/bin/pip install -r requirements.txt
```

## Environment variables

Set these in your shell, or in a `.env` at the repo root (see
`.env.example`) loaded by your process manager of choice -- `config.py` does
not load `.env` files itself, it only reads `os.environ`.

| Variable | Required | Notes |
|---|---|---|
| `LIVEKIT_URL` | yes (to run the worker) | e.g. `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | yes | from LiveKit Cloud project settings |
| `LIVEKIT_API_SECRET` | yes | from LiveKit Cloud project settings |
| `GROQ_API_KEY` | yes, if `STT_PROVIDER=groq` or `LLM_PROVIDER=groq` (both defaults) | |
| `AZURE_SPEECH_KEY` | yes | Azure Cognitive Services Speech resource |
| `AZURE_SPEECH_REGION` | yes | e.g. `westeurope` |
| `AZURE_TTS_VOICE` | no | default `bs-BA-VesnaNeural`; try `bs-BA-GoranNeural` for the male voice |
| `STT_PROVIDER` | no | `groq` (default) or `deepgram` -- see "Swapping the STT provider" below |
| `LLM_PROVIDER` | no | `groq` (default) or `openai` |
| `GROQ_STT_MODEL` | no | default `whisper-large-v3-turbo` |
| `GROQ_LLM_MODEL` | no | default `llama-3.3-70b-versatile` |
| `DEEPGRAM_API_KEY` | yes, if `STT_PROVIDER=deepgram` | |
| `OPENAI_API_KEY` | yes, if `LLM_PROVIDER=openai` | |
| `OPENAI_LLM_MODEL` | no | default `gpt-4.1-mini` |
| `TUTOR_DEFAULT_LEVEL` | no | default `A1`; used when room/job metadata has no `level` |
| `BACKEND_TURNS_URL` | no | if set, each turn is also POSTed here (`tutor_turns`); omit to log to stdout only |
| `BACKEND_TURNS_TOKEN` | no | sent as `Authorization: Bearer <token>` with `BACKEND_TURNS_URL` |

All required-variable validation happens **lazily**, inside
`config.load_config()`, called from `agent.py`'s `entrypoint`/`prewarm` --
**never at import time**. You can `import agent` (or run
`python -m py_compile agent.py`) with zero environment variables set; you
only need real credentials to actually start the worker or run a live
`latency_probe.py`.

## Running the worker

You need a running LiveKit server. Easiest path: **LiveKit Cloud** (free
tier is enough to start) -- create a project, copy its URL/API key/secret
into your environment, and:

```bash
cd voice-agent
.venv/bin/python agent.py dev      # local development: connects to LiveKit
                                    # Cloud, hot-reloads on save
.venv/bin/python agent.py start    # production worker process
```

`agent.py dev` is the one you want while iterating: it registers the worker
with your LiveKit project and waits for jobs (i.e. learners joining tutor
rooms). Once the backend mints a room + token and the app joins it, this
process gets dispatched into that room and the pipeline starts.

Self-hosting LiveKit (`livekit-server`) instead of LiveKit Cloud works the
same way -- just point `LIVEKIT_URL` at your own server. Out of scope for
this MVP per the project plan.

## Swapping the STT provider

The plan flags **streaming Bosnian STT as the hardest link** in the latency
budget: Whisper-style APIs (Groq included) are chunked per VAD-detected
utterance, not truly word-streaming. If Groq's latency or Bosnian accuracy
proves insufficient in practice, swap providers without touching the app or
backend:

```bash
export STT_PROVIDER=deepgram
export DEEPGRAM_API_KEY=...
.venv/bin/pip install livekit-plugins-deepgram   # not installed by default
```

See `agent.py`'s `build_stt()` -- that's the entire seam. (Verify Deepgram's
actual Bosnian-language coverage before relying on it; it may be thinner
than Groq/Whisper's.) The LLM is similarly pluggable via `LLM_PROVIDER`
(`groq` or `openai`) through `build_llm()` -- the "brain" is deliberately
**not required to be Claude**.

## Measuring latency

`latency_probe.py` times each pipeline stage in isolation (STT whole-request
round trip, LLM time-to-first-token, TTS time-to-first-audio-chunk) against
live Groq/Azure/OpenAI APIs, using a synthetic audio/text fixture (no mic,
no LiveKit room needed):

```bash
.venv/bin/python latency_probe.py             # all three stages, live
.venv/bin/python latency_probe.py --stage tts # just one stage
.venv/bin/python latency_probe.py --mock      # no keys/network required;
                                                # prints clearly-labeled
                                                # SIMULATED figures so the
                                                # report format can be
                                                # exercised offline/in CI
```

It never sums the LLM and TTS stage numbers into a claim about the *live*
pipeline's real latency, because in the running `AgentSession` those two
stages overlap (streaming TTS starts speaking the first sentence while the
LLM is still generating the rest). The printed sum is a conservative
upper-bound estimate for tuning, not a measurement of a live call -- see the
module docstring for the full reasoning.

## Testing

```bash
cd voice-agent
.venv/bin/python -m unittest discover -s tests -t .
```

`tests/test_prompts.py` covers `prompts.build_system_prompt` (Bosnian-only
instruction present, level reflected for every CEFR level, scenario
handling, invalid-level errors) -- pure-function tests, no network or
secrets required.

Everything else in this package is written to be **importable with zero
secrets** (verify with `python -m py_compile agent.py config.py prompts.py
turn_logger.py latency_probe.py`); an actual join-a-room-and-talk smoke test
needs live LiveKit + Groq + Azure credentials and is out of scope for
offline verification (see the project plan's "Voice tutor" verification
section for what that smoke test should assert once infra is available).

## Known limitations (see the project plan for full detail)

- **Bosnian STT is the hardest link.** Groq's whisper-large-v3-turbo is
  chunked per utterance (VAD-gated), not word-streaming -- this is the
  single biggest lever on perceived latency. `STT_PROVIDER` exists precisely
  so this can be swapped without an app/backend change.
- **Content/prompt wording is unreviewed.** Like the rest of this project's
  generated Bosnian content, `prompts.py`'s wording has not been checked by
  a native speaker yet. The *structure* (Bosnian-only, level adaptation,
  gentle correction, role-play) is intentional and should survive review;
  the specific phrasing may need correction.
- **No noise cancellation plugin wired in.** `livekit-plugins-noise-
  cancellation` (or similar) can be added to `RoomInputOptions` in
  `agent.py`'s `entrypoint()` if room noise turns out to hurt STT accuracy
  in practice; not included by default to keep the dependency surface
  minimal for this MVP.
