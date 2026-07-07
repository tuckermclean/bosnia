"""LiveKit Agents worker: the real-time Bosnian voice tutor for Ljiljan.

Pipeline (full-duplex, tuned for a ~0.6-1s reply feel):

    Silero VAD (endpointing + barge-in)
      -> STT, chunked on VAD boundaries (default: Groq whisper-large-v3-turbo,
         language="bs" -- see build_stt() for the swap seam)
      -> fast multilingual LLM (default: Groq llama-3.3-70b-versatile --
         deliberately NOT required to be Claude; see build_llm())
      -> Azure Neural TTS bs-BA, streamed sentence-by-sentence (Vesna/Goran --
         the authentic native Bosnian voice; see build_tts())
      -> audio back to the LiveKit room.

Run with (see README.md for full setup):

    python agent.py dev      # connect to LiveKit for local development
    python agent.py start    # production worker

Import-time safety: this module -- and every other module in this package --
must be importable with ZERO environment variables set. All secrets are
validated lazily inside `entrypoint()`/`prewarm()` via `config.load_config()`,
never at module scope. This is what makes
`python -m py_compile agent.py` and unit tests safe to run with no secrets
configured at all.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import LLM as LLMBase
from livekit.agents.stt import STT as STTBase
from livekit.agents.tts import TTS as TTSBase
from livekit.plugins import silero

from config import VoiceAgentConfig, load_config
from prompts import build_system_prompt
from turn_logger import TurnLogger

logger = logging.getLogger("voice-agent")


# ---------------------------------------------------------------------------
# Provider seam #1: STT.
#
# The project plan flags streaming Bosnian STT as the hardest link in the
# latency budget -- Whisper-style models are chunked (one request per VAD-
# detected utterance), not truly word-streaming. If Groq's latency or
# Bosnian-language accuracy proves insufficient in practice, swap the
# provider here via the STT_PROVIDER env var. Nothing else in this file, the
# app, or the backend needs to change.
# ---------------------------------------------------------------------------
def build_stt(cfg: VoiceAgentConfig) -> STTBase:
    provider = cfg.stt_provider

    if provider == "groq":
        from livekit.plugins import groq

        return groq.STT(
            model=cfg.groq_stt_model,  # e.g. "whisper-large-v3-turbo"
            api_key=cfg.groq_api_key,
            language="bs",
        )

    if provider == "deepgram":
        # Swap-in alternative. Requires `pip install livekit-plugins-deepgram`
        # (not installed by default -- see requirements.txt) and
        # DEEPGRAM_API_KEY. IMPORTANT: verify Deepgram's actual Bosnian
        # ("bs") language coverage before relying on this in production --
        # it may be thinner than Groq/Whisper's.
        from livekit.plugins import deepgram

        return deepgram.STT(language="bs", api_key=cfg.deepgram_api_key)

    raise ValueError(f"Unknown STT_PROVIDER {provider!r}; expected 'groq' or 'deepgram'")


# ---------------------------------------------------------------------------
# Provider seam #2: LLM ("the brain").
#
# Deliberately pluggable and NOT required to be Claude -- pick whatever is
# fastest-to-first-token while staying strong at multilingual (Bosnian)
# generation. Groq's hosted inference is the default because it is
# consistently the fastest first-token option available.
# ---------------------------------------------------------------------------
def build_llm(cfg: VoiceAgentConfig) -> LLMBase:
    provider = cfg.llm_provider

    if provider == "groq":
        from livekit.plugins import groq

        return groq.LLM(model=cfg.groq_llm_model, api_key=cfg.groq_api_key)

    if provider == "openai":
        from livekit.plugins import openai as lk_openai

        return lk_openai.LLM(model=cfg.openai_llm_model, api_key=cfg.openai_api_key)

    raise ValueError(f"Unknown LLM_PROVIDER {provider!r}; expected 'groq' or 'openai'")


# ---------------------------------------------------------------------------
# TTS: fixed to Azure Neural bs-BA by architecture decision (this is *why*
# this pipeline exists instead of a native speech-to-speech model -- Azure's
# bs-BA voices are the authentic native Bosnian voice that speech-to-speech
# models can't reliably deliver). Only the specific voice (Vesna/Goran) is
# configurable.
# ---------------------------------------------------------------------------
def build_tts(cfg: VoiceAgentConfig) -> TTSBase:
    from livekit.plugins import azure

    return azure.TTS(
        voice=cfg.azure_tts.voice,  # "bs-BA-VesnaNeural" or "bs-BA-GoranNeural"
        language=cfg.azure_tts.language,  # "bs-BA"
        speech_key=cfg.azure_tts.speech_key,
        speech_region=cfg.azure_tts.speech_region,
    )


def prewarm(proc: JobProcess) -> None:
    """Load the (comparatively expensive) VAD model once per worker process,
    not once per call -- this runs before any job is assigned."""
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        # Tighter than Silero's 0.55s default: the plan's ~0.6-1s reply
        # budget can't absorb more than ~0.3-0.4s of "are they really done
        # talking?" hesitation on top of STT + LLM + TTS latency.
        min_silence_duration=0.4,
    )


def _session_metadata(ctx: JobContext) -> dict[str, Any]:
    """Pull the learner's CEFR level / role-play scenario for this call.

    The backend's `POST /api/tutor/session` mints the LiveKit token and room
    for a learner; it should set this as JSON on the room (or job) metadata,
    e.g. `{"level": "A2", "scenario": "cafe"}`. Missing or unparsable
    metadata degrades gracefully to the configured default level and no
    scenario, rather than failing the call.
    """
    raw = ctx.job.metadata or (ctx.room.metadata if ctx.room else None) or "{}"
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("could not parse job/room metadata as JSON: %r", raw)
        return {}
    return data if isinstance(data, dict) else {}


async def entrypoint(ctx: JobContext) -> None:
    cfg = load_config()

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    meta = _session_metadata(ctx)
    level = str(meta.get("level") or cfg.default_level)
    scenario = meta.get("scenario")
    scenario = str(scenario) if scenario else None

    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    session: AgentSession = AgentSession(
        vad=vad,
        stt=build_stt(cfg),
        llm=build_llm(cfg),
        tts=build_tts(cfg),
        turn_handling={
            # Barge-in: the learner can always interrupt the tutor mid-
            # sentence. min_duration keeps a stray cough from cutting off a
            # reply, without being so long that real interruptions feel ignored.
            "interruption": {"enabled": True, "min_duration": 0.3},
            # Endpointing: how long to wait after the learner stops talking
            # before treating the turn as complete. Tuned down from the 0.5s/
            # 3.0s defaults to fit the ~0.6-1s overall reply budget.
            "endpointing": {"min_delay": 0.3, "max_delay": 2.5},
            # Start generating (and speaking) before the turn is fully
            # confirmed where possible -- this is what makes "snappy" achievable
            # at all given STT + LLM + TTS round trips.
            "preemptive_generation": {"enabled": True, "preemptive_tts": True},
        },
    )

    turn_logger = TurnLogger(
        session_id=ctx.room.name,
        backend_url=cfg.backend_turns_url,
        backend_token=cfg.backend_turns_token,
    )

    @session.on("conversation_item_added")
    def _on_conversation_item(ev: ConversationItemAddedEvent) -> None:
        item = ev.item
        role = getattr(item, "role", None)
        text = getattr(item, "text_content", None)
        if role not in ("user", "assistant") or not text:
            return  # skip tool calls / handoffs / empty transcripts
        turn_logger.log_turn(role, text, level=level, scenario=scenario)

    agent = Agent(instructions=build_system_prompt(level, scenario))

    async def _cleanup() -> None:
        await turn_logger.aclose()

    ctx.add_shutdown_callback(_cleanup)

    await session.start(agent=agent, room=ctx.room)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
