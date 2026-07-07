"""Per-stage latency probe for the Ljiljan voice-agent pipeline.

Measures the three latencies that matter for the project's ~0.6-1s "feels
snappy" reply budget, each in isolation:

  * STT  -- time for one whole utterance round trip through the STT
            provider. Groq's whisper-large-v3-turbo API is chunked, not
            word-streaming, so this whole-request time IS the STT latency
            budget (there is no meaningful "first token" to measure instead).
  * LLM  -- time to the FIRST streamed chunk back from the LLM. This is what
            actually gates when TTS can start speaking.
  * TTS  -- time to the FIRST audio chunk out of the TTS provider. This is
            what gates when the learner hears anything at all.

These are reported separately, and their sum is reported as a distinct,
clearly-labeled number -- never conflated with true end-to-end pipeline
latency, because in the live AgentSession pipeline LLM-first-token and
TTS-first-audio overlap (streaming/preemptive TTS starts speaking the first
sentence while the LLM is still generating the rest of the reply). Summing
all three independently-measured stage latencies is a conservative
upper-bound estimate for tuning purposes, not a live measurement of the
running pipeline.

Usage:

    .venv/bin/python latency_probe.py               # live probe, needs real keys
    .venv/bin/python latency_probe.py --stage stt    # just one stage (repeatable)
    .venv/bin/python latency_probe.py --mock         # no network/keys required

Any stage whose required credentials are missing is reported as SKIPPED (not
silently dropped). --mock numbers are always clearly labeled SIMULATED --
never presented as if they were measured -- so a report can't be misread as
real production latency data. See config.ConfigError for the exact missing
variable when a live probe can't run.
"""

from __future__ import annotations

import argparse
import asyncio
import math
import struct
import sys
import time
from dataclasses import dataclass

from livekit import rtc

from agent import build_llm, build_stt, build_tts
from config import ConfigError, VoiceAgentConfig, load_config

# Published, order-of-magnitude figures used ONLY for --mock mode, when no
# live credentials are configured. These are NOT measurements of this
# pipeline -- they exist purely so the report format and budget math can be
# exercised end-to-end in an offline/CI environment. Replace with real
# numbers (via a live run) at the first opportunity; never quote these as
# production latency.
_MOCK_LATENCIES_S = {
    "stt": 0.30,  # Groq whisper-large-v3-turbo, short utterance, typical
    "llm": 0.25,  # first-token, fast hosted inference (Groq / OpenAI mini)
    "tts": 0.20,  # Azure Neural TTS, first audio chunk of first sentence
}

# The ~0.6-1s "feels snappy" budget from the project plan.
BUDGET_LOW_S = 0.6
BUDGET_HIGH_S = 1.0

_ALL_STAGES = ("stt", "llm", "tts")


@dataclass
class ProbeResult:
    stage: str
    measured: bool
    simulated: bool
    latency_s: float | None
    note: str


def _sample_utterance_frame(sample_rate: int = 16000, duration_s: float = 1.2) -> rtc.AudioFrame:
    """A synthetic sine-wave "utterance" for exercising the STT round trip.

    This measures REQUEST latency (network + model inference time for one
    chunked STT call), not transcription accuracy: the content is a pure
    tone, not speech, so the returned transcript is meaningless and may well
    be empty. That is fine and expected -- never use this signal as an
    accuracy/WER check, only as a timing fixture.
    """
    n = int(sample_rate * duration_s)
    amplitude = 3000
    freq_hz = 220.0
    samples = [
        int(amplitude * math.sin(2 * math.pi * freq_hz * (i / sample_rate))) for i in range(n)
    ]
    data = struct.pack("<%dh" % n, *samples)
    return rtc.AudioFrame(data=data, sample_rate=sample_rate, num_channels=1, samples_per_channel=n)


async def probe_stt(cfg: VoiceAgentConfig) -> ProbeResult:
    try:
        stt = build_stt(cfg)
    except ConfigError as e:
        return ProbeResult("stt", False, False, None, f"SKIPPED: {e}")

    frame = _sample_utterance_frame()
    start = time.perf_counter()
    try:
        await stt.recognize([frame])
    except Exception as e:  # noqa: BLE001 -- report the failure, don't crash the whole probe run
        return ProbeResult("stt", False, False, None, f"FAILED: {e!r}")
    finally:
        await stt.aclose()
    elapsed = time.perf_counter() - start
    return ProbeResult(
        "stt", True, False, elapsed, "whole-utterance round trip (chunked, not streaming)"
    )


