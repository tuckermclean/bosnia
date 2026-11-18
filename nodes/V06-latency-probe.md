# V06 — latency-probe

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | V01, V03, V05 | none | S |

**Owns:** `voice-agent/latency_probe.py`

## Purpose

Imported from the code. `voice-agent/latency_probe.py` is a command-line tool that times each stage of the
voice pipeline on its own, against the ~0.6–1 s reply budget. It builds the providers with V05's builders and
the settings of `load_config(require_livekit=False)` (V03), so it needs no LiveKit room.

- STT: the time of one `recognize` call on a synthetic 1.2 s, 16 kHz sine-wave frame (a timing fixture, not
  speech).
- LLM: the time to the first streamed chunk for the user message "Pozdrav! Kako si danas?".
- TTS: the time to the first audio chunk for a fixed sentence.
- `--stage stt|llm|tts` (repeatable) picks stages, all three by default. A stage that fails reports
  `FAILED` with the error and no time.
- `--mock` makes no call and needs no key: it reports fixed figures (STT 0.30 s, LLM 0.25 s, TTS 0.20 s), each
  labelled `SIMULATED`.
- The report has one row per stage, then, when every stage has a time, their sum in milliseconds with a verdict
  (under 600 ms "under budget", up to 1000 ms "within budget", else "OVER budget") and a note when a stage was
  simulated; otherwise "sum: n/a". Without the required keys the live run prints the missing variable and a hint
  to use `--mock` on stderr and exits 1.

## Tests

None. CI compiles it (`python -m py_compile *.py`); nothing runs it.

## Changes

none: imported

## Gate

- **V06-AC-1** — `--mock` makes no network call, needs no key, and labels every figure `SIMULATED`, including a note under the sum. *Verify:* unpinned.
- **V06-AC-2** — `--stage` limits the run to the named stages; without it all three run. *Verify:* unpinned.
- **V06-AC-3** — The sum is printed only when every stage has a time, with the verdict against 600–1000 ms; otherwise the report says the sum is n/a. *Verify:* unpinned.
- **V06-AC-4** — A live run without the required keys exits 1 with the missing variable's name on stderr. *Verify:* unpinned.

## Risks

- It imports `agent` and `livekit.rtc` at the top, so even `--mock` needs the full dependency set (V01).
- The per-stage `SKIPPED` branches catch `ConfigError` from the builders, which never raise it (`load_config`
  raises first), so a missing key ends the whole run rather than skipping a stage; an unknown provider's
  `ValueError` is not caught at all.
- The TTS sentence is written without diacritics ("cemo vjezbati"), which is not the text the tutor speaks.
- The sum of separately measured stages is an upper-bound estimate, not a live call's latency (the module says
  so); the mock figures are not measurements.
