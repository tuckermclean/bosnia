"""Runtime configuration for the Ljiljan voice-agent worker.

All configuration comes from environment variables (see README.md for the
full list and `.env.example` at the repo root for shared naming). Required
values are validated LAZILY, inside `load_config()`, which is called from
`agent.py`'s `entrypoint`/`prewarm` -- NEVER at import time. That means:

    python -m py_compile agent.py config.py prompts.py turn_logger.py

and unit tests that only touch `prompts.py` work in an environment with zero
secrets configured. Only actually starting the worker (or calling
`load_config()`) requires real credentials.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    """Raised when required configuration is missing at the point of use.

    Deliberately a plain RuntimeError subclass (not a SystemExit / os._exit)
    so callers -- including tests -- can catch it and assert on the message.
    """


def _env(name: str, default: str | None = None) -> str | None:
    val = os.environ.get(name)
    return val if val not in (None, "") else default


def _require(name: str) -> str:
    val = _env(name)
    if not val:
        raise ConfigError(
            f"Missing required environment variable {name!r}. Set it in your "
            "shell or a .env file before starting the voice-agent worker "
            "(see voice-agent/README.md)."
        )
    return val


@dataclass(frozen=True)
class LiveKitConfig:
    url: str
    api_key: str
    api_secret: str


@dataclass(frozen=True)
class AzureTTSConfig:
    speech_key: str
    speech_region: str
    voice: str
    language: str = "bs-BA"


@dataclass(frozen=True)
class VoiceAgentConfig:
    livekit: LiveKitConfig
    azure_tts: AzureTTSConfig

    # Provider seams -- see agent.py's build_stt()/build_llm() for how these
    # are turned into concrete plugin instances.
    stt_provider: str
    llm_provider: str

    # Groq is the default backend for both STT (whisper-large-v3-turbo) and
    # the LLM (llama-3.3-70b-versatile) -- required only if actually selected.
    groq_api_key: str | None
    groq_stt_model: str
    groq_llm_model: str

    # Alternate providers, populated (and required) only when selected.
    deepgram_api_key: str | None
    openai_api_key: str | None
    openai_llm_model: str

    # Tutor behavior defaults.
    default_level: str

    # Optional, seamed backend integration for tutor_turns (see turn_logger.py).
    backend_turns_url: str | None
    backend_turns_token: str | None


def load_config(*, require_livekit: bool = True) -> VoiceAgentConfig:
    """Build the full runtime config.

    Raises ConfigError with a clear, actionable message if anything required
    by the *selected* providers is missing. Values needed only by providers
    that aren't selected (e.g. DEEPGRAM_API_KEY when STT_PROVIDER=groq) are
    never required.

    Args:
        require_livekit: pass False to skip validating LIVEKIT_* (used by
            latency_probe.py, which exercises STT/LLM/TTS directly and never
            touches a LiveKit room, so it has no business demanding LiveKit
            credentials just to run).
    """
    stt_provider = (_env("STT_PROVIDER", "groq") or "groq").lower()
    llm_provider = (_env("LLM_PROVIDER", "groq") or "groq").lower()

    if require_livekit:
        livekit = LiveKitConfig(
            url=_require("LIVEKIT_URL"),
            api_key=_require("LIVEKIT_API_KEY"),
            api_secret=_require("LIVEKIT_API_SECRET"),
        )
    else:
        livekit = LiveKitConfig(
            url=_env("LIVEKIT_URL", "") or "",
            api_key=_env("LIVEKIT_API_KEY", "") or "",
            api_secret=_env("LIVEKIT_API_SECRET", "") or "",
        )

    groq_api_key = _env("GROQ_API_KEY")
    if stt_provider == "groq" or llm_provider == "groq":
        groq_api_key = _require("GROQ_API_KEY")

    deepgram_api_key = None
    if stt_provider == "deepgram":
        deepgram_api_key = _require("DEEPGRAM_API_KEY")

    openai_api_key = None
    if llm_provider == "openai":
        openai_api_key = _require("OPENAI_API_KEY")

    azure_tts = AzureTTSConfig(
        speech_key=_require("AZURE_SPEECH_KEY"),
        speech_region=_require("AZURE_SPEECH_REGION"),
        voice=_env("AZURE_TTS_VOICE", "bs-BA-VesnaNeural") or "bs-BA-VesnaNeural",
    )

    return VoiceAgentConfig(
        livekit=livekit,
        azure_tts=azure_tts,
        stt_provider=stt_provider,
        llm_provider=llm_provider,
        groq_api_key=groq_api_key,
        groq_stt_model=_env("GROQ_STT_MODEL", "whisper-large-v3-turbo") or "whisper-large-v3-turbo",
        groq_llm_model=_env("GROQ_LLM_MODEL", "llama-3.3-70b-versatile") or "llama-3.3-70b-versatile",
        deepgram_api_key=deepgram_api_key,
        openai_api_key=openai_api_key,
        openai_llm_model=_env("OPENAI_LLM_MODEL", "gpt-4.1-mini") or "gpt-4.1-mini",
        default_level=(_env("TUTOR_DEFAULT_LEVEL", "A1") or "A1").upper(),
        backend_turns_url=_env("BACKEND_TURNS_URL"),
        backend_turns_token=_env("BACKEND_TURNS_TOKEN"),
    )