async def probe_llm(cfg: VoiceAgentConfig) -> ProbeResult:
    from livekit.agents.llm import ChatContext

    try:
        llm = build_llm(cfg)
    except ConfigError as e:
        return ProbeResult("llm", False, False, None, f"SKIPPED: {e}")

    chat_ctx = ChatContext.empty()
    chat_ctx.add_message(role="user", content="Pozdrav! Kako si danas?")

    start = time.perf_counter()
    first_token_at: float | None = None
    stream = None
    try:
        stream = llm.chat(chat_ctx=chat_ctx)
        async for _chunk in stream:
            first_token_at = time.perf_counter()
            break
    except Exception as e:  # noqa: BLE001
        return ProbeResult("llm", False, False, None, f"FAILED: {e!r}")
    finally:
        if stream is not None:
            await stream.aclose()
        await llm.aclose()

    if first_token_at is None:
        return ProbeResult("llm", False, False, None, "no tokens streamed back")
    return ProbeResult("llm", True, False, first_token_at - start, "time to first streamed chunk")


async def probe_tts(cfg: VoiceAgentConfig) -> ProbeResult:
    try:
        tts = build_tts(cfg)
    except ConfigError as e:
        return ProbeResult("tts", False, False, None, f"SKIPPED: {e}")

    text = "Dobar dan! Danas cemo vjezbati bosanski jezik."
    start = time.perf_counter()
    first_audio_at: float | None = None
    stream = None
    try:
        stream = tts.synthesize(text)
        async for _audio in stream:
            first_audio_at = time.perf_counter()
            break
    except Exception as e:  # noqa: BLE001
        return ProbeResult("tts", False, False, None, f"FAILED: {e!r}")
    finally:
        if stream is not None:
            await stream.aclose()
        await tts.aclose()

    if first_audio_at is None:
        return ProbeResult("tts", False, False, None, "no audio chunks returned")
    return ProbeResult("tts", True, False, first_audio_at - start, "time to first audio chunk")


def _mock_result(stage: str) -> ProbeResult:
    return ProbeResult(
        stage,
        False,
        True,
        _MOCK_LATENCIES_S[stage],
        "SIMULATED -- not a real measurement (no credentials configured / --mock passed)",
    )


async def run(stages: list[str], mock: bool) -> list[ProbeResult]:
    if mock:
        return [_mock_result(s) for s in stages]

    cfg = load_config(require_livekit=False)
    probes = {"stt": probe_stt, "llm": probe_llm, "tts": probe_tts}
    return [await probes[stage](cfg) for stage in stages]


def _print_report(results: list[ProbeResult]) -> None:
    print(f"{'stage':<6} {'latency':>10}  status")
    print("-" * 70)
    total = 0.0
    all_measured = True
    any_simulated = False
    for r in results:
        if r.latency_s is not None:
            label = f"{r.latency_s * 1000:8.0f}ms"
            total += r.latency_s
        else:
            label = f"{'--':>10}"
            all_measured = False
        any_simulated = any_simulated or r.simulated
        kind = "SIMULATED" if r.simulated else ("measured" if r.measured else "skipped/failed")
        print(f"{r.stage:<6} {label}  [{kind}] {r.note}")

    print("-" * 70)
    if all_measured:
        if total < BUDGET_LOW_S:
            verdict = "under budget"
        elif total <= BUDGET_HIGH_S:
            verdict = "within budget"
        else:
            verdict = "OVER budget"
        print(
            f"sum (stt + llm-first-token + tts-first-audio): {total * 1000:.0f}ms "
            f"-- budget {BUDGET_LOW_S * 1000:.0f}-{BUDGET_HIGH_S * 1000:.0f}ms ({verdict})"
        )
        if any_simulated:
            print("NOTE: includes SIMULATED stage(s) -- this sum is not a real measurement.")
    else:
        print("sum: n/a -- at least one stage was skipped or failed (see notes above)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--stage",
        choices=_ALL_STAGES,
        action="append",
        dest="stages",
        help="probe only this stage (repeatable); default: all three",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="skip live calls entirely and print clearly-labeled SIMULATED figures",
    )
    args = parser.parse_args()
    stages = args.stages or list(_ALL_STAGES)

    try:
        results = asyncio.run(run(stages, args.mock))
    except ConfigError as e:
        print(
            f"Cannot run a live probe: {e}\nTry `python latency_probe.py --mock` instead.",
            file=sys.stderr,
        )
        sys.exit(1)

    _print_report(results)


if __name__ == "__main__":
    main()
